import type { RiskLevel } from "@agentic-edu/shared";

/* ------------------------------------------------------------------ *
 * Thresholds
 *
 * Named constants at the top rather than magic numbers inline, so the
 * policy this agent encodes is readable in one place and arguable
 * without reading the arithmetic. Every one of these is a judgement a
 * school could reasonably set differently.
 * ------------------------------------------------------------------ */

/** A section average at or below this is flagged for review. */
export const SECTION_AVERAGE_REVIEW_THRESHOLD = 70;
/** Missing-work rate (0..1) at or above which a section is flagged. */
export const SECTION_MISSING_RATE_THRESHOLD = 0.2;
/** Ungraded submissions at term end above which readiness is degraded. */
export const UNGRADED_AT_TERM_END_BLOCKER = 0;
/** Interventions still Active at term end above which staffing is flagged. */
export const UNRESOLVED_INTERVENTION_THRESHOLD = 1;
/** Teacher workload score above which staffing is called out. */
export const HEAVY_WORKLOAD_THRESHOLD = 70;
/** Recommendation acceptance below this suggests the agents are not trusted. */
export const LOW_ACCEPTANCE_RATE = 0.34;

export interface TermSectionInput {
  sectionId: string;
  sectionLabel: string;
  teacherName: string;
  enrolledCount: number;
  classAverage: number | null;
  submittedCount: number;
  missingCount: number;
  ungradedCount: number;
  attendanceConcernCount: number;
}

export interface TermInterventionInput {
  status: string;
  riskArea: string;
}

export interface TermAnalysisInput {
  termName: string;
  sections: TermSectionInput[];
  interventions: TermInterventionInput[];
  teacherWorkloads: Array<{ teacherName: string; score: number }>;
  agentRunCount: number;
  recommendationsProposed: number;
  recommendationsAccepted: number;
  deadLetteredJobCount: number;
  studentRiskLevels: RiskLevel[];
}

export interface SectionHighlight {
  sectionId: string;
  headline: string;
  average: number | null;
}

export interface SectionReviewFlag {
  sectionId: string;
  reason: string;
}

export interface TermAnalysis {
  sectionHighlights: SectionHighlight[];
  sectionsNeedingReview: SectionReviewFlag[];
  interventionEffectiveness: { completed: number; abandoned: number; stillActive: number };
  staffingObservations: string[];
  dataQualityIssues: string[];
  /** 0..1, or null when no recommendations were made. */
  recommendationAcceptanceRate: number | null;
  totalUngraded: number;
  riskCounts: Record<RiskLevel, number>;
}

const LEVELS: readonly RiskLevel[] = ["Low", "Medium", "High", "Critical"];

/**
 * Reduces a term's raw rows into the facts a postmortem is written from.
 *
 * Pure, and separate from the agent that narrates it. The agent decides what to
 * *say*; this decides what is *true*. Keeping them apart means the thresholds
 * can be tested without asserting on prose, and the prose can change without
 * re-testing the arithmetic.
 *
 * "Abandoned" deliberately means Cancelled, not "still Active". A plan that is
 * still running at term end has not been abandoned — it has not finished, which
 * is a different problem with a different owner, so it is counted separately.
 */
