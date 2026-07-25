import { clamp, type EmploymentStatus, type RiskLevel } from "@agentic-edu/shared";

export interface TeacherWorkloadInput {
  employmentStatus: EmploymentStatus;
  activeSectionCount: number;
  studentCount: number;
  activeAssignmentCount: number;
  ungradedSubmissionCount: number;
  highRiskStudentCount: number;
}

export interface TeacherWorkloadResult {
  score: number;
  level: "Light" | "Balanced" | "Heavy" | "Overloaded";
  indicators: string[];
}

export interface GradingQueueItem {
  submissionId: string;
  studentId: string;
  /** Whole days the submission has been waiting. Negative values are clamped to 0. */
  daysWaiting: number;
  riskLevel: RiskLevel;
}

export interface RankedGradingQueueItem extends GradingQueueItem {
  urgency: number;
}

/**
 * Weight added to a submission's urgency for each risk level.
 *
 * A Critical student's work is worth roughly a fortnight of waiting, which is
 * the judgement call in this function: grading feedback matters most to the
 * students least able to recover from not getting it. If a school disagrees,
 * this table is the one place to change.
 */
const RISK_URGENCY: Record<RiskLevel, number> = {
  Critical: 14,
  High: 7,
  Medium: 3,
  Low: 0
};

/**
 * Orders a teacher's ungraded work by how much it matters.
 *
 * Sorting purely by age is the obvious approach and it is subtly wrong: it
 * buries a Critical student's two-day-old assignment under a Low-risk
 * student's nine-day-old one, when the whole point of a triage view is that
 * some work is worth doing first.
 *
 * Ties break on daysWaiting, then submissionId. That last one looks like
 * over-specification and is not — without a total order the list reshuffles
 * between renders whenever two items score identically, which reads as a bug.
 */
export function rankGradingQueue(items: GradingQueueItem[]): RankedGradingQueueItem[] {
  return items
    .map((item) => ({
      ...item,
      daysWaiting: Math.max(0, item.daysWaiting),
      urgency: Math.max(0, item.daysWaiting) + RISK_URGENCY[item.riskLevel]
    }))
    .sort(
      (a, b) =>
        b.urgency - a.urgency ||
        b.daysWaiting - a.daysWaiting ||
        a.submissionId.localeCompare(b.submissionId)
    );
}

export function scoreTeacherWorkload(input: TeacherWorkloadInput): TeacherWorkloadResult {
  let score = 15;
  const indicators: string[] = [];

  score += input.activeSectionCount * 9;
  score += Math.min(input.studentCount, 160) * 0.35;
  score += input.activeAssignmentCount * 1.5;
  score += input.ungradedSubmissionCount * 0.8;
  score += input.highRiskStudentCount * 4;

  if (input.activeSectionCount >= 4) indicators.push("Multiple active sections");
  if (input.studentCount >= 90) indicators.push("Large total roster");
  if (input.ungradedSubmissionCount >= 25) indicators.push("Large grading backlog");
  if (input.highRiskStudentCount >= 5) indicators.push("Many high-risk students");
  if (input.employmentStatus !== "Active" && input.activeSectionCount > 0) {
    score += 35;
    indicators.push("Inactive or on-leave teacher has active sections");
  }

  const finalScore = clamp(Math.round(score), 0, 100);
  let level: TeacherWorkloadResult["level"] = "Light";
  if (finalScore >= 80) level = "Overloaded";
  else if (finalScore >= 60) level = "Heavy";
  else if (finalScore >= 35) level = "Balanced";

  return { score: finalScore, level, indicators };
}
