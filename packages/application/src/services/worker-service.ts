import { prisma } from "@agentic-edu/db";
import { calculateNextRetryAt, canAcquireJobLock } from "@agentic-edu/domain";
import { createAuditEvent } from "../audit";
import { assertCan, type ActorContext } from "../context";
import { AppError } from "../errors";

function simulateJobFailure(job: { type: string; payload: unknown; errorMessage?: string | null }): string | null {
  const payloadText = JSON.stringify(job.payload ?? {});
  const existingError = job.errorMessage?.toLowerCase() ?? "";

  if (payloadText.includes("{bad-json") || existingError.includes("malformed")) {
    return "Worker rejected malformed payload.";
  }

  if (payloadText.includes("null") || existingError.includes("invalid")) {
    return "Worker rejected invalid required payload fields.";
  }

  if (existingError.includes("permission")) {
    return "Worker lacks permission for the requested operation.";
  }

  if (job.type === "ReportGeneration" && existingError.includes("timeout")) {
    return "Report generation exceeded deterministic timeout threshold.";
  }

  return null;
}

export const workerService = {
  async runNextJob(actor: ActorContext) {
    assertCan(actor, "job:runWorker");
    const now = new Date();
    const workerId = `local-worker:${actor.id}`;

    return prisma.$transaction(async (tx) => {
      const job = await tx.backgroundJob.findFirst({
        where: {
          status: { in: ["Queued", "Retrying"] },
          OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }]
        },
        include: { workerLock: true },
        orderBy: [{ createdAt: "asc" }]
      });

      if (!job) {
        return null;
      }

      const lockDecision = canAcquireJobLock({
        status: job.status,
        lockedAt: job.workerLock?.lockedAt,
        lockExpiresAt: job.workerLock?.expiresAt,
        now
      });
      if (!lockDecision.allowed) {
        throw new AppError("CONFLICT", lockDecision.reason ?? "Job cannot be locked.", { jobId: job.id });
      }

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
        data: {
          status: "Running",
          startedAt: now,
          lockedAt: now,
          lockOwner: workerId
        }
      });

      const failure = simulateJobFailure(job);
      const finalStatus = failure ? (job.attempts + 1 >= job.maxAttempts ? "DeadLettered" : "Failed") : "Succeeded";
      const finished = await tx.backgroundJob.update({
        where: { id: job.id },
        data: {
          status: finalStatus,
          attempts: failure ? job.attempts + 1 : job.attempts,
          errorMessage: failure,
          nextRunAt: failure && finalStatus === "Failed" ? calculateNextRetryAt(now, job.attempts + 1) : null,
          finishedAt: new Date(),
          lockedAt: null,
          lockOwner: null
        }
      });

      await tx.workerLock.delete({ where: { jobId: job.id } });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "job.workerRan",
        entityType: "BackgroundJob",
        entityId: job.id,
        before: running,
        after: finished,
        metadata: { workerId, failure }
      });

      return finished;
    });
  }
};
