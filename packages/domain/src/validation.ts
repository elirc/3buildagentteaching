import { z } from "zod";
import type {
  AcademicTermStatus,
  AgentRecommendationStatus,
  ApprovalStatus,
  AttendanceStatus,
  GuardianRelationship,
  InterventionStatus,
  SupportNoteVisibility
} from "@agentic-edu/shared";

export const teacherSchema = z.object({
  userId: z.string().optional().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  department: z.string().min(1),
  employmentStatus: z.enum(["Active", "OnLeave", "Inactive"]),
  subjectsTaught: z.array(z.string().min(1)).default([]),
  officeLocation: z.string().optional().nullable()
});

export const studentSchema = z.object({
  userId: z.string().optional().nullable(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email(),
  gradeLevel: z.number().int().min(1).max(12),
  enrollmentStatus: z.enum(["Active", "Probation", "Withdrawn", "Graduated"]),
  studentNumber: z.string().min(1),
  advisorId: z.string().optional().nullable()
});

/**
 * Creating a student requires a guardian; editing one does not.
 *
 * The asymmetry is the point. `Student.guardianName`/`guardianEmail` used to be
 * two ordinary columns on this schema, so every edit of a student's grade level
 * also re-submitted their guardian's email — which is how the denormalised copy
 * drifted away from the `Guardian` record in the first place. Guardians are now
 * edited through the guardian panel, which knows about primary links and
 * relationships, and this schema no longer mentions them at all.
 *
 * They survive on *create* because a student with no guardian is a student
 * nobody can be contacted about, and the create form is the only place where
 * requiring one costs the user nothing.
 */
export const guardianContactSchema = z.object({
  name: z.string().min(1, { message: "Guardian name is required." }),
  email: z.string().email({ message: "A valid guardian email is required." })
});

export const studentCreateSchema = studentSchema.extend({
  primaryGuardian: guardianContactSchema
});

export const courseSchema = z.object({
  code: z.string().min(2),
  title: z.string().min(1),
  description: z.string().min(1),
  subject: z.string().min(1),
  gradeLevel: z.number().int().min(1).max(12),
  creditHours: z.number().positive(),
  status: z.enum(["Draft", "Active", "Archived"])
});

export const classSectionSchema = z.object({
  courseId: z.string().min(1),
  teacherId: z.string().min(1),
  academicTermId: z.string().optional().nullable(),
  term: z.string().min(1),
  room: z.string().min(1),
  schedule: z.record(z.unknown()),
  capacity: z.number().int().min(1),
  status: z.enum(["Planned", "Active", "Completed", "Cancelled"])
});

export const assignmentSchema = z.object({
  classSectionId: z.string().min(1),
  gradingPeriodId: z.string().optional().nullable(),
  title: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["Homework", "Quiz", "Exam", "Project", "Discussion", "Lab", "Other"]),
  status: z.enum(["Draft", "Published", "Closed"]),
  dueDate: z.coerce.date(),
  pointsPossible: z.number().positive(),
  createdByTeacherId: z.string().min(1)
});

export const submissionSchema = z.object({
  assignmentId: z.string().min(1),
  studentId: z.string().min(1),
  status: z.enum(["NotStarted", "Submitted", "Late", "Missing", "Graded", "Returned"]),
  submittedAt: z.coerce.date().optional().nullable(),
  contentText: z.string().optional().nullable(),
  attachmentUrl: z.string().optional().nullable(),
  score: z.number().nonnegative().optional().nullable(),
  feedback: z.string().optional().nullable(),
  gradedByTeacherId: z.string().optional().nullable(),
  gradedAt: z.coerce.date().optional().nullable()
});

export const attendanceSchema = z.object({
  studentId: z.string().min(1),
  classSectionId: z.string().min(1),
  academicTermId: z.string().optional().nullable(),
  date: z.coerce.date(),
  status: z.enum(["Present", "Absent", "Tardy", "Excused"]),
  notes: z.string().optional().nullable(),
  recordedByTeacherId: z.string().min(1)
});

export const supportNoteSchema = z.object({
  studentId: z.string().min(1),
  authorUserId: z.string().min(1),
  visibility: z.enum(["TeacherOnly", "AdvisorOnly", "AdminOnly", "Shared"]),
  noteType: z.enum(["Academic", "Attendance", "Behavior", "FamilyCommunication", "Other"]),
  content: z.string().min(1)
});

export const interventionPlanSchema = z.object({
  studentId: z.string().min(1),
  createdByUserId: z.string().min(1),
  status: z.enum(["Draft", "Active", "Completed", "Cancelled"]),
  riskArea: z.enum(["Grades", "Attendance", "Engagement", "Behavior", "Other"]),
  summary: z.string().min(1),
  recommendedActions: z.array(z.string().min(1)).min(1),
  followUpDate: z.coerce.date()
});

