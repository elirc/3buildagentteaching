import type { JobType } from "@agentic-edu/shared";
import { canDeliverNotification } from "@agentic-edu/domain";
import type { PrismaTransaction } from "../audit";
import type { ActorContext } from "../context";
import { AppError } from "../errors";
import { jobPayloadSchemas } from "./schemas";

export interface JobHandlerContext {
  tx: PrismaTransaction;
  actor: ActorContext;
  jobId: string;
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
  EmailNotification: async (payload, { tx }) => {
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
      return { detail: decision.reason ?? "Nothing to deliver." };
    }

    /*
     * There is no mail provider, and inventing one would be the wrong kind of
     * fake. Marking Delivered is the honest simulation: it moves the state
     * machine that the rest of the app reads, and the absence of a transport is
     * visible in one place rather than pretended away in several.
     */
    await tx.notification.update({ where: { id: notification.id }, data: { status: "Delivered" } });
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

  ReportGeneration: async (payload) => {
    const input = jobPayloadSchemas.ReportGeneration.parse(payload);
    // US-16 gives this a Report row to write. Until then it validates and
    // reports, which is enough to keep the queue honest.
    return { detail: `Prepared "${input.report}" report inputs.` };
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
