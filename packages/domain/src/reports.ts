import type { RiskLevel } from "@agentic-edu/shared";

export interface WeeklyRiskReportRowInput {
  studentId: string;
  studentName: string;
  gradeLevel: number;
  riskScore: number;
  riskLevel: RiskLevel;
  primaryRiskAreas: string[];
  gradeAverage: number | null;
  missingCount: number;
  absences: number;
  activeInterventionCount: number;
  advisorName: string | null;
}

export interface WeeklyRiskReportInput {
  scopeType: "School" | "ClassSection" | "Advisor";
  scopeId: string | null;
  scopeLabel: string;
  periodStart: Date;
  periodEnd: Date;
  rows: WeeklyRiskReportRowInput[];
}

export interface WeeklyRiskReportPayload {
  scopeType: WeeklyRiskReportInput["scopeType"];
  scopeId: string | null;
  scopeLabel: string;
  periodStart: string;
  periodEnd: string;
  totals: {
    students: number;
    byLevel: Record<RiskLevel, number>;
    averageRiskScore: number | null;
    studentsWithMissingWork: number;
    studentsWithActiveIntervention: number;
  };
  rows: WeeklyRiskReportRowInput[];
}

export interface ReportDiffEntry {
  studentId: string;
  studentName: string;
  previousLevel: RiskLevel | null;
  currentLevel: RiskLevel | null;
  previousScore: number | null;
  currentScore: number | null;
  delta: number | null;
}

export interface ReportDiff {
  /** Moved into High or Critical since the previous report. */
  newlyElevated: ReportDiffEntry[];
  /** Was High or Critical and no longer is. */
  improved: ReportDiffEntry[];
  /** Present now, absent before — a new enrolment or a widened scope. */
  added: ReportDiffEntry[];
  /** Present before, absent now — left, or the scope narrowed. */
  removed: ReportDiffEntry[];
  /** Largest score movements in either direction, worst first. */
  biggestMovers: ReportDiffEntry[];
}

const ELEVATED: readonly RiskLevel[] = ["High", "Critical"];
const LEVELS: readonly RiskLevel[] = ["Low", "Medium", "High", "Critical"];
/** How many movers a reader can actually scan before the list stops helping. */
const MAX_MOVERS = 10;

/**
 * Turns already-fetched rows into a report payload.
 *
 * Pure on purpose: the handler fetches and persists, this decides what a report
 * *is*. That split is what makes a weekly report testable without a database,
 * a scheduler, or a week.
 *
 * The snapshot stores the computed rows rather than the ids to recompute from.
 * That is the whole point of a snapshot — recomputing next month against
 * today's grades would answer a different question and quietly rewrite history.
 * It is also why `periodStart`/`periodEnd` are stored as ISO strings: this
 * payload goes into a Json column and comes back as data, not as Dates.
 */
export function buildWeeklyRiskReport(input: WeeklyRiskReportInput): WeeklyRiskReportPayload {
  const byLevel = Object.fromEntries(LEVELS.map((level) => [level, 0])) as Record<RiskLevel, number>;
  for (const row of input.rows) {
    byLevel[row.riskLevel] += 1;
  }

  const averageRiskScore =
    input.rows.length === 0
      ? null
      : Math.round(input.rows.reduce((sum, row) => sum + row.riskScore, 0) / input.rows.length);

  return {
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    scopeLabel: input.scopeLabel,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    totals: {
      students: input.rows.length,
      byLevel,
      averageRiskScore,
      studentsWithMissingWork: input.rows.filter((row) => row.missingCount > 0).length,
      studentsWithActiveIntervention: input.rows.filter((row) => row.activeInterventionCount > 0).length
    },
    // Worst first. A report read top-down should start with the student who
    // most needs someone to do something.
    rows: [...input.rows].sort((a, b) => b.riskScore - a.riskScore || a.studentName.localeCompare(b.studentName))
  };
}

/**
 * Compares two snapshots.
 *
 * "Who got worse this week" is the question a weekly report exists to answer,
 * and a single snapshot cannot answer it. Note that `added` and `removed` are
 * kept separate from `newlyElevated` and `improved`: a student who appears for
 * the first time at Critical has not *become* critical, and reporting them as a
 * new escalation would send someone looking for an event that never happened.
 */
