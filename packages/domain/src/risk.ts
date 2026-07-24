import { clamp, type RiskLevel } from "@agentic-edu/shared";
import type { AttendanceSummary } from "./attendance";
import type { GradeSummary } from "./grades";

export interface RiskInput {
  gradeSummary: GradeSummary;
  attendanceSummary: AttendanceSummary;
  activeInterventionCount: number;
  recentSupportNoteCount: number;
}

export interface StudentRiskResult {
  score: number;
  level: RiskLevel;
  primaryAreas: string[];
  evidence: string[];
}

export function scoreStudentRisk(input: RiskInput): StudentRiskResult {
  let score = 10;
  const primaryAreas: string[] = [];
  const evidence: string[] = [];

  const average = input.gradeSummary.average;
  if (average !== null) {
    if (average < 60) {
      score += 38;
      primaryAreas.push("Grades");
      evidence.push(`Grade average is critically low at ${Math.round(average)}%.`);
    } else if (average < 70) {
      score += 25;
      primaryAreas.push("Grades");
      evidence.push(`Grade average is at risk at ${Math.round(average)}%.`);
    } else if (average < 80) {
      score += 12;
      evidence.push(`Grade average is in warning range at ${Math.round(average)}%.`);
    }
  } else {
    score += 8;
    evidence.push("No recent graded work is available.");
  }

  if (input.gradeSummary.missingCount > 3) {
    score += 20;
    primaryAreas.push("Engagement");
    evidence.push(`${input.gradeSummary.missingCount} missing assignments.`);
  } else if (input.gradeSummary.missingCount > 0) {
    score += input.gradeSummary.missingCount * 4;
    evidence.push(`${input.gradeSummary.missingCount} missing assignment(s).`);
  }

  if (input.attendanceSummary.absent >= 5) {
    score += 28;
    primaryAreas.push("Attendance");
    evidence.push(`${input.attendanceSummary.absent} absence(s) recorded.`);
  } else if (input.attendanceSummary.issuePoints >= 3) {
    score += 12;
    primaryAreas.push("Attendance");
    evidence.push("Attendance issue points are elevated.");
  }

  if (input.gradeSummary.trend === "Improving") {
    score -= 10;
    evidence.push("Recent grade trend is improving.");
  }
  if (input.gradeSummary.trend === "Declining") {
    score += 12;
    evidence.push("Recent grade trend is declining.");
  }
  if (input.activeInterventionCount > 0) {
    score -= 6;
    evidence.push("An active intervention plan is already in place.");
  }
  if (input.recentSupportNoteCount > 2) {
    score += 5;
    evidence.push("Recent support activity suggests staff concern.");
  }

  const finalScore = clamp(Math.round(score), 0, 100);
  return {
    score: finalScore,
    level: riskLevelFromScore(finalScore),
    primaryAreas: [...new Set(primaryAreas)],
    evidence
  };
}

export function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 80) return "Critical";
  if (score >= 60) return "High";
  if (score >= 35) return "Medium";
  return "Low";
}
