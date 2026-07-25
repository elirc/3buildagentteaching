export type UserRole =
  | "Admin"
  | "SchoolManager"
  | "Teacher"
  | "Student"
  | "Advisor"
  | "Guardian"
  | "Viewer";

export type EmploymentStatus = "Active" | "OnLeave" | "Inactive";
export type StudentEnrollmentStatus = "Active" | "Probation" | "Withdrawn" | "Graduated";
export type CourseStatus = "Draft" | "Active" | "Archived";
export type ClassSectionStatus = "Planned" | "Active" | "Completed" | "Cancelled";
export type AcademicTermStatus = "Planned" | "Active" | "Closed" | "Archived";
export type EnrollmentStatus = "Enrolled" | "Dropped" | "Completed" | "Waitlisted";
export type AssignmentType = "Homework" | "Quiz" | "Exam" | "Project" | "Discussion" | "Lab" | "Other";
export type AssignmentStatus = "Draft" | "Published" | "Closed";
export type SubmissionStatus = "NotStarted" | "Submitted" | "Late" | "Missing" | "Graded" | "Returned";
export type AttendanceStatus = "Present" | "Absent" | "Tardy" | "Excused";
export type SupportNoteVisibility = "TeacherOnly" | "AdvisorOnly" | "AdminOnly" | "Shared";
export type SupportNoteType = "Academic" | "Attendance" | "Behavior" | "FamilyCommunication" | "Other";
export type InterventionStatus = "Draft" | "Active" | "Completed" | "Cancelled";
export type RiskArea = "Grades" | "Attendance" | "Engagement" | "Behavior" | "Other";
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";
export type PerformanceBand = "Excellent" | "Good" | "Warning" | "AtRisk" | "InsufficientData";
export type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";
export type AppEnvironment = "development" | "staging" | "production";
export type JobType =
  | "EmailNotification"
  | "GradeRecalculation"
  | "AttendanceSummary"
  | "ReportGeneration"
  | "EnrollmentSync"
  | "GuardianDigest"
  | "AgentRun";
export type JobStatus = "Queued" | "Running" | "Succeeded" | "Failed" | "Retrying" | "DeadLettered";
export type AgentType =
  | "StudentProgressSummary"
  | "AtRiskStudentDetection"
  | "AssignmentFeedback"
  | "AttendanceAnomaly"
  | "TeacherWorkloadInsight"
  | "FailedJobInvestigation"
  | "GuardianCommunicationDraft"
  | "GradingConsistency"
  | "StudentSuccessReview";
export type AgentRunStatus = "Pending" | "Running" | "Succeeded" | "Failed";
export type AgentTargetType =
  | "Student"
  | "Teacher"
  | "ClassSection"
  | "Assignment"
  | "Submission"
  | "LogGroup"
  | "Job";

export type GuardianRelationship = "Mother" | "Father" | "Guardian" | "Grandparent" | "Other";
export type NotificationChannel = "InApp" | "Email" | "Digest";
export type NotificationType =
  | "AssignmentDue"
  | "GradePosted"
  | "AttendanceConcern"
  | "InterventionUpdate"
  | "JobFailure"
  | "AgentRecommendation";
export type NotificationStatus = "Queued" | "Delivered" | "Read" | "Failed";
export type ApprovalStatus = "Requested" | "Approved" | "Rejected" | "Cancelled";
export type AgentRecommendationStatus = "Proposed" | "Approved" | "Rejected" | "Completed";

export const ROLE_LABELS: Record<UserRole, string> = {
  Admin: "Admin",
  SchoolManager: "School Manager",
  Teacher: "Teacher",
  Student: "Student",
  Advisor: "Advisor",
  Guardian: "Parent/Guardian",
  Viewer: "Viewer"
};

export const WRITE_ROLES: UserRole[] = ["Admin", "SchoolManager"];
export const SUPPORT_ROLES: UserRole[] = ["Admin", "SchoolManager", "Advisor"];

export function canManagePlatform(role: UserRole): boolean {
  return role === "Admin" || role === "SchoolManager";
}

