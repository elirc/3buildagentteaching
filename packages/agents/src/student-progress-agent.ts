import { calculateGradeSummary, summarizeAttendance } from "@agentic-edu/domain";
import type { AgentDefinition, StudentProgressInput, StudentProgressOutput } from "./types";
import { confidenceFromSignals, finding, recommendation, trace } from "./helpers";

export const studentProgressSummaryAgent: AgentDefinition<StudentProgressInput, StudentProgressOutput> = {
  type: "StudentProgressSummary",
  name: "Student Progress Summary Agent",
  description: "Creates a deterministic academic progress summary from grades, attendance, missing work, and support context.",
  targetTypes: ["Student"],
  run(input) {
    const gradeSummary = calculateGradeSummary(input.recentGrades);
    const attendanceSummary = summarizeAttendance(input.attendanceRecords);
    const traceSteps = [
      trace("grade-summary", `Calculated ${gradeSummary.performanceBand} from ${gradeSummary.gradedCount} graded item(s).`),
      trace("attendance-summary", `Attendance concern level is ${attendanceSummary.concernLevel}.`),
      trace("support-context", `Included ${input.supportNotes.length} visible support note(s).`),
      trace("intervention-context", `Found ${input.activeInterventionPlans.length} active intervention plan(s).`)
    ];

    const strengths: string[] = [];
    const concerns: string[] = [];
    const findings = [];
    const recommendations = [];

    if (gradeSummary.average !== null && gradeSummary.average >= 80) {
      strengths.push("Current graded work shows solid academic performance.");
    }
    if (gradeSummary.trend === "Improving") {
      strengths.push("Recent scores are improving.");
    }
    if (attendanceSummary.concernLevel === "Normal") {
      strengths.push("Attendance does not currently show a major concern.");
    }

    if (gradeSummary.average !== null && gradeSummary.average < 70) {
      concerns.push("Grade average is below the intervention threshold.");
      findings.push(finding("warning", "Academic risk", `Average is ${Math.round(gradeSummary.average)}%.`));
      recommendations.push(recommendation("Teacher", "Create a targeted reteach/check-in plan for the lowest scoring assignments.", "high"));
    }
    if (input.missingAssignments > 3) {
      concerns.push("Missing assignments are accumulating.");
      findings.push(finding("warning", "Missing work", `${input.missingAssignments} missing assignment(s).`));
      recommendations.push(recommendation("Advisor", "Schedule a missing-work recovery conference.", "high"));
    }
    if (attendanceSummary.absent >= 5 || attendanceSummary.longestAbsenceStreak >= 3) {
      concerns.push("Attendance pattern may be affecting progress.");
      findings.push(finding("critical", "Attendance concern", `${attendanceSummary.absent} absence(s), longest streak ${attendanceSummary.longestAbsenceStreak}.`));
      recommendations.push(recommendation("Advisor", "Follow up with guardian and student about recent absences.", "high"));
    }
    if (input.activeInterventionPlans.length > 0) {
      concerns.push("An active intervention plan should be reviewed before creating a duplicate plan.");
      recommendations.push(recommendation("Advisor", "Review the active intervention plan and update follow-up notes.", "medium"));
    }

    const interventionRecommended =
      (gradeSummary.average !== null && gradeSummary.average < 70) ||
      input.missingAssignments > 3 ||
      attendanceSummary.absent >= 5;

    const recommendedOwner = attendanceSummary.absent >= 5 ? "Advisor" : gradeSummary.average !== null && gradeSummary.average < 70 ? "Teacher" : "Guardian";
    const penalties = [
      gradeSummary.gradedCount === 0 ? 25 : 0,
      input.attendanceRecords.length === 0 ? 20 : 0,
      input.supportNotes.length === 0 ? 5 : 0
    ];

    const output: StudentProgressOutput = {
      academicSummary: `${input.studentProfile.firstName} ${input.studentProfile.lastName} is enrolled in ${input.activeEnrollments.length} active section(s). Current performance is ${gradeSummary.performanceBand.toLowerCase()} with ${attendanceSummary.concernLevel.toLowerCase()} attendance concern.`,
      strengths: strengths.length > 0 ? strengths : ["Strengths require more recent evidence."],
      concerns: concerns.length > 0 ? concerns : ["No major concerns detected from available data."],
      gradeTrend: gradeSummary.trend,
      attendanceTrend: attendanceSummary.concernLevel,
      missingWorkSummary: `${input.missingAssignments} missing and ${input.lateAssignments} late assignment(s).`,
      recommendedNextActions: recommendations.map((item) => item.action),
      recommendedOwner,
      interventionRecommended
    };

    return {
      output,
      confidenceScore: confidenceFromSignals(82, penalties),
      findings,
      recommendations,
      limitations: [
        "Deterministic analysis only; no natural language model is called.",
        "Quality depends on current grade, attendance, and support-note completeness."
      ],
      trace: traceSteps
    };
  }
};
