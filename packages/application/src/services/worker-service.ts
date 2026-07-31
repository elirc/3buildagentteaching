import { prisma } from "@agentic-edu/db";
import { calculateNextRetryAt, canAcquireJobLock } from "@agentic-edu/domain";
import { createAuditEvent } from "../audit";
import { assertCan, type ActorContext } from "../context";
import { AppError } from "../errors";
import { getJobHandler } from "../jobs/handlers";
import { jobPayloadSchemas } from "../jobs/schemas";
import { agentRunService } from "./agent-run-service";
import { serviceLogger, withServiceLogging } from "../logging";

/**
 * Turns whatever a handler threw into a message worth storing.
 *
 * ZodError is detected structurally rather than with instanceof, for the same
 * reason actionFailure does it: duplicate copies of a library in a monorepo
 * break identity checks, and the failure mode is a catch block that silently
 * does not catch.
 */
function describeFailure(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const candidate = error as { name?: unknown; issues?: unknown; userMessage?: unknown; message?: unknown };
    if (candidate.name === "ZodError" && Array.isArray(candidate.issues)) {
      const issue = candidate.issues[0] as { message?: string; path?: unknown[] } | undefined;
      const field = Array.isArray(issue?.path) && issue.path.length > 0 ? `${issue.path[0]}: ` : "";
      return `Invalid payload — ${field}${issue?.message ?? "failed validation"}`;
    }
    if (typeof candidate.userMessage === "string") return candidate.userMessage;
    if (typeof candidate.message === "string") return candidate.message;
  }
  return "Unknown worker error";
}

/*
 * Named rather than wrapped inline because `runNextBatch` calls
 * `this.runNextJob`. See withServiceLogging: a literal passed straight into it
 * is contextually typed by the generic constraint, which makes `this.x` resolve
 * through an index signature and stop compiling.
 */
