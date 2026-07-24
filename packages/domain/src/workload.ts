import { clamp, type EmploymentStatus } from "@agentic-edu/shared";

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
