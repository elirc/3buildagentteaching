import type { PerformanceBand } from "@agentic-edu/shared";

export interface ScoreRecord {
  score: number | null;
  pointsPossible: number;
  status?: string;
  gradedAt?: Date | null;
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
