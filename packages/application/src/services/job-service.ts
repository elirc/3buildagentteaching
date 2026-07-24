import { prisma } from "@agentic-edu/db";
import { markDeadLettered, retryJob } from "@agentic-edu/domain";
import { AppError } from "../errors";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent } from "../audit";

export const jobService = {
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
