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
