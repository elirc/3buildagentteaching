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