export function analyseTerm(input: TermAnalysisInput): TermAnalysis {
  const sectionHighlights: SectionHighlight[] = [];
  const sectionsNeedingReview: SectionReviewFlag[] = [];
  let totalUngraded = 0;

  for (const section of input.sections) {
    totalUngraded += section.ungradedCount;

    const attempted = section.submittedCount + section.missingCount;
    const missingRate = attempted === 0 ? 0 : section.missingCount / attempted;

    sectionHighlights.push({
      sectionId: section.sectionId,
      headline:
        section.classAverage === null
          ? `${section.sectionLabel}: no graded work to summarise.`
          : `${section.sectionLabel}: class average ${Math.round(section.classAverage)}% across ${section.enrolledCount} student(s).`,
      average: section.classAverage === null ? null : Math.round(section.classAverage)
    });

    /*
     * Reasons accumulate rather than short-circuit. A section can be low-scoring
     * *and* have a backlog *and* have attendance concerns, and a report naming
     * only the first would send someone to fix one third of the problem.
     */
    const reasons: string[] = [];
    if (section.classAverage !== null && section.classAverage <= SECTION_AVERAGE_REVIEW_THRESHOLD) {
      reasons.push(`class average ${Math.round(section.classAverage)}% is at or below ${SECTION_AVERAGE_REVIEW_THRESHOLD}%`);
    }
    if (missingRate >= SECTION_MISSING_RATE_THRESHOLD) {
      reasons.push(`${Math.round(missingRate * 100)}% of attempted work is missing`);
    }
    if (section.ungradedCount > UNGRADED_AT_TERM_END_BLOCKER) {
      reasons.push(`${section.ungradedCount} submission(s) still ungraded`);
    }
    if (section.attendanceConcernCount > 0) {
      reasons.push(`${section.attendanceConcernCount} student(s) with attendance concerns`);
    }
    if (reasons.length > 0) {
      sectionsNeedingReview.push({ sectionId: section.sectionId, reason: reasons.join("; ") });
    }
  }

  const completed = input.interventions.filter((plan) => plan.status === "Completed").length;
  const abandoned = input.interventions.filter((plan) => plan.status === "Cancelled").length;
  const stillActive = input.interventions.filter((plan) => plan.status === "Active").length;

  const staffingObservations: string[] = [];
  for (const workload of input.teacherWorkloads) {
    if (workload.score >= HEAVY_WORKLOAD_THRESHOLD) {
      staffingObservations.push(`${workload.teacherName} finished the term at workload score ${workload.score}.`);
    }
  }
  if (stillActive >= UNRESOLVED_INTERVENTION_THRESHOLD) {
    staffingObservations.push(`${stillActive} intervention plan(s) are still Active at term end and need an owner.`);
  }

  const dataQualityIssues: string[] = [];
  if (totalUngraded > UNGRADED_AT_TERM_END_BLOCKER) {
    dataQualityIssues.push(`${totalUngraded} submission(s) are ungraded at term end.`);
  }
  if (input.deadLetteredJobCount > 0) {
    dataQualityIssues.push(`${input.deadLetteredJobCount} background job(s) dead-lettered during the term.`);
  }
  for (const section of input.sections) {
    if (section.enrolledCount > 0 && section.submittedCount + section.missingCount === 0) {
      dataQualityIssues.push(`${section.sectionLabel} has enrolled students but no submissions at all.`);
    }
  }

  const riskCounts = Object.fromEntries(LEVELS.map((level) => [level, 0])) as Record<RiskLevel, number>;
  for (const level of input.studentRiskLevels) riskCounts[level] += 1;

  return {
    sectionHighlights,
    sectionsNeedingReview,
    interventionEffectiveness: { completed, abandoned, stillActive },
    staffingObservations,
    dataQualityIssues,
    recommendationAcceptanceRate:
      input.recommendationsProposed === 0 ? null : input.recommendationsAccepted / input.recommendationsProposed,
    totalUngraded,
    riskCounts
  };
}

/**
 * Whether the school can start the next term from this one.
 *
 * "Blocked" is reserved for work that must happen before the term can close:
 * ungraded submissions mean grades are not final, and a term whose grades are
 * not final cannot be closed honestly. Everything else is "NeedsWork" — worth
 * doing, not worth blocking on.
 */
export function assessTermReadiness(analysis: TermAnalysis): "Ready" | "NeedsWork" | "Blocked" {
  if (analysis.totalUngraded > UNGRADED_AT_TERM_END_BLOCKER) return "Blocked";
  if (
    analysis.sectionsNeedingReview.length > 0 ||
    analysis.staffingObservations.length > 0 ||
    analysis.dataQualityIssues.length > 0
  ) {
    return "NeedsWork";
  }
  return "Ready";
}

export interface CloseTermDecision {
  allowed: boolean;
  reason?: string;
}

/**
 * Whether a term may be closed.
 *
 * Refuses while any submission is ungraded, and says how many. Closing a term
 * with ungraded work would freeze averages that are not final — a student's
 * transcript would record a mark for work nobody scored, and there is no
 * honest way to correct it afterwards.
 */
export function decideTermClosure(input: { ungradedCount: number; status: string }): CloseTermDecision {
  if (input.status === "Closed" || input.status === "Archived") {
    return { allowed: false, reason: `This term is already ${input.status}.` };
  }
  if (input.ungradedCount > 0) {
    return {
      allowed: false,
      reason: `${input.ungradedCount} submission(s) are still ungraded. Grade them before closing the term.`
    };
  }
  return { allowed: true };
}
