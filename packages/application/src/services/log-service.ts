import { prisma } from "@agentic-edu/db";
import { decideLogRetention } from "@agentic-edu/domain";
import { createAuditEvent } from "../audit";
import { assertCan, type ActorContext } from "../context";
import { AppError } from "../errors";
import { withServiceLogging } from "../logging";

export const logService = withServiceLogging("log-service", {
  /**
   * Deletes structured logs older than `days`.
   *
   * Now that the app writes a log line for every service call, a long-lived
   * development database grows without limit — the table this exists to keep
   * useful is the one most able to fill a disk. Retention is the boring answer
   * and the correct one.
   *
   * The audit event is the point of the transaction. A deletion that leaves no
   * record of who deleted what is indistinguishable from data loss, and "the
   * logs are gone" is exactly the situation where someone needs to know whether
   * that was a person or a fault. The AuditEvent survives in a different table,
   * so it outlives the rows it describes.
   *
   * `now` is injected so the cutoff arithmetic can be tested against a fixed
   * clock instead of whatever the calendar says while CI runs.
   */
  async purgeOlderThan(actor: ActorContext, days: number, now: Date = new Date()) {
    assertCan(actor, "log:manage");

    const decision = decideLogRetention(days, now);
    if (!decision.valid || !decision.cutoff) {
      throw new AppError("VALIDATION_ERROR", decision.reason ?? "Invalid retention window.", { days });
    }
    const cutoff = decision.cutoff;

    return prisma.$transaction(async (tx) => {
      const removed = await tx.structuredLog.deleteMany({ where: { timestamp: { lt: cutoff } } });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "log.purged",
        entityType: "StructuredLog",
        // There is no single row to point at; the cutoff is what identifies the
        // batch, so it goes in the id slot rather than being invented as one.
        entityId: `older-than:${cutoff.toISOString()}`,
        after: { removedCount: removed.count, cutoff: cutoff.toISOString(), retentionDays: days }
      });
      return { removed: removed.count, cutoff };
    });
  }
});
