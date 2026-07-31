import type { PerformanceBand } from "@agentic-edu/shared";

export interface ScoreRecord {
  score: number | null;
  pointsPossible: number;
  status?: string;
  gradedAt?: Date | null;
  /** Which grading period this work belongs to, when weighting is in play. */
  gradingPeriodId?: string | null;
}

export interface WeightedPeriodBreakdown {
  gradingPeriodId: string;
  weight: number;
  /** The unweighted percentage for this period alone, or null with no scored work. */
  average: number | null;
  earnedPoints: number;
  possiblePoints: number;
}

export interface WeightedGradeSummary extends GradeSummary {
  /** The weighted final, or the flat average when no weights applied. */
  weightedAverage: number | null;
  periods: WeightedPeriodBreakdown[];
}

export interface GradeSummary {
  average: number | null;
  earnedPoints: number;
  possiblePoints: number;
  missingCount: number;
  lateCount: number;
  gradedCount: number;
  trend: "Improving" | "Stable" | "Declining" | "InsufficientData";
  performanceBand: PerformanceBand;
}

export function calculatePercentage(score: number | null | undefined, pointsPossible: number): number | null {
  if (score === null || score === undefined || pointsPossible <= 0) {
    return null;
  }
  return (score / pointsPossible) * 100;
}

export function classifyPerformance(average: number | null | undefined): PerformanceBand {
  if (average === null || average === undefined || Number.isNaN(average)) {
    return "InsufficientData";
  }
  if (average >= 90) return "Excellent";
  if (average >= 80) return "Good";
  if (average >= 70) return "Warning";
  return "AtRisk";
}

export function calculateGradeSummary(scores: ScoreRecord[]): GradeSummary {
  let earnedPoints = 0;
  let possiblePoints = 0;
  let missingCount = 0;
  let lateCount = 0;
  let gradedCount = 0;

  for (const score of scores) {
    if (score.status === "Missing") {
      missingCount += 1;
      // Missing work counts against the average: nothing earned, full points in
      // the denominator.
      possiblePoints += score.pointsPossible;
      continue;
    }

    if (score.status === "Late") {
      lateCount += 1;
    }

    if (typeof score.score === "number") {
      earnedPoints += score.score;
      possiblePoints += score.pointsPossible;
      gradedCount += 1;
      continue;
    }

    /*
     * Late, handed in, still ungraded.
     *
     * This used to fall off the end of the loop and contribute nothing at all —
     * not to earnedPoints, not to possiblePoints — so the assignment silently
     * vanished from the average instead of affecting it. A student with one
     * good score and three ungraded late submissions showed the good score as
     * their average.
     *
     * It is counted like Missing: full points in the denominator, nothing
     * earned. That is the honest reading of "not yet graded" — the student has
     * no credit for it *yet*. The number corrects itself the moment a teacher
     * grades the work, which is exactly the nudge the grading queue in US-05 is
     * built to act on.
     *
     * NotStarted and Submitted-but-ungraded are deliberately NOT counted. Work
     * that is not yet due has not been failed, and penalising a student for an
     * assignment the teacher has simply not reached would be worse than the bug
     * this replaces.
     */
    if (score.status === "Late") {
      possiblePoints += score.pointsPossible;
    }
  }

  const average = possiblePoints > 0 ? (earnedPoints / possiblePoints) * 100 : null;
  return {
    average,
    earnedPoints,
    possiblePoints,
    missingCount,
    lateCount,
    gradedCount,
    trend: calculateTrend(scores),
    performanceBand: classifyPerformance(average)
  };
}

