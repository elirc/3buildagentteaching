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
