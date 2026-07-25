import { z } from "zod";
import type { JobType } from "@agentic-edu/shared";

/**
 * One payload schema per job type.
 *
 * Before this, a worker "validated" payloads by string-matching for the literal
 * "{bad-json" and the word "null" (see the deleted simulateJobFailure). That is
 * not validation; it is a demo pretending to be one, and it meant every real
 * payload was trusted completely.
 *
 * Parsing at the handler boundary means a malformed payload fails with a
 * message naming the field, and the Failed Job Investigation agent gets real
 * evidence to summarise instead of a hardcoded string.
 *
 * Note the seeded "broken" jobs still fail after this change — job_grade_invalid
 * carries `{ assignmentId: null }` and job_attendance_malformed carries
 * `{ range: "{bad-json" }`. Both now fail *because the schema rejects them*,
 * which is both honest and keeps the seed's demonstration intact.
 */
export const jobPayloadSchemas = {
  EmailNotification: z.object({
    notificationId: z.string().min(1),
    recipient: z.string().email()
  }),
  GradeRecalculation: z.object({
    // The seeded failure case sends null here; .min(1) is what rejects it.
    assignmentId: z.string().min(1).optional(),
    classSectionId: z.string().min(1).optional()
  }).refine((value) => value.assignmentId || value.classSectionId, {
    message: "Grade recalculation needs an assignment or a section."
  }),
  AttendanceSummary: z.object({
    studentId: z.string().min(1),
    // The seeded failure sends "{bad-json". A date-shaped string is required.
    range: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\.\d{4}-\d{2}-\d{2}$/, {
      message: "Range must look like YYYY-MM-DD..YYYY-MM-DD."
    })
  }),
  ReportGeneration: z.object({
    report: z.string().min(1),
    sectionId: z.string().min(1).optional()
  }),
  EnrollmentSync: z.object({
    sectionId: z.string().min(1)
  }),
  GuardianDigest: z.object({
    studentId: z.string().min(1),
    guardianEmail: z.string().email().optional()
  }),
  AgentRun: z.object({
    agentType: z.enum([
      "StudentProgressSummary",
      "AtRiskStudentDetection",
      "AttendanceAnomaly",
      "TeacherWorkloadInsight",
      "GuardianCommunicationDraft",
      "GradingConsistency",
      "StudentSuccessReview"
    ]),
    targetId: z.string().min(1)
  })
} satisfies Record<JobType, z.ZodTypeAny>;

export type JobPayload<T extends JobType> = z.infer<(typeof jobPayloadSchemas)[T]>;
