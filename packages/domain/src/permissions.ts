import type { UserRole } from "@agentic-edu/shared";

export type PermissionAction =
  | "teacher:create"
  | "teacher:update"
  | "student:create"
  | "student:update"
  | "course:create"
  | "course:update"
  | "section:create"
  | "section:update"
  | "enrollment:manage"
  | "assignment:create"
  | "assignment:update"
  | "assignment:publish"
  | "submission:create"
  | "submission:grade"
  | "attendance:record"
  | "supportNote:create"
  | "intervention:create"
  | "intervention:update"
  | "intervention:approve"
  | "term:manage"
  | "guardian:manage"
  | "rubric:manage"
  | "notification:manage"
  | "job:retry"
  | "job:deadLetter"
  | "job:runWorker"
  | "agent:run"
  | "agentManifest:manage"
  | "agentRecommendation:decide";

export interface PermissionActor {
  id: string;
  role: UserRole;
  teacherId?: string | null;
  studentId?: string | null;
  advisedStudentIds?: string[];
}

export interface PermissionResource {
  teacherId?: string | null;
  studentId?: string | null;
  advisorId?: string | null;
}

const platformManagerActions: PermissionAction[] = [
  "teacher:create",
  "teacher:update",
  "student:create",
  "student:update",
  "course:create",
  "course:update",
  "section:create",
  "section:update",
  "enrollment:manage",
  "assignment:create",
  "assignment:update",
  "assignment:publish",
  "submission:grade",
  "attendance:record",
  "supportNote:create",
  "intervention:create",
  "intervention:update",
  "intervention:approve",
  "term:manage",
  "guardian:manage",
  "rubric:manage",
  "notification:manage",
  "job:retry",
  "job:deadLetter",
  "job:runWorker",
  "agent:run",
  "agentManifest:manage",
  "agentRecommendation:decide"
];

export function canPerform(actor: PermissionActor, action: PermissionAction, resource: PermissionResource = {}): boolean {
  if (actor.role === "Admin") return true;

  if (actor.role === "SchoolManager") {
    return platformManagerActions.includes(action);
  }

  if (actor.role === "Teacher") {
    if (action === "assignment:create" || action === "assignment:update" || action === "assignment:publish") {
      return !resource.teacherId || resource.teacherId === actor.teacherId;
    }
    if (action === "submission:grade" || action === "attendance:record") {
      return !resource.teacherId || resource.teacherId === actor.teacherId;
    }
    if (action === "rubric:manage") return !resource.teacherId || resource.teacherId === actor.teacherId;
    if (action === "supportNote:create" || action === "agent:run") return true;
  }

  if (actor.role === "Advisor") {
    if (
      action === "supportNote:create" ||
      action === "intervention:create" ||
      action === "intervention:update" ||
      action === "intervention:approve" ||
      action === "notification:manage" ||
      action === "agentRecommendation:decide" ||
      action === "agent:run"
    ) {
      return !resource.studentId || actor.advisedStudentIds?.includes(resource.studentId) || resource.advisorId === actor.id;
    }
  }

  if (actor.role === "Student") {
    return action === "submission:create" && (!resource.studentId || resource.studentId === actor.studentId);
  }

  return false;
}

export function explainPermission(action: PermissionAction): string {
  return `Your current role is not allowed to perform ${action}.`;
}
