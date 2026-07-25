import type { NotificationType, UserRole } from "@agentic-edu/shared";

export interface RecipientCandidate {
  userId: string;
  role: UserRole;
}

/**
 * Which of the supplied users should receive a notification of this type.
 *
 * Pure, so routing policy is testable without a database. The caller loads
 * plausible recipients; this decides which of them actually get it.
 *
 * `ownerRole` matters for AgentRecommendation: an agent nominates a role to own
 * its suggestion, and the notification follows that nomination. Without it every
 * recommendation would go to every member of staff, and an inbox that shows
 * everyone everything is an inbox nobody reads.
 */
export function routeNotificationRecipients(
  type: NotificationType,
  candidates: RecipientCandidate[],
  context: { ownerRole?: string | null } = {}
): string[] {
  switch (type) {
    case "JobFailure":
      // Operational. Teachers and advisors can do nothing about a dead-lettered
      // job, and telling them makes the ones who CAN act stop reading.
      return pick(candidates, ["Admin", "SchoolManager"]);

    case "AgentRecommendation": {
      const owner = context.ownerRole;
      if (owner && isRole(owner)) return pick(candidates, [owner]);
      return pick(candidates, ["Admin", "SchoolManager", "Advisor"]);
    }

    case "AttendanceConcern":
    case "InterventionUpdate":
      return pick(candidates, ["Advisor", "Admin", "SchoolManager"]);

    case "GradePosted":
    case "AssignmentDue":
      // Addressed to the student and their guardians; the caller supplies only
      // those, so no role filter applies.
      return candidates.map((candidate) => candidate.userId);

    default:
      return candidates.map((candidate) => candidate.userId);
  }
}

function pick(candidates: RecipientCandidate[], roles: UserRole[]): string[] {
  return candidates.filter((candidate) => roles.includes(candidate.role)).map((candidate) => candidate.userId);
}

function isRole(value: string): value is UserRole {
  return ["Admin", "SchoolManager", "Teacher", "Student", "Advisor", "Guardian", "Viewer"].includes(value);
}