/**
 * The same summary, plus a final that respects grading period weights.
 *
 * Why this is a separate function rather than an optional argument to
 * `calculateGradeSummary`: the unweighted number is still the right answer in
 * most places (a student's overall standing across every course, the at-risk
 * score, the dashboard). Weighting is a property of *one section's* gradebook,
 * where a term is divided into periods that a school has decided count for
 * different amounts. Threading an optional map through the function everything
 * calls would put the burden on every caller to know that.
 *
 * The mechanics that matter:
 *
 * Each period's percentage is computed *within the period* and only then
 * combined by weight. That is not the same as weighting individual assignments,
 * and the difference is the entire point: a 10-point quiz and a 200-point exam
 * in the same period contribute proportionally to that period, but a period
 * worth 20% cannot exceed 20% of the final no matter how many points it holds.
 *
 * A period with no scored work is dropped and its weight redistributed across
 * the rest. The alternative — treating it as zero — would show a student who
 * has done everything asked of them so far a failing grade for a term that has
 * not happened yet, which is the single most alarming thing a gradebook can do.
 *
 * Work with no `gradingPeriodId`, or with one that has no weight, is not
 * silently dropped; it is collected under the empty-string key and reported in
 * the breakdown so it is visible rather than missing. `Assignment.gradingPeriodId`
 * is optional, so this is a real state and not a defensive branch.
 */
export function calculateWeightedGradeSummary(
  scores: ScoreRecord[],
  weights: Map<string, number>
): WeightedGradeSummary {
  const flat = calculateGradeSummary(scores);

  if (weights.size === 0) {
    return { ...flat, weightedAverage: flat.average, periods: [] };
  }

  const byPeriod = new Map<string, ScoreRecord[]>();
  for (const score of scores) {
    const key = score.gradingPeriodId ?? "";
    const bucket = byPeriod.get(key);
    if (bucket) bucket.push(score);
    else byPeriod.set(key, [score]);
  }

  const periods: WeightedPeriodBreakdown[] = [];
  for (const [gradingPeriodId, periodScores] of byPeriod) {
    const summary = calculateGradeSummary(periodScores);
    periods.push({
      gradingPeriodId,
      weight: weights.get(gradingPeriodId) ?? 0,
      average: summary.average,
      earnedPoints: summary.earnedPoints,
      possiblePoints: summary.possiblePoints
    });
  }
  periods.sort((a, b) => a.gradingPeriodId.localeCompare(b.gradingPeriodId));

  const scored = periods.filter((period) => period.average !== null && period.weight > 0);
  const totalWeight = scored.reduce((sum, period) => sum + period.weight, 0);

  /*
   * No weighted period has any scored work yet. Falling back to the flat
   * average is the honest answer: it is the number the rest of the app already
   * shows, and inventing a weighted null here would blank a gradebook that has
   * perfectly good marks in an unweighted period.
   */
  if (totalWeight === 0) {
    return { ...flat, weightedAverage: flat.average, periods };
  }

  const weighted = scored.reduce((sum, period) => sum + (period.average ?? 0) * period.weight, 0) / totalWeight;
  return { ...flat, weightedAverage: weighted, periods };
}

export function calculateClassAverage(studentSummaries: GradeSummary[]): number | null {
  const averages = studentSummaries
    .map((summary) => summary.average)
    .filter((average): average is number => typeof average === "number");
  if (averages.length === 0) return null;
  return averages.reduce((sum, average) => sum + average, 0) / averages.length;
}

export function calculateTrend(scores: ScoreRecord[]): GradeSummary["trend"] {
  const graded = scores
    .filter((score) => typeof score.score === "number" && score.pointsPossible > 0)
    .sort((a, b) => {
      const left = a.gradedAt?.getTime() ?? 0;
      const right = b.gradedAt?.getTime() ?? 0;
      return left - right;
    });

  if (graded.length < 4) {
    return "InsufficientData";
  }

  const half = Math.floor(graded.length / 2);
  const firstHalf = graded.slice(0, half);
  const secondHalf = graded.slice(half);
  const avg = (records: ScoreRecord[]) =>
    records.reduce((sum, record) => sum + (record.score ?? 0) / record.pointsPossible, 0) / records.length;

  const delta = (avg(secondHalf) - avg(firstHalf)) * 100;
  if (delta >= 5) return "Improving";
  if (delta <= -5) return "Declining";
  return "Stable";
}