export function canManageInstruction(role: UserRole): boolean {
  return canManagePlatform(role) || role === "Teacher";
}

export function canViewSupport(role: UserRole): boolean {
  return SUPPORT_ROLES.includes(role) || role === "Teacher";
}

export function labelFromEnum(value: string): string {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function formatPercent(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No data";
  }
  return `${Math.round(value)}%`;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function daysFromNow(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function titleCase(value: string): string {
  return value
    .replace(/[-_]/g, " ")
    .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

/* ------------------------------------------------------------------ *
 * List paging
 *
 * Pure helpers for URL-driven list pages. They live in `shared` rather
 * than `domain` because paging is a presentation concern, not a business
 * rule — nothing here encodes anything about schools.
 * ------------------------------------------------------------------ */

export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export interface ListParams {
  q: string | null;
  page: number;
  pageSize: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  skip: number;
  take: number;
  hasPrevious: boolean;
  hasNext: boolean;
  /** 1-based index of the first row on this page; 0 when there are no rows. */
  firstRow: number;
  /** 1-based index of the last row on this page; 0 when there are no rows. */
  lastRow: number;
}

/**
 * Normalises whatever arrived in the query string.
 *
 * Query strings are user input. `?page=-1`, `?page=abc`, `?pageSize=100000`
 * and a hand-edited URL all reach this function, and every one of them has to
 * produce a sane query rather than an exception or a full-table scan. Clamping
 * beats validating here: nobody wants an error page because they fat-fingered a
 * page number.
 */
export function parseListParams(
  input: { q?: string; page?: string; pageSize?: string } = {}
): ListParams {
  const q = typeof input.q === "string" && input.q.trim().length > 0 ? input.q.trim() : null;

  const parsedPage = Number.parseInt(input.page ?? "", 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const parsedSize = Number.parseInt(input.pageSize ?? "", 10);
  const pageSize =
    Number.isFinite(parsedSize) && parsedSize > 0 ? Math.min(parsedSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  return { q, page, pageSize };
}

/**
 * Turns a total row count into everything a list page needs to render.
 *
 * `page` is clamped to the last populated page. Without that, deleting the only
 * row on page 4 leaves the user looking at an empty table with no way back —
 * a real and easily-missed bug, because it only appears after a delete.
 */
export function buildPagination(total: number, params: ListParams): Pagination {
  const safeTotal = Math.max(0, Math.floor(total));
  const totalPages = Math.max(1, Math.ceil(safeTotal / params.pageSize));
  const page = Math.min(Math.max(1, params.page), totalPages);
  const skip = (page - 1) * params.pageSize;
  const rowsOnPage = Math.max(0, Math.min(params.pageSize, safeTotal - skip));

  return {
    page,
    pageSize: params.pageSize,
    total: safeTotal,
    totalPages,
    skip,
    take: params.pageSize,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
    firstRow: rowsOnPage === 0 ? 0 : skip + 1,
    lastRow: rowsOnPage === 0 ? 0 : skip + rowsOnPage
  };
}

/**
 * Builds a query string that preserves every existing filter and changes one key.
 *
 * Paging links must not silently drop the filters the user set. Doing this by
 * hand at each call site is how "next page" ends up resetting the search box.
 */
export function withParam(
  current: Record<string, string | undefined>,
  key: string,
  value: string | number | null
): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    if (v !== undefined && v !== "" && k !== key) next.set(k, v);
  }
  if (value !== null && value !== "") next.set(key, String(value));
  const qs = next.toString();
  return qs.length > 0 ? `?${qs}` : "";
}

/**
 * Narrows a query-string value to a known enum member, or null.
 *
 * This exists to kill `params.status as never`, which was being handed straight
 * to a Prisma `where` clause. The cast silenced the compiler and checked
 * nothing, so `?status=DROP` reached the driver. Unlike a form field, a bad
 * filter should not be an error — it should simply not filter.
 */
export function parseEnumParam<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  if (!value) return undefined;
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}