/**
 * Standalone enum schemas.
 *
 * The object schemas above cover the big create/update forms. These cover the
 * small ones — the single-<select> actions like "approve this request" or
 * "close this term" — which previously reached Prisma through an `as never`
 * cast. `as never` silences the compiler without checking anything at runtime,
 * so an unexpected string went straight to the database driver and surfaced as
 * a Prisma error rather than a message anyone could act on.
 *
 * Each of these is the single source of truth for its enum at the action
 * boundary. They intentionally restate the Prisma enums rather than importing
 * them: `packages/domain` must not depend on generated Prisma types, or the
 * pure layer stops being pure and every test above it needs a client.
 *
 * The `satisfies readonly X[]` clauses are what stop the restatement drifting.
 * A typo like "Cancelledd", or a value deleted from the shared union, fails to
 * compile here rather than at runtime in a form nobody tests.
 */
const interventionStatuses = ["Draft", "Active", "Completed", "Cancelled"] as const satisfies readonly InterventionStatus[];
const academicTermStatuses = ["Planned", "Active", "Closed", "Archived"] as const satisfies readonly AcademicTermStatus[];
const guardianRelationships = ["Mother", "Father", "Guardian", "Grandparent", "Other"] as const satisfies readonly GuardianRelationship[];
const supportNoteVisibilities = ["TeacherOnly", "AdvisorOnly", "AdminOnly", "Shared"] as const satisfies readonly SupportNoteVisibility[];
const attendanceStatuses = ["Present", "Absent", "Tardy", "Excused"] as const satisfies readonly AttendanceStatus[];

export const interventionStatusSchema = z.enum(interventionStatuses);
export const academicTermStatusSchema = z.enum(academicTermStatuses);
export const guardianRelationshipSchema = z.enum(guardianRelationships);
export const supportNoteVisibilitySchema = z.enum(supportNoteVisibilities);
export const attendanceStatusSchema = z.enum(attendanceStatuses);

/**
 * Approvals and recommendations are *decided*, not freely set: a reviewer may
 * only move a pending request to a terminal state. The starting states
 * ("Requested" / "Proposed") are deliberately excluded, which is why these are
 * typed as Exclude<...> rather than the full union — a form that tries to move
 * a decision backwards fails to compile.
 *
 * This is a guard rail, not the rule. The actual transition legality still
 * lives in canTransitionApproval() in ./approvals.ts, because "you may not
 * re-decide something already decided" is a business rule, not a parse error.
 */
const approvalDecisions = ["Approved", "Rejected", "Cancelled"] as const satisfies readonly Exclude<ApprovalStatus, "Requested">[];
const recommendationDecisions = ["Approved", "Rejected", "Completed"] as const satisfies readonly Exclude<AgentRecommendationStatus, "Proposed">[];

export const approvalDecisionSchema = z.enum(approvalDecisions);
export const recommendationDecisionSchema = z.enum(recommendationDecisions);

/**
 * Retention window for the /logs purge control.
 *
 * `z.coerce.number()` because a form field is always a string, and the
 * `.int().positive()` pair is what stops the two inputs that actually get typed
 * into this box from reaching the delete: an empty field (which coerces to 0,
 * meaning "everything") and "7 days" (which coerces to NaN). The upper bound
 * mirrors MAX_LOG_RETENTION_DAYS in ./log-retention.ts — the schema rejects the
 * shape, the domain rule owns the policy, and the service checks the rule
 * regardless of who called it.
 */
export const logRetentionDaysSchema = z.coerce
  .number({ message: "Retention must be a number of days." })
  .int({ message: "Retention must be a whole number of days." })
  .min(1, { message: "Retention must be at least 1 day." })
  .max(365, { message: "Retention cannot exceed 365 days." });

export type InterventionStatusInput = z.infer<typeof interventionStatusSchema>;
export type AcademicTermStatusInput = z.infer<typeof academicTermStatusSchema>;
export type GuardianRelationshipInput = z.infer<typeof guardianRelationshipSchema>;
export type ApprovalDecisionInput = z.infer<typeof approvalDecisionSchema>;
export type RecommendationDecisionInput = z.infer<typeof recommendationDecisionSchema>;

export type TeacherInput = z.infer<typeof teacherSchema>;
export type StudentInput = z.infer<typeof studentSchema>;
export type StudentCreateInput = z.infer<typeof studentCreateSchema>;
export type GuardianContactInput = z.infer<typeof guardianContactSchema>;
export type CourseInput = z.infer<typeof courseSchema>;
export type ClassSectionInput = z.infer<typeof classSectionSchema>;
export type AssignmentInput = z.infer<typeof assignmentSchema>;
export type SubmissionInput = z.infer<typeof submissionSchema>;
export type AttendanceInput = z.infer<typeof attendanceSchema>;
export type SupportNoteInput = z.infer<typeof supportNoteSchema>;
export type InterventionPlanInput = z.infer<typeof interventionPlanSchema>;
