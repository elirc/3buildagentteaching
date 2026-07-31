import { scoreStudentRisk } from "@agentic-edu/domain";
import { nextFollowUpDate, confidenceFromSignals, finding, recommendation, trace } from "./helpers";
import type { AgentDefinition, AtRiskInput, AtRiskOutput } from "./types";

export const atRiskStudentDetectionAgent: AgentDefinition<AtRiskInput, AtRiskOutput> = {
  type: "AtRiskStudentDetection",
  name: "At-Risk Student Detection Agent",
  description: "Scores academic, attendance, and engagement risk using deterministic business rules.",
  targetTypes: ["Student"],
  run(input) {
    const activeInterventions = input.interventionHistory.filter((plan) => plan.status === "Active");
    const result = scoreStudentRisk({
      gradeSummary: input.gradeSummary,
      attendanceSummary: input.attendanceSummary,
      activeInterventionCount: activeInterventions.length,
      recentSupportNoteCount: input.recentSupportNotes.length
    });

    const findings = result.evidence.map((evidence) =>
      finding(result.level === "Critical" ? "critical" : result.level === "High" ? "warning" : "info", "Risk evidence", evidence)
    );
    const hasActiveIntervention = activeInterventions.length > 0;
    const recommendedIntervention = hasActiveIntervention
      ? "Review and update the active intervention plan instead of creating a duplicate."
      : result.primaryAreas.includes("Attendance")
        ? "Create an attendance intervention with guardian outreach and weekly check-ins."
        : result.primaryAreas.includes("Grades")
          ? "Create an academic intervention focused on missing work recovery and targeted reteaching."
          : "Monitor weekly and document support notes.";

    const output: AtRiskOutput = {
      riskScore: result.score,
      riskLevel: result.level,
      primaryRiskAreas: result.primaryAreas,
      evidence: result.evidence,
      recommendedIntervention,
      suggestedFollowUpDate: nextFollowUpDate(result.level === "Critical" ? 2 : 7, input.now),
      escalationRecommendation:
        result.level === "Critical"
          ? "Escalate to school manager and advisor within two school days."
          : result.level === "High"
            ? "Assign advisor follow-up this week."
            : "Continue monitoring through normal teacher/advisor workflow."
    };

    return {
      output,
      confidenceScore: confidenceFromSignals(86, [
        input.gradeSummary.average === null ? 20 : 0,
        input.attendanceSummary.attendanceRate === null ? 15 : 0,
        input.recentSupportNotes.length === 0 ? 4 : 0
      ]),
      findings,
      recommendations: [
        /*
         * Critical escalates to Admin, not Advisor.
         *
         * The output's escalationRecommendation text already said "escalate to
         * school manager and advisor" for Critical — but ownerRole is the field
         * that actually routes the work, and it said Advisor. So the most severe
         * cases never appeared in an administrator's queue; the escalation
         * existed only as prose in a JSON blob nobody filters on.
         *
         * A recommendation's owner is the field that decides whose inbox it
         * lands in. Advice about escalation that does not change the owner is
         * not escalation.
         */
        recommendation(
          result.level === "Critical" ? "Admin" : result.level === "Low" ? "Teacher" : "Advisor",
          recommendedIntervention,
          result.level === "Critical" || result.level === "High" ? "high" : "medium"
        )
      ],
      limitations: [
        "Risk score is a heuristic, not a clinical or legal determination.",
        "Existing support-note visibility may hide context from the current user role."
      ],
      trace: [
        trace("risk-score", `Calculated risk score ${result.score}.`, result.score),
        trace("risk-level", `Mapped score to ${result.level}.`),
        trace("active-intervention", `${activeInterventions.length} active intervention plan(s) found.`)
      ]
    };
  }
};
