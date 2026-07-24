import type { JobStatus } from "@agentic-edu/shared";

export interface JobRetryInput {
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
}

export interface JobRetryDecision {
  nextStatus: JobStatus;
  attempts: number;
  allowed: boolean;
  reason?: string;
}

export interface WorkerLockInput {
  status: JobStatus;
  lockedAt?: Date | null;
  lockExpiresAt?: Date | null;
  now: Date;
}

export interface WorkerLockDecision {
  allowed: boolean;
  reason?: string;
}

export function retryJob(input: JobRetryInput): JobRetryDecision {
  if (input.status !== "Failed" && input.status !== "Retrying") {
    return {
      nextStatus: input.status,
      attempts: input.attempts,
      allowed: false,
      reason: "Only failed or retrying jobs can be retried."
    };
  }

  if (input.attempts >= input.maxAttempts) {
    return {
      nextStatus: "DeadLettered",
      attempts: input.attempts,
      allowed: false,
      reason: "Job has exhausted retry attempts."
    };
  }

  return {
    nextStatus: "Queued",
    attempts: input.attempts + 1,
    allowed: true
  };
}

export function markDeadLettered(input: JobRetryInput): JobRetryDecision {
  return {
    nextStatus: "DeadLettered",
    attempts: input.attempts,
    allowed: input.status !== "Succeeded",
    reason: input.status === "Succeeded" ? "Succeeded jobs should not be dead-lettered." : undefined
  };
}

export function canAcquireJobLock(input: WorkerLockInput): WorkerLockDecision {
  if (input.status !== "Queued" && input.status !== "Retrying") {
    return { allowed: false, reason: "Only queued or retrying jobs can be locked by the worker." };
  }

  if (input.lockExpiresAt && input.lockExpiresAt > input.now) {
    return { allowed: false, reason: "Job already has an active worker lock." };
  }

  return { allowed: true };
}

export function calculateNextRetryAt(now: Date, attempts: number): Date {
  const retryDelayMinutes = Math.min(60, Math.max(1, 2 ** attempts));
  const next = new Date(now);
  next.setMinutes(next.getMinutes() + retryDelayMinutes);
  return next;
}
