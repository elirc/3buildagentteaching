import { summarizeAttendance } from "@agentic-edu/domain";
import { confidenceFromSignals, finding, recommendation, trace } from "./helpers";
import type { AgentDefinition, AttendanceAnomalyInput, AttendanceAnomalyOutput } from "./types";

export const attendanceAnomalyAgent: AgentDefinition<AttendanceAnomalyInput, AttendanceAnomalyOutput> = {
  type: "AttendanceAnomaly",
  name: "Attendance Anomaly Agent",
  description: "Detects absence streaks, tardy clusters, section spikes, and missing attendance data.",
  targetTypes: ["Student", "ClassSection"],
  run(input) {
    const summary = summarizeAttendance(input.records);
    const evidence: string[] = [];
    let anomalyScore = 0;
    let anomalyType: AttendanceAnomalyOutput["anomalyType"] = "NoAnomaly";
    let suspectedCauseCategory: AttendanceAnomalyOutput["suspectedCauseCategory"] = "Unknown";

    if (input.records.length === 0) {
      anomalyScore = 70;
      anomalyType = "DataQuality";
      suspectedCauseCategory = "DataQuality";
      evidence.push("No attendance records exist for the selected range.");
    }
    if (summary.longestAbsenceStreak >= 3) {
      anomalyScore += 45;
      anomalyType = "AbsenceStreak";
      suspectedCauseCategory = "AcademicEngagement";
      evidence.push(`Longest absence streak is ${summary.longestAbsenceStreak}.`);
    }
    if (summary.tardy >= 4) {
      anomalyScore += 25;
      anomalyType = anomalyType === "NoAnomaly" ? "TardyCluster" : anomalyType;
      suspectedCauseCategory = "AcademicEngagement";
      evidence.push(`${summary.tardy} tardies in ${input.dateRangeLabel}.`);
    }
    if (input.targetType === "ClassSection" && summary.absent >= 8) {
      anomalyScore += 35;
      anomalyType = "SectionSpike";
      suspectedCauseCategory = "ScheduleOrEvent";
      evidence.push(`Section-wide absence count is ${summary.absent}.`);
    }
    if (input.historicalAverageIssuePoints !== undefined && summary.issuePoints > input.historicalAverageIssuePoints * 1.7) {
      anomalyScore += 20;
      evidence.push(`Issue points ${summary.issuePoints} exceed historical average ${input.historicalAverageIssuePoints}.`);
    }
    if (summary.excused > summary.absent) {
      anomalyScore -= 12;
      evidence.push("Excused absences reduce concern.");
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(anomalyScore)));
    const advisorFollowUpRecommended = finalScore >= 60 && suspectedCauseCategory !== "DataQuality";
    const output: AttendanceAnomalyOutput = {
      anomalyScore: finalScore,
      anomalyType,
      affectedTarget: input.targetName,
      evidence: evidence.length > 0 ? evidence : ["Attendance pattern is within expected range."],
      suspectedCauseCategory,
      recommendedNextAction:
        anomalyType === "DataQuality"
          ? "Check whether attendance import or daily entry failed for this range."
          : advisorFollowUpRecommended
            ? "Advisor should contact the student/guardian and document follow-up."
            : "Continue monitoring in the next attendance cycle.",
      advisorFollowUpRecommended
    };

    return {
      output,
      confidenceScore: confidenceFromSignals(78, [input.records.length === 0 ? 20 : 0, input.relatedSupportNotes?.length ? 0 : 5]),
      findings: [
        finding(finalScore >= 70 ? "critical" : finalScore >= 40 ? "warning" : "info", anomalyType, output.evidence.join(" "))
      ],
      recommendations: [recommendation(advisorFollowUpRecommended ? "Advisor" : "Teacher", output.recommendedNextAction, finalScore >= 60 ? "high" : "medium")],
      limitations: ["The heuristic cannot explain off-platform causes such as illness or transportation issues."],
      trace: [
        trace("attendance-summary", `Absent=${summary.absent}, tardy=${summary.tardy}, excused=${summary.excused}.`),
        trace("streak", `Longest absence streak ${summary.longestAbsenceStreak}.`),
        trace("score", `Anomaly score ${finalScore}.`, finalScore)
      ]
    };
  }
};
