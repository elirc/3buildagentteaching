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
  | "StudentSuccessReview"
  | "TermPostmortem";
export type AgentRunStatus = "Pending" | "Running" | "Succeeded" | "Failed";
export type AgentTargetType =
  | "Student"
  | "Teacher"
  | "ClassSection"
  | "Assignment"
  | "Submission"
  | "LogGroup"
  | "Job"
  | "AcademicTerm";

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

/* ------------------------------------------------------------------ *
 * CSV export
 * ------------------------------------------------------------------ */

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

/**
 * Renders rows as CSV, escaping the four things that break a CSV file and the
 * one thing that turns it into an attack.
 *
 * The mechanical part is RFC 4180: a value containing a comma, a quote or a
 * newline is wrapped in quotes, and quotes inside it are doubled. Miss any of
 * those and the file silently shifts every subsequent column by one — silently
 * being the problem, because a spreadsheet opens it happily and the numbers are
 * simply in the wrong places.
 *
 * The security part is **formula injection**, and it is the reason this
 * function exists rather than a one-line `rows.map(r => r.join(","))`. A cell
 * beginning `=`, `+`, `-` or `@` is interpreted as a formula by Excel, Sheets
 * and LibreOffice. A student called `=cmd|'/c calc'!A0`, or a support note
 * pasted from somewhere hostile, becomes executable the moment an administrator
 * opens the export. Prefixing a single quote is the standard defusal: the cell
 * displays as text and the formula never evaluates.
 *
 * Note the `-` in that list. It means a legitimately negative number gets the
 * prefix too. That is the right trade — a mildly ugly "'-5" beats a document
 * that runs code — and it is why the prefix is applied to the *rendered string*
 * rather than to values we believe are numeric.
 */
export function toCsv<T>(rows: readonly T[], columns: ReadonlyArray<CsvColumn<T>>): string {
  const lines = [columns.map((column) => escapeCsvValue(column.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeCsvValue(column.value(row))).join(","));
  }
  // CRLF per RFC 4180. Excel on Windows is the overwhelmingly common consumer
  // and it is the one that cares.
  return lines.join("\r\n");
}

export function escapeCsvValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}
