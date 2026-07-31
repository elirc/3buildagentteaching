import { assessTermReadiness, LOW_ACCEPTANCE_RATE } from "@agentic-edu/domain";
import { confidenceFromSignals, finding, nextFollowUpDate, recommendation, trace } from "./helpers";
import type { AgentDefinition, TermPostmortemInput, TermPostmortemOutput } from "./types";

/* ------------------------------------------------------------------ *
 * Thresholds this agent owns.
 *
 * The aggregation thresholds live in packages/domain/src/term-analysis.ts
 * because they decide what is *true* about a term. These decide what the
 * agent *says* about it, which is a different question and belongs here.
 * ------------------------------------------------------------------ */

/** Below this many sections, a postmortem is describing a term that barely ran. */
const SPARSE_TERM_SECTION_COUNT = 2;
/** Sections needing review beyond this reads as a systemic problem, not a local one. */
const SYSTEMIC_REVIEW_COUNT = 3;
/** Confidence floor a sparse term must fall below, per US-20's fixtures. */
const SPARSE_TERM_CONFIDENCE_PENALTY = 35;

export const termPostmortemAgent: AgentDefinition<TermPostmortemInput, TermPostmortemOutput> = {
  type: "TermPostmortem",
  name: "Term Postmortem Agent",
  description: "Reviews a completed term and recommends what to change before the next one starts.",
  targetTypes: ["AcademicTerm"],
  run(input) {
    const { analysis } = input;
    const readiness = assessTermReadiness(analysis);
    const sectionCount = analysis.sectionHighlights.length;
    const sparse = sectionCount < SPARSE_TERM_SECTION_COUNT;

    const { completed, abandoned, stillActive } = analysis.interventionEffectiveness;
    const decided = completed + abandoned;
    const interventionNarrative =
      decided === 0 && stillActive === 0
        ? "No intervention plans ran this term."
        : `${completed} of ${decided + stillActive} plan(s) completed; ${abandoned} cancelled; ${stillActive} still active at term end.`;

    /*
     * Recommendations are ordered most-actionable first and each names its
     * owner in the recommendations array below rather than in the prose. The
     * prose is for a human reading the report; the owner is what routes the
     * work into someone's queue (see the at-risk agent's comment on the same
     * distinction — advice about escalation that does not change the owner is
     * not escalation).
     */
    const recommendationsForNextTerm: string[] = [];
    if (analysis.totalUngraded > 0) {
      recommendationsForNextTerm.push(
        `Clear the ${analysis.totalUngraded} ungraded submission(s) before closing the term — averages are not final until they are scored.`
      );
    }
    if (analysis.sectionsNeedingReview.length >= SYSTEMIC_REVIEW_COUNT) {
      recommendationsForNextTerm.push(
        `${analysis.sectionsNeedingReview.length} sections need review, which is a timetable or staffing question rather than a series of individual ones.`
      );
    } else if (analysis.sectionsNeedingReview.length > 0) {
      recommendationsForNextTerm.push(
        `Review ${analysis.sectionsNeedingReview.length} flagged section(s) with their teachers before the next term is planned.`
      );
    }
    if (stillActive > 0) {
      recommendationsForNextTerm.push(`Assign an owner to ${stillActive} intervention plan(s) carrying into next term.`);
    }
    if (analysis.staffingObservations.length > 0) {
      recommendationsForNextTerm.push("Rebalance teaching load before the next term is timetabled.");
    }
    if (analysis.recommendationAcceptanceRate !== null && analysis.recommendationAcceptanceRate < LOW_ACCEPTANCE_RATE) {
      // A low acceptance rate is a signal about the agents, not about the staff.
      recommendationsForNextTerm.push(
        `Only ${Math.round(analysis.recommendationAcceptanceRate * 100)}% of agent recommendations were accepted — review whether they are useful before relying on them further.`
      );
    }
    if (recommendationsForNextTerm.length === 0) {
      recommendationsForNextTerm.push("No structural changes indicated. Carry the current plan into next term.");
    }

    const output: TermPostmortemOutput = {
      executiveSummary: sparse
        ? `${input.termName} has too little activity to draw conclusions from: ${sectionCount} section(s) recorded.`
        : `${input.termName} closed with ${sectionCount} section(s), ${analysis.sectionsNeedingReview.length} needing review, and ${analysis.totalUngraded} ungraded submission(s).`,
      sectionHighlights: analysis.sectionHighlights,
      sectionsNeedingReview: analysis.sectionsNeedingReview,
      interventionEffectiveness: { completed, abandoned, narrative: interventionNarrative },
      staffingObservations: analysis.staffingObservations,
      dataQualityIssues: analysis.dataQualityIssues,
      recommendationsForNextTerm,
      nextTermReadiness: readiness
    };

    return {
      output,
      /*
       * Confidence is about how much the agent had to look at, not how strong
       * its opinion is. A term with one section and no interventions produces a
       * confident-sounding narrative from almost no evidence, and that is
       * exactly the output a reader should distrust.
       */
      confidenceScore: confidenceFromSignals(84, [
        sparse ? SPARSE_TERM_CONFIDENCE_PENALTY : 0,
        analysis.sectionHighlights.every((section) => section.average === null) ? 15 : 0,
        analysis.interventionEffectiveness.completed + analysis.interventionEffectiveness.abandoned + stillActive === 0 ? 6 : 0,
        analysis.recommendationAcceptanceRate === null ? 4 : 0
      ]),
      findings: [
        finding(
          readiness === "Blocked" ? "critical" : readiness === "NeedsWork" ? "warning" : "info",
          "Next term readiness",
          `${readiness}. ${output.executiveSummary}`
        ),
        finding(
          analysis.dataQualityIssues.length > 0 ? "warning" : "info",
          "Data quality",
          analysis.dataQualityIssues.join(" ") || "No data quality issues detected for this term."
        )
      ],
      recommendations: [
        /*
         * Owner routing, per US-20: capacity and staffing to Admin, grading
         * backlog to Teacher, unresolved interventions to Advisor. Ordered so
         * the most severe outstanding item decides the owner — a term with both
         * a grading backlog and unresolved plans is an Admin problem first.
         */
        recommendation(
          analysis.staffingObservations.length > 0
            ? "Admin"
            : analysis.totalUngraded > 0
              ? "Teacher"
              : stillActive > 0
                ? "Advisor"
                : "Admin",
          recommendationsForNextTerm[0] ?? "Review the term postmortem with school leadership.",
          readiness === "Blocked" ? "high" : readiness === "NeedsWork" ? "medium" : "low"
        )
      ],
      limitations: [
        "The postmortem reads recorded data only; it cannot see staffing changes, absences, or events that were never entered.",
        "Thresholds are school-agnostic defaults and should be tuned before being used to judge a department."
      ],
      trace: [
        trace("sections", `Summarised ${sectionCount} section(s).`),
        trace("review-flags", `${analysis.sectionsNeedingReview.length} section(s) flagged for review.`),
        trace("interventions", interventionNarrative),
        trace("readiness", `Assessed next-term readiness as ${readiness}.`),
        trace("follow-up", `Suggested revisit on ${nextFollowUpDate(readiness === "Blocked" ? 2 : 14, input.now)}.`)
      ]
    };
  }
};
