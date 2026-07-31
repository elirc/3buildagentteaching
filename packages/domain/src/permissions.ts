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
  | "enrollment:promote"
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
  | "agentRecommendation:decide"
  | "guardian:viewOwnStudents"
  | "guardian:updateOwnPreferences"
  | "notification:readOwn"
  | "log:manage";

export interface PermissionActor {
  id: string;
  role: UserRole;
  teacherId?: string | null;
  studentId?: string | null;
  /*
   * readonly because canPerform only ever reads these. Accepting readonly
   * arrays lets callers pass `as const` literals and frozen values without a
   * cast, and stops anything downstream mutating an actor's scope in place —
   * which would be a genuinely alarming thing for a permission check to do.
   */
  advisedStudentIds?: readonly string[];
  /** Students this actor is a linked guardian for. */
  guardianStudentIds?: readonly string[];
}

export interface PermissionResource {
  teacherId?: string | null;
  studentId?: string | null;
  advisorId?: string | null;
  /** The user a notification is addressed to, for notification:readOwn. */
  recipientUserId?: string | null;
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
  "enrollment:promote",
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
  /*
   * "log:manage" is deliberately absent. A SchoolManager runs the school; the
   * observability record of what the software did is not theirs to delete, and
   * the one irreversible action in this list should have the smallest possible
   * set of people who can take it. Admin reaches it through the short-circuit
   * below.
   */
];

export function canPerform(actor: PermissionActor, action: PermissionAction, resource: PermissionResource = {}): boolean {
  /*
   * Checked before the Admin short-circuit because it is not a role privilege
   * at all — it is a statement about ownership. Anyone may mark their own
   * notification read; nobody may mark someone else's read on this permission.
   * An Admin who needs to touch another user's notification uses
   * notification:manage, which is a different and more powerful thing.
   */
  if (action === "notification:readOwn") {
    return !resource.recipientUserId || resource.recipientUserId === actor.id;
  }

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

  /*
   * Guardians see their own children and nothing else.
   *
   * Before this the role fell through to `return false` — it had a profile
   * table, a receivesDigest flag, notifications addressed to it and an agent
   * that drafted messages to it, and could do nothing whatsoever, including
   * mark one of those notifications as read.
   *
   * Note what is NOT granted: no support notes, no interventions, no agent
   * runs, no other family's students. A guardian may look at their child and
   * change how they are contacted. That is the whole surface.
   */
  if (actor.role === "Guardian") {
    if (action === "guardian:viewOwnStudents" || action === "guardian:updateOwnPreferences") {
      // An absent studentId means "the guardian's own scope" — the query is
      // already filtered to their children. A present one must be theirs.
      return !resource.studentId || (actor.guardianStudentIds?.includes(resource.studentId) ?? false);
    }
    return false;
  }

  return false;
}

export function explainPermission(action: PermissionAction): string {
  return `Your current role is not allowed to perform ${action}.`;
}
