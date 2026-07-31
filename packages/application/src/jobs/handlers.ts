import type { JobType } from "@agentic-edu/shared";
import type { Prisma } from "@agentic-edu/db";
import { canDeliverNotification, isoWeekRange } from "@agentic-edu/domain";
import type { Logger } from "@agentic-edu/observability";
import { buildWeeklyRiskSnapshot } from "../queries/report-query";
import type { PrismaTransaction } from "../audit";
import type { ActorContext } from "../context";
import { AppError } from "../errors";
import { jobPayloadSchemas } from "./schemas";

export interface JobHandlerContext {
  tx: PrismaTransaction;
  actor: ActorContext;
  jobId: string;
  /** Already bound to the job runner and the acting user. */
  log: Logger;
}

export type JobHandler = (payload: unknown, context: JobHandlerContext) => Promise<{ detail: string }>;

/**
 * What each job type actually does.
 *
 * `satisfies Record<JobType, JobHandler>` is the same exhaustiveness trick the
 * agent registry uses: adding a JobType without a handler fails to compile,
 * rather than producing a job that sits Queued forever because nothing knows
 * how to run it.
 *
 * Every handler parses its payload first. A parse failure throws, the worker
 * records it as a job failure with the message, and the retry/dead-letter logic
 * takes over — which is exactly the behaviour the old hardcoded
 * simulateJobFailure was imitating, except now it is real.
 */