export function diffReports(
  previous: WeeklyRiskReportPayload | null,
  current: WeeklyRiskReportPayload
): ReportDiff {
  const empty: ReportDiff = { newlyElevated: [], improved: [], added: [], removed: [], biggestMovers: [] };
  if (!previous) {
    // Everything is "added" against nothing. Reporting a whole cohort as newly
    // elevated on the first ever run would be noise, not signal.
    empty.added = current.rows.map((row) => entry(row.studentId, row.studentName, null, row));
    return empty;
  }

  const previousById = new Map(previous.rows.map((row) => [row.studentId, row]));
  const currentById = new Map(current.rows.map((row) => [row.studentId, row]));

  for (const row of current.rows) {
    const before = previousById.get(row.studentId);
    if (!before) {
      empty.added.push(entry(row.studentId, row.studentName, null, row));
      continue;
    }

    const change = entry(row.studentId, row.studentName, before, row);
    if (!ELEVATED.includes(before.riskLevel) && ELEVATED.includes(row.riskLevel)) {
      empty.newlyElevated.push(change);
    } else if (ELEVATED.includes(before.riskLevel) && !ELEVATED.includes(row.riskLevel)) {
      empty.improved.push(change);
    }
    empty.biggestMovers.push(change);
  }

  for (const row of previous.rows) {
    if (!currentById.has(row.studentId)) {
      empty.removed.push(entry(row.studentId, row.studentName, row, null));
    }
  }

  empty.biggestMovers = empty.biggestMovers
    .filter((change) => change.delta !== null && change.delta !== 0)
    .sort((a, b) => Math.abs(b.delta ?? 0) - Math.abs(a.delta ?? 0))
    .slice(0, MAX_MOVERS);

  return empty;
}

function entry(
  studentId: string,
  studentName: string,
  before: WeeklyRiskReportRowInput | null,
  after: WeeklyRiskReportRowInput | null
): ReportDiffEntry {
  return {
    studentId,
    studentName,
    previousLevel: before?.riskLevel ?? null,
    currentLevel: after?.riskLevel ?? null,
    previousScore: before?.riskScore ?? null,
    currentScore: after?.riskScore ?? null,
    delta: before && after ? after.riskScore - before.riskScore : null
  };
}

/**
 * The idempotency key for a weekly report.
 *
 * ISO week, not "seven days back from now": two people pressing Generate on
 * Tuesday and Thursday of the same week mean the same report, and a key built
 * from the current date would give them two. `report:weekly-risk:{scope}:{week}`
 * is what makes the enqueue in US-11 collapse them into one.
 */
export function weeklyReportKey(scopeId: string | null, date: Date): string {
  return `report:weekly-risk:${scopeId ?? "school"}:${isoWeek(date)}`;
}

/**
 * The Monday-to-Sunday range containing `date`, in UTC.
 *
 * Deriving the period from the *week* rather than from "seven days before now"
 * is what makes a weekly report idempotent. With a rolling window, generating
 * on Tuesday and again on Thursday produces two reports with different
 * periodStart values covering overlapping data, and neither the idempotency key
 * nor a uniqueness check can tell they are the same report. Anchored to the
 * week, both runs agree on the boundaries and the second updates the first.
 */
export function isoWeekRange(date: Date): { periodStart: Date; periodEnd: Date } {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNumber = (start.getUTCDay() + 6) % 7; // Monday = 0
  start.setUTCDate(start.getUTCDate() - dayNumber);

  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  return { periodStart: start, periodEnd: end };
}

/**
 * ISO-8601 week number.
 *
 * Written out rather than pulled from a date library because the edge cases are
 * the point: 1 January can belong to week 52 of the previous year, and 31
 * December can belong to week 1 of the next. A naive "day of year / 7" would
 * give two different keys to the same week across a new year, which is exactly
 * when a school is least able to cope with duplicate reports.
 */
export function isoWeek(date: Date): string {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  // Thursday determines the year an ISO week belongs to.
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNumber = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNumber + 3);

  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}
