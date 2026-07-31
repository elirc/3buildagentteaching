import { nextFollowUpDate, confidenceFromSignals, finding, recommendation, trace } from "./helpers";
import type { AgentDefinition, StudentSuccessReviewInput, StudentSuccessReviewOutput } from "./types";

export const studentSuccessReviewAgent: AgentDefinition<StudentSuccessReviewInput, StudentSuccessReviewOutput> = {
  type: "StudentSuccessReview",
  name: "Student Success Review Agent",
  description: "Combines prior deterministic agent outputs into a human-reviewable student success plan.",
  targetTypes: ["Student"],
  run(input) {
    const highConcern = input.risk.riskLevel === "High" || input.risk.riskLevel === "Critical";
    const attendanceConcern = input.attendance.advisorFollowUpRecommended;
    const hasActiveIntervention = input.activeInterventions.length > 0;
    const recommendedPlan = [
      highConcern ? input.risk.recommendedIntervention : "Continue weekly progress monitoring.",
      attendanceConcern ? input.attendance.recommendedNextAction : "Maintain normal attendance checks.",
      hasActiveIntervention
        ? "Update the existing intervention rather than creating a duplicate plan."
        : "Create a new intervention only after advisor review.",
      input.guardianDigestOptIn ? "Prepare guardian communication after staff review." : "Confirm guardian communication preferences before outreach."
    ];
    const primaryRecommendation = recommendedPlan[0] ?? "Review the student success plan with staff.";

    const output: StudentSuccessReviewOutput = {
      executiveSummary: `${input.studentName} has ${input.risk.riskLevel.toLowerCase()} risk with ${input.progress.gradeTrend.toLowerCase()} grade trend and ${input.progress.attendanceTrend.toLowerCase()} attendance status.`,
      orchestratedFindings: [
        input.progress.academicSummary,
        `Risk areas: ${input.risk.primaryRiskAreas.join(", ") || "none"}.`,
        `Attendance anomaly: ${input.attendance.anomalyType}.`
      ],
      recommendedPlan,
      subagentSummaries: [
        { agentType: "StudentProgressSummary", summary: input.progress.academicSummary, confidence: 82 },
        { agentType: "AtRiskStudentDetection", summary: input.risk.recommendedIntervention, confidence: 84 },
        { agentType: "AttendanceAnomaly", summary: input.attendance.recommendedNextAction, confidence: 78 }
      ],
      needsHumanApproval: highConcern || attendanceConcern || !hasActiveIntervention,
      nextReviewDate: nextFollowUpDate(input.risk.riskLevel === "Critical" ? 2 : 7, input.now)
    };

    return {
      output,
      confidenceScore: confidenceFromSignals(80, [
        input.progress.concerns.length === 0 ? 5 : 0,
        input.risk.evidence.length === 0 ? 10 : 0,
        input.attendance.evidence.length === 0 ? 8 : 0
      ]),
      findings: [
        finding(highConcern ? "warning" : "info", "Risk synthesis", output.executiveSummary),
        finding(output.needsHumanApproval ? "warning" : "info", "Approval requirement", output.needsHumanApproval ? "Human approval should happen before operational changes." : "No immediate approval gate required.")
      ],
      recommendations: [
        recommendation(highConcern ? "Advisor" : "Teacher", primaryRecommendation, highConcern ? "high" : "medium")
      ],
      limitations: [
        "This orchestrator summarizes other deterministic agents; it does not independently inspect raw evidence.",
        "Recommended plans require human review before changing student records."
      ],
      trace: [
        trace("combine-progress", "Read student progress summary output."),
        trace("combine-risk", `Risk level ${input.risk.riskLevel} drove approval need.`),
        trace("combine-attendance", `Attendance anomaly ${input.attendance.anomalyType} considered.`)
      ]
    };
  }
};
