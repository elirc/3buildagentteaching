import { Prisma, prisma } from "@agentic-edu/db";
import type { JobType } from "@agentic-edu/shared";
import { markDeadLettered, retryJob } from "@agentic-edu/domain";
import { AppError } from "../errors";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent, type PrismaTransaction } from "../audit";
import { notifyService } from "./notify-service";

export const jobService = {
  /**
   * The only way a BackgroundJob is created.
   *
   * Before this, nothing in the application enqueued anything — the queue was
   * eight rows from the seed that drained and never refilled.
   *
   * Takes an optional `tx` so a producer can enqueue inside the transaction of
   * the event that caused it. That matters: grading a submission and queueing
   * its recalculation must either both happen or neither, or the queue ends up
   * holding work for a grade that was rolled back.
   *
   * Idempotency is a no-op returning the existing row rather than an error. A
   * double-clicked button, a retried request, and a producer firing twice are
   * all normal, and none of them is a problem the caller should have to handle.
   */
  async enqueue(
    actor: ActorContext,
    input: {
      type: JobType;
      payload: Prisma.InputJsonValue;
      idempotencyKey: string;
      maxAttempts?: number;
      scheduledFor?: Date | null;
      relatedStudentId?: string | null;
      relatedTeacherId?: string | null;
      relatedClassSectionId?: string | null;
      relatedAssignmentId?: string | null;
    },
    tx?: PrismaTransaction
  ) {
    const client = tx ?? prisma;

    const existing = await client.backgroundJob.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) {
      /*
       * Only in-flight work is deduplicated. A Succeeded or DeadLettered job
       * with the same key is finished history — re-enqueueing the same weekly
       * digest next week must produce a new job, and blocking it forever would
       * be a far worse bug than an occasional duplicate.
       *
       * Callers that want per-period uniqueness put the period in the key,
       * which is why the seed uses "digest:student_maya:week_2026_21".
       */
      if (existing.status === "Queued" || existing.status === "Running" || existing.status === "Retrying") {
        return existing;
      }
    }

    const job = await client.backgroundJob.create({
      data: {
        type: input.type,
        status: "Queued",
        attempts: 0,
        maxAttempts: input.maxAttempts ?? 3,
        payload: input.payload,
        // Suffixed when a finished job already holds the key, so history is
        // kept and the unique constraint is respected.
        idempotencyKey: existing ? `${input.idempotencyKey}:${Date.now()}` : input.idempotencyKey,
        scheduledFor: input.scheduledFor ?? null,
        nextRunAt: input.scheduledFor ?? null,
        relatedStudentId: input.relatedStudentId ?? null,
        relatedTeacherId: input.relatedTeacherId ?? null,
        relatedClassSectionId: input.relatedClassSectionId ?? null,
        relatedAssignmentId: input.relatedAssignmentId ?? null
      }
    });

    await createAuditEvent(client, {
      actorUserId: actor.id,
      action: "job.enqueued",
      entityType: "BackgroundJob",
      entityId: job.id,
      after: job
    });

    return job;
  },


  async retryBackgroundJob(actor: ActorContext, id: string) {
    assertCan(actor, "job:retry");
    return prisma.$transaction(async (tx) => {
      const before = await tx.backgroundJob.findUniqueOrThrow({ where: { id } });
      const decision = retryJob({ status: before.status, attempts: before.attempts, maxAttempts: before.maxAttempts });
      if (!decision.allowed && decision.nextStatus !== "DeadLettered") {
        throw new AppError("CONFLICT", decision.reason ?? "Job cannot be retried.", { jobId: id });
      }
      const job = await tx.backgroundJob.update({
        where: { id },
        data: {
          status: decision.nextStatus,
          attempts: decision.attempts,
          nextRunAt: null,
          errorMessage: decision.nextStatus === "Queued" ? null : before.errorMessage
        }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "job.retried",
        entityType: "BackgroundJob",
        entityId: id,
        before,
        after: job
      });
      return job;
    });
  },

  async deadLetterBackgroundJob(actor: ActorContext, id: string) {
    assertCan(actor, "job:deadLetter");
    return prisma.$transaction(async (tx) => {
      const before = await tx.backgroundJob.findUniqueOrThrow({ where: { id } });
      const decision = markDeadLettered({ status: before.status, attempts: before.attempts, maxAttempts: before.maxAttempts });
      if (!decision.allowed) {
        throw new AppError("CONFLICT", decision.reason ?? "Job cannot be dead-lettered.", { jobId: id });
      }
      const job = await tx.backgroundJob.update({ where: { id }, data: { status: "DeadLettered", ignoredAt: new Date(), nextRunAt: null } });

      // A dead-lettered job is work that will never happen unless someone
      // intervenes. That is exactly the case worth interrupting an operator for.
      await notifyService.notify(
        actor,
        {
          type: "JobFailure",
          title: `${job.type} job dead-lettered`,
          body: job.errorMessage ?? "The job exhausted its retries.",
          candidates: await notifyService.staffCandidates(tx),
          metadata: { jobId: job.id }
        },
        tx
      );
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "job.deadLettered",
        entityType: "BackgroundJob",
        entityId: id,
        before,
        after: job
      });
      return job;
    });
  }
};
