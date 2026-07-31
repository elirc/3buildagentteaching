import type { AcademicTermStatus } from "@agentic-edu/shared";

export interface AcademicDateRange {
  startsAt: Date;
  endsAt: Date;
}

export interface AcademicTermInput extends AcademicDateRange {
  status: AcademicTermStatus;
}

export interface GradingPeriodInput extends AcademicDateRange {
  weight: number;
}

export interface CalendarRuleResult {
  valid: boolean;
  reason?: string;
}

export function validateAcademicTerm(input: AcademicTermInput): CalendarRuleResult {
  if (input.endsAt <= input.startsAt) {
    return { valid: false, reason: "Academic term end date must be after its start date." };
  }

  if (input.status === "Active" && input.endsAt < new Date()) {
    return { valid: false, reason: "Closed historical terms should not remain active." };
  }

  return { valid: true };
}

export function validateGradingPeriod(term: AcademicDateRange, period: GradingPeriodInput): CalendarRuleResult {
  if (period.endsAt <= period.startsAt) {
    return { valid: false, reason: "Grading period end date must be after its start date." };
  }

  if (period.startsAt < term.startsAt || period.endsAt > term.endsAt) {
    return { valid: false, reason: "Grading periods must stay inside their academic term." };
  }

  if (period.weight <= 0) {
    return { valid: false, reason: "Grading period weight must be greater than zero." };
  }

  return { valid: true };
}

export function isDateWithinRange(date: Date, range: AcademicDateRange): boolean {
  return date >= range.startsAt && date <= range.endsAt;
}

/**
 * An assignment's due date has to fall inside the term its section runs in.
 *
 * The message names the term and its dates rather than saying "invalid date",
 * because the person hitting this has picked a date that looks perfectly
 * reasonable and needs to know what it is being compared against. "Due date
 * must fall within Fall 2026 (1 Sep – 20 Dec)" is a sentence someone can act
 * on; "Invalid due date" sends them to ask a colleague.
 */
export function validateAssignmentDueDate(
  dueDate: Date,
  term: AcademicDateRange & { name: string }
): CalendarRuleResult {
  if (isDateWithinRange(dueDate, term)) return { valid: true };

  return {
    valid: false,
    reason: `Due date must fall within ${term.name} (${formatDay(term.startsAt)} – ${formatDay(term.endsAt)}).`
  };
}

export interface GradingPeriodWeight {
  name: string;
  weight: number;
}

export interface GradingPeriodWeightReport {
  /** True when the weights sum to 1 within tolerance, or when there are none. */
  valid: boolean;
  total: number;
  reason?: string;
}

/**
 * Flags grading period weights that do not sum to 1.
 *
 * Not an error — it is a warning surfaced on /terms, because a term mid-setup
 * legitimately has one period at 0.4 and the rest not yet created. Refusing to
 * save that would make the screen unusable while someone is using it.
 *
 * The tolerance matters. Weights are Floats, and 0.3 + 0.3 + 0.4 is
 * 0.9999999999999999 in IEEE 754 — a system that flagged that as "does not sum
 * to 1" would be reporting a fault in binary floating point as a fault in the
 * user's arithmetic.
 */
export function validateGradingPeriodWeights(periods: GradingPeriodWeight[]): GradingPeriodWeightReport {
  if (periods.length === 0) return { valid: true, total: 0 };

  const total = periods.reduce((sum, period) => sum + period.weight, 0);
  if (Math.abs(total - 1) <= 0.001) return { valid: true, total };

  return {
    valid: false,
    total,
    reason: `Grading period weights total ${total.toFixed(2)}, not 1.00. Weighted averages will be scaled by that total.`
  };
}

function formatDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
