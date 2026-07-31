export interface LogRetentionDecision {
  valid: boolean;
  reason?: string;
  /** Only present when valid. The oldest timestamp that survives the purge. */
  cutoff?: Date;
}

/** Deleting everything is a mistake, not a retention policy. */
export const MIN_LOG_RETENTION_DAYS = 1;
/** Beyond this the control is not doing anything a human asked for. */
export const MAX_LOG_RETENTION_DAYS = 365;

/**
 * Decides whether a retention request is one this system is willing to perform,
 * and turns it into the cutoff date the delete will use.
 *
 * The reason this is a domain function rather than three lines in the service:
 * the dangerous input here is `0`. "Delete logs older than 0 days" reads like a
 * no-op and means "delete everything", and it is exactly what an empty form
 * field coerces to. Refusing it belongs with the rule, not with the caller who
 * happens to be holding a form today.
 *
 * Returning the cutoff rather than letting the service compute it keeps the
 * arithmetic testable — an off-by-one in the boundary is otherwise only visible
 * against a live database.
 */
export function decideLogRetention(days: number, now: Date): LogRetentionDecision {
  if (!Number.isFinite(days) || !Number.isInteger(days)) {
    return { valid: false, reason: "Retention must be a whole number of days." };
  }
  if (days < MIN_LOG_RETENTION_DAYS) {
    return {
      valid: false,
      reason: `Retention must be at least ${MIN_LOG_RETENTION_DAYS} day — deleting every log is not a retention policy.`
    };
  }
  if (days > MAX_LOG_RETENTION_DAYS) {
    return { valid: false, reason: `Retention cannot exceed ${MAX_LOG_RETENTION_DAYS} days.` };
  }

  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { valid: true, cutoff };
}
