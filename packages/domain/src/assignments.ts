import type { AssignmentStatus, SubmissionStatus } from "@agentic-edu/shared";

export interface SubmissionStateInput {
  assignmentStatus: AssignmentStatus;
  dueDate: Date;
  submittedAt?: Date | null;
  now?: Date;
  teacherOverride?: boolean;
}

export function determineSubmissionStatus(input: SubmissionStateInput): SubmissionStatus {
  const now = input.now ?? new Date();
  if (!input.submittedAt && now > input.dueDate) {
    return "Missing";
  }
  if (!input.submittedAt) {
    return "NotStarted";
  }
  if (input.submittedAt > input.dueDate) {
    return "Late";
  }
  return "Submitted";
}

export function canSubmitAssignment(input: SubmissionStateInput): { allowed: boolean; reason?: string } {
  if (input.assignmentStatus === "Closed" && !input.teacherOverride) {
    return { allowed: false, reason: "Closed assignments require a teacher override." };
  }
  if (input.assignmentStatus === "Draft") {
    return { allowed: false, reason: "Draft assignments are not visible to students." };
  }
  return { allowed: true };
}

export function validateScore(score: number, pointsPossible: number): { valid: boolean; reason?: string } {
  if (score < 0) return { valid: false, reason: "Score cannot be negative." };
  if (score > pointsPossible) return { valid: false, reason: "Score cannot exceed points possible." };
  return { valid: true };
}
