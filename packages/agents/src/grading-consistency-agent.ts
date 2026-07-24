import { clamp } from "@agentic-edu/shared";
import { confidenceFromSignals, finding, recommendation, trace } from "./helpers";
import type { AgentDefinition, GradingConsistencyInput, GradingConsistencyOutput } from "./types";

function percent(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : Math.round((numerator / denominator) * 100);
}

export const gradingConsistencyAgent: AgentDefinition<GradingConsistencyInput, GradingConsistencyOutput> = {
  type: "GradingConsistency",
  name: "Grading Consistency Agent",
  description: "Detects simple grading outliers, missing feedback, and rubric coverage gaps.",
  targetTypes: ["Assignment"],
  run(input) {
    const scored = input.submissions.filter((submission) => submission.score !== null);
    const average =
      scored.length === 0 ? null : scored.reduce((sum, submission) => sum + (submission.score ?? 0), 0) / scored.length;
    const outliers =
      average === null
        ? []
        : scored.filter((submission) => Math.abs((submission.score ?? 0) - average) > input.assignment.pointsPossible * 0.25);
    const feedbackCount = input.submissions.filter((submission) => submission.feedback && submission.feedback.trim().length > 0).length;
    const rubricCount = input.submissions.filter((submission) => (submission.criterionScores?.length ?? 0) > 0).length;
    const feedbackCoverage = percent(feedbackCount, input.submissions.length);
    const rubricCoverage = percent(rubricCount, input.submissions.length);
    const consistencyScore = clamp(
      100 - outliers.length * 15 - (100 - feedbackCoverage) * 0.2 - (100 - rubricCoverage) * 0.15,
      0,
      100
    );

    const output: GradingConsistencyOutput = {
      consistencyScore: Math.round(consistencyScore),
      outlierStudentIds: outliers.map((submission) => submission.studentId),
      feedbackCoverageSummary: `${feedbackCoverage}% of submissions include teacher feedback.`,
      rubricCoverageSummary: `${rubricCoverage}% of submissions include rubric criterion scores.`,
      recommendedTeacherActions: [
        ...(outliers.length > 0 ? ["Review score outliers before returning grades."] : []),
        ...(feedbackCoverage < 80 ? ["Add concise feedback for low-scoring or missing submissions."] : []),
        ...(rubricCoverage < 80 ? ["Use rubric criterion scores consistently for this assignment."] : []),
        ...(outliers.length === 0 && feedbackCoverage >= 80 && rubricCoverage >= 80 ? ["No immediate grading consistency action needed."] : [])
      ]
    };
    const primaryAction = output.recommendedTeacherActions[0] ?? "Review grading consistency before returning grades.";

    return {
      output,
      confidenceScore: confidenceFromSignals(84, [scored.length < 3 ? 15 : 0, input.submissions.length === 0 ? 30 : 0]),
      findings: [
        finding(outliers.length > 0 ? "warning" : "info", "Score outliers", `${outliers.length} score outlier(s) detected.`),
        finding(feedbackCoverage < 80 ? "warning" : "info", "Feedback coverage", output.feedbackCoverageSummary),
        finding(rubricCoverage < 80 ? "warning" : "info", "Rubric coverage", output.rubricCoverageSummary)
      ],
      recommendations: [recommendation("Teacher", primaryAction, outliers.length > 0 ? "high" : "medium")],
      limitations: [
        "Outlier detection is statistical and does not inspect submission quality.",
        "Rubric coverage depends on structured rubric criterion scores being present."
      ],
      trace: [
        trace("score-average", average === null ? "No scored submissions available." : `Average score was ${average.toFixed(1)}.`),
        trace("outliers", `${outliers.length} submissions were more than 25% of points possible from average.`),
        trace("coverage", `Feedback ${feedbackCoverage}%, rubric ${rubricCoverage}%.`)
      ]
    };
  }
};