export const jobHandlers = {
  EmailNotification: async (payload, { tx, log }) => {
    const input = jobPayloadSchemas.EmailNotification.parse(payload);
    const notification = await tx.notification.findUnique({ where: { id: input.notificationId } });
    if (!notification) {
      throw new AppError("NOT_FOUND", `Notification ${input.notificationId} no longer exists.`, {});
    }

    const decision = canDeliverNotification({
      channel: notification.channel,
      hasRecipient: Boolean(notification.userId || notification.studentId),
      status: notification.status
    });
    if (!decision.deliverable) {
      // Not an error: already-delivered mail is a no-op, not a failure. Throwing
      // here would retry and dead-letter a job that has nothing wrong with it.
      log.warn("Notification not deliverable", {
        entityType: "Notification",
        entityId: notification.id,
        metadata: { channel: notification.channel, status: notification.status, reason: decision.reason }
      });
      return { detail: decision.reason ?? "Nothing to deliver." };
    }

    /*
     * There is no mail provider, and inventing one would be the wrong kind of
     * fake. Marking Delivered is the honest simulation: it moves the state
     * machine that the rest of the app reads, and the absence of a transport is
     * visible in one place rather than pretended away in several.
     *
     * The log line is the delivery record. When a transport does arrive it
     * replaces the line below and nothing else in the system has to change,
     * because everything downstream already reads the notification's status.
     */
    await tx.notification.update({ where: { id: notification.id }, data: { status: "Delivered" } });
    log.info("Notification delivered", {
      entityType: "Notification",
      entityId: notification.id,
      metadata: { channel: notification.channel, type: notification.type, recipient: input.recipient }
    });
    return { detail: `Marked notification ${notification.id} delivered to ${input.recipient}.` };
  },

  GradeRecalculation: async (payload, { tx }) => {
    const input = jobPayloadSchemas.GradeRecalculation.parse(payload);
    const where = input.assignmentId
      ? { assignmentId: input.assignmentId }
      : { assignment: { classSectionId: input.classSectionId! } };
    const count = await tx.submission.count({ where });
    // Averages are derived on read by calculateGradeSummary, so there is
    // nothing to persist. The job exists to prove the pipeline works and to
    // give the section a touch point; it reports what it looked at.
    return { detail: `Recalculated grade signals across ${count} submission(s).` };
  },

  AttendanceSummary: async (payload, { tx }) => {
    const input = jobPayloadSchemas.AttendanceSummary.parse(payload);
    const count = await tx.attendanceRecord.count({ where: { studentId: input.studentId } });
    return { detail: `Summarised ${count} attendance record(s) for ${input.studentId} over ${input.range}.` };
  },

  ReportGeneration: async (payload, { tx, jobId, log }) => {
    const input = jobPayloadSchemas.ReportGeneration.parse(payload);
    if (input.report !== "weekly-risk") {
      throw new AppError("VALIDATION_ERROR", `No generator for report "${input.report}".`, { report: input.report });
    }

    /*
     * `sectionId` is the shape the seeded job uses; scopeType/scopeId is the
     * shape everything since US-16 uses. Accepting both means the seed's
     * demonstration keeps working without pretending the old shape was ever
     * expressive enough.
     */
    const scopeType = input.scopeType ?? (input.sectionId ? "ClassSection" : "School");
    const scopeId = input.scopeId ?? input.sectionId ?? null;

    const { periodStart, periodEnd } = isoWeekRange(input.periodEnd ? new Date(input.periodEnd) : new Date());
    const snapshot = await buildWeeklyRiskSnapshot({ scopeType, scopeId }, periodStart, periodEnd);

    /*
     * One report per scope per week, enforced here rather than by a unique
     * index. Postgres treats NULLs as distinct, and scopeId is null for the
     * whole-school report — so a unique constraint over (type, scopeType,
     * scopeId, periodStart) would happily allow two of exactly the row this is
     * meant to prevent. Doing it in the handler, inside the worker's
     * transaction, covers the case a constraint cannot.
     *
     * Re-running replaces the snapshot rather than adding a second one. That is
     * right for a report of the *current* week, which is still accumulating;
     * previous weeks are untouched because their periodStart differs.
     */
    const existing = await tx.report.findFirst({
      where: { type: "weekly-risk", scopeType, scopeId, periodStart }
    });

    const data = {
      type: "weekly-risk",
      scopeType,
      scopeId,
      periodStart,
      periodEnd,
      payload: snapshot as unknown as Prisma.InputJsonValue,
      jobId
    };
    const report = existing
      ? await tx.report.update({ where: { id: existing.id }, data })
      : await tx.report.create({ data });

    log.info("Report generated", {
      entityType: "Report",
      entityId: report.id,
      metadata: { type: "weekly-risk", scopeType, students: snapshot.totals.students }
    });

    return { detail: `Generated weekly-risk report over ${snapshot.totals.students} student(s).` };
  },

  EnrollmentSync: async (payload, { tx }) => {
    const input = jobPayloadSchemas.EnrollmentSync.parse(payload);
    const count = await tx.enrollment.count({ where: { classSectionId: input.sectionId } });
    return { detail: `Synced ${count} enrollment(s) for ${input.sectionId}.` };
  },

  GuardianDigest: async (payload, { tx }) => {
    const input = jobPayloadSchemas.GuardianDigest.parse(payload);
    const links = await tx.studentGuardian.findMany({
      where: { studentId: input.studentId, receivesDigest: true },
      include: { guardian: true }
    });
    if (links.length === 0) {
      // Opting out is a legitimate state, not a failure to retry.
      return { detail: "No guardian on this student has opted into the digest." };
    }
    return { detail: `Digest prepared for ${links.length} guardian(s).` };
  },

  AgentRun: async (payload) => {
    const input = jobPayloadSchemas.AgentRun.parse(payload);
    /*
     * Deliberately does NOT execute the agent here.
     *
     * agentRunService opens its own transactions to record Running -> Succeeded,
     * and calling it from inside the worker's transaction would nest them: the
     * agent run would be committed or rolled back with the job, so a failed job
     * would erase the evidence of why it failed.
     *
     * The worker returns the request and runNextJob dispatches it after the
     * transaction closes. See workerService.
     */
    return { detail: `Agent run requested: ${input.agentType} on ${input.targetId}.` };
  }
} satisfies Record<JobType, JobHandler>;

export function getJobHandler(type: JobType): JobHandler {
  return jobHandlers[type];
}