const workerServiceMethods = {
  /**
   * Processes the next runnable job.
   *
   * The old version called simulateJobFailure, which string-matched payloads for
   * "{bad-json" and the word "null" to decide whether to fail. That was a demo
   * wearing a worker's clothes: every real payload was trusted completely and no
   * job type did anything at all.
   *
   * Now it dispatches to a typed handler whose first act is to parse its
   * payload. The seeded broken jobs still fail — because their payloads are
   * genuinely invalid — so the Failed Job Investigation demo survives while
   * becoming true.
   */
  async runNextJob(actor: ActorContext) {
    assertCan(actor, "job:runWorker");
    const now = new Date();
    const workerId = `local-worker:${actor.id}`;
    /*
     * Job lifecycle lines are written from inside the transaction below, which
     * looks like a violation of "log outside the transaction" and is not: the
     * sink writes on its own connection, so it can neither hold this
     * transaction open nor be rolled back with it. That last part is the point.
     * A "Job started" line that survives a rolled-back job is precisely what
     * tells an on-call engineer the worker picked the job up and then died —
     * the case where logging inside the transaction and losing the line would
     * leave no trace at all.
     *
     * entityType is "Job", not "BackgroundJob", because that is what
     * runFailedJobInvestigationAgent searches for. Agreeing with the reader is
     * more useful here than agreeing with the model name.
     */
    const log = serviceLogger("job-runner", actor);

    const outcome = await prisma.$transaction(async (tx) => {
      const job = await tx.backgroundJob.findFirst({
        where: {
          status: { in: ["Queued", "Retrying"] },
          OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }]
        },
        include: { workerLock: true },
        orderBy: [{ createdAt: "asc" }]
      });

      if (!job) return null;

      const lockDecision = canAcquireJobLock({
        status: job.status,
        lockedAt: job.workerLock?.lockedAt,
        lockExpiresAt: job.workerLock?.expiresAt,
        now
      });
      if (!lockDecision.allowed) {
        throw new AppError("CONFLICT", lockDecision.reason ?? "Job cannot be locked.", { jobId: job.id });
      }

      // An expired lock is reclaimed. Without this a worker that died mid-job
      // would strand it forever, which is the classic queue failure.
      if (job.workerLock) {
        await tx.workerLock.delete({ where: { jobId: job.id } });
      }
      await tx.workerLock.create({
        data: {
          jobId: job.id,
          lockedBy: workerId,
          lockedAt: now,
          expiresAt: new Date(now.getTime() + 5 * 60 * 1000)
        }
      });

      const running = await tx.backgroundJob.update({
        where: { id: job.id },
        data: { status: "Running", startedAt: now }
      });

      log.info("Job started", {
        entityType: "Job",
        entityId: job.id,
        metadata: { jobType: job.type, attempt: job.attempts + 1, maxAttempts: job.maxAttempts, workerId }
      });

      let failure: string | null = null;
      let detail = "";
      try {
        const result = await getJobHandler(job.type)(job.payload, { tx, actor, jobId: job.id, log });
        detail = result.detail;
      } catch (error) {
        failure = describeFailure(error);
      }

      const finalStatus = failure ? (job.attempts + 1 >= job.maxAttempts ? "DeadLettered" : "Failed") : "Succeeded";
      const finished = await tx.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: finalStatus,
          attempts: failure ? job.attempts + 1 : job.attempts,
          errorMessage: failure,
          nextRunAt: failure && finalStatus === "Failed" ? calculateNextRetryAt(now, job.attempts + 1) : null,
          finishedAt: new Date()
        }
      });

      if (failure) {
        /*
         * The message says which of the two failure states this is but not why —
         * the reason is `failureReason` in metadata. Putting the error text in
         * the message would give every distinct error its own fingerprint, and
         * the /logs grouping panel exists to answer "how many times did this
         * happen", not "how many different sentences have we produced".
         */
        log.error(finalStatus === "DeadLettered" ? "Job dead-lettered" : "Job failed", {
          entityType: "Job",
          entityId: job.id,
          metadata: { jobType: job.type, attempt: finished.attempts, maxAttempts: job.maxAttempts, failureReason: failure }
        });
      } else {
        log.info("Job succeeded", {
          entityType: "Job",
          entityId: job.id,
          metadata: { jobType: job.type, attempt: finished.attempts, detail }
        });
      }

      await tx.workerLock.delete({ where: { jobId: job.id } });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "job.workerRan",
        entityType: "BackgroundJob",
        entityId: job.id,
        before: running,
        after: finished,
        metadata: { workerId, failure, detail }
      });

      return { job: finished, succeeded: !failure };
    });

    if (!outcome) return null;

    /*
     * Agent dispatch happens AFTER the transaction closes, never inside it.
     *
     * agentRunService opens its own transactions to record Running -> Succeeded.
     * Nesting them inside the worker's would tie the agent run's fate to the
     * job's — a failed job would roll back the very AgentRun row that explains
     * why it failed, which is exactly backwards.
     *
     * The cost: an agent that throws leaves the job marked Succeeded. That is
     * the right trade, because the AgentRun row records its own failure and is
     * visible at /agent-runs. The job's success means "the request was
     * dispatched", which is true.
     */
    if (outcome.succeeded && outcome.job.type === "AgentRun") {
      const payload = jobPayloadSchemas.AgentRun.parse(outcome.job.payload);
      await dispatchAgent(actor, payload.agentType, payload.targetId);
    }

    return outcome.job;
  },

  /**
   * Drains up to `limit` jobs.
   *
   * Stops at the first empty queue rather than looping the full count, so a
   * "Run 10" click on a queue of two does two units of work instead of eight
   * pointless round-trips.
   */
  async runNextBatch(actor: ActorContext, limit = 10) {
    assertCan(actor, "job:runWorker");
    const processed = [];
    for (let index = 0; index < limit; index += 1) {
      const job = await this.runNextJob(actor);
      if (!job) break;
      processed.push(job);
    }
    return processed;
  },

  /**
   * Promotes scheduled jobs whose time has come.
   *
   * Without a real scheduler, `scheduledFor` in the past would otherwise sit
   * untouched: runNextJob only considers Queued/Retrying rows whose nextRunAt
   * has passed, and a job scheduled for later has a future nextRunAt by design.
   */
  async releaseDueJobs(actor: ActorContext, now: Date = new Date()) {
    assertCan(actor, "job:runWorker");
    const result = await prisma.backgroundJob.updateMany({
      where: { status: "Queued", nextRunAt: { lte: now, not: null } },
      data: { nextRunAt: null }
    });
    return result.count;
  }
};

export const workerService = withServiceLogging("worker-service", workerServiceMethods);

async function dispatchAgent(actor: ActorContext, agentType: string, targetId: string) {
  switch (agentType) {
    case "StudentProgressSummary":
      return agentRunService.runStudentProgressAgent(actor, targetId);
    case "AtRiskStudentDetection":
      return agentRunService.runAtRiskAgent(actor, targetId);
    case "AttendanceAnomaly":
      return agentRunService.runAttendanceAnomalyAgent(actor, { targetType: "Student", targetId });
    case "TeacherWorkloadInsight":
      return agentRunService.runTeacherWorkloadAgent(actor, targetId);
    case "GuardianCommunicationDraft":
      return agentRunService.runGuardianCommunicationDraftAgent(actor, targetId);
    case "GradingConsistency":
      return agentRunService.runGradingConsistencyAgent(actor, targetId);
    case "StudentSuccessReview":
      return agentRunService.runStudentSuccessReviewAgent(actor, targetId);
    default:
      // Unreachable: the payload schema restricts agentType to the cases above.
      // Kept so adding a value to that enum without a case here is loud.
      throw new AppError("VALIDATION_ERROR", `No dispatcher for agent type ${agentType}.`, { agentType });
  }
}
