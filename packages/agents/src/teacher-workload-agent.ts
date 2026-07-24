import { scoreTeacherWorkload } from "@agentic-edu/domain";
import { confidenceFromSignals, finding, recommendation, trace } from "./helpers";
import type { AgentDefinition, TeacherWorkloadAgentInput, TeacherWorkloadAgentOutput } from "./types";

export const teacherWorkloadInsightAgent: AgentDefinition<TeacherWorkloadAgentInput, TeacherWorkloadAgentOutput> = {
  type: "TeacherWorkloadInsight",
  name: "Teacher Workload Insight Agent",
  description: "Summarizes teacher workload from sections, roster size, assignments, grading backlog, and high-risk students.",
  targetTypes: ["Teacher"],
  run(input) {
    const result = scoreTeacherWorkload({
      employmentStatus: input.teacherProfile.employmentStatus,
      activeSectionCount: input.activeSectionCount,
      studentCount: input.studentCount,
      activeAssignmentCount: input.activeAssignmentCount,
      ungradedSubmissionCount: input.ungradedSubmissionCount,
      highRiskStudentCount: input.highRiskStudentCount
    });
    const sectionSizeConcerns =
      input.studentCount / Math.max(input.activeSectionCount, 1) >= 28
        ? ["Average section size is high."]
        : ["Average section size is within expected operating range."];
    const output: TeacherWorkloadAgentOutput = {
      workloadSummary: `${input.teacherProfile.name} has a ${result.level.toLowerCase()} workload score of ${result.score}.`,
      workloadScore: result.score,
      overloadedIndicators: result.indicators,
      gradingBacklogSummary: `${input.ungradedSubmissionCount} ungraded submission(s) across ${input.activeAssignmentCount} active assignment(s).`,
      sectionSizeConcerns,
      recommendedAdministrativeAction:
        result.level === "Overloaded"
          ? "Rebalance sections, provide grading support, or reduce nonessential administrative load."
          : result.level === "Heavy"
            ? "Monitor grading backlog and consider short-term support."
            : "No administrative intervention required now."
    };

    return {
      output,
      confidenceScore: confidenceFromSignals(84, [input.activeSectionCount === 0 ? 15 : 0, input.failedJobCount > 0 ? 4 : 0]),
      findings: result.indicators.map((indicator) => finding(result.score >= 80 ? "critical" : "warning", "Workload indicator", indicator)),
      recommendations: [recommendation("Admin", output.recommendedAdministrativeAction, result.score >= 80 ? "high" : "medium")],
      limitations: ["Workload score is operational and does not measure teacher effectiveness or preparation quality."],
      trace: [
        trace("sections", `${input.activeSectionCount} active section(s).`, input.activeSectionCount * 9),
        trace("roster", `${input.studentCount} student(s) total.`),
        trace("backlog", `${input.ungradedSubmissionCount} ungraded submission(s).`),
        trace("risk-load", `${input.highRiskStudentCount} high-risk student(s).`)
      ]
    };
  }
};
