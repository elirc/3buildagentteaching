import type { ApprovalStatus } from "@agentic-edu/shared";

export interface ApprovalTransitionInput {
  currentStatus: ApprovalStatus;
  nextStatus: ApprovalStatus;
}

export interface ApprovalTransitionResult {
  allowed: boolean;
  reason?: string;
}

const terminalStatuses: ApprovalStatus[] = ["Approved", "Rejected", "Cancelled"];

export function canTransitionApproval(input: ApprovalTransitionInput): ApprovalTransitionResult {
  if (terminalStatuses.includes(input.currentStatus)) {
    return {
      allowed: false,
      reason: "Completed approval decisions are immutable for auditability."
    };
  }

  if (input.currentStatus === "Requested" && terminalStatuses.includes(input.nextStatus)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: `Cannot move approval from ${input.currentStatus} to ${input.nextStatus}.`
  };
}
