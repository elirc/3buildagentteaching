import { confidenceFromSignals, finding, recommendation, trace } from "./helpers";
import type { AgentDefinition, GuardianCommunicationDraftInput, GuardianCommunicationDraftOutput } from "./types";

export const guardianCommunicationDraftAgent: AgentDefinition<
  GuardianCommunicationDraftInput,
  GuardianCommunicationDraftOutput
> = {
  type: "GuardianCommunicationDraft",
  name: "Guardian Communication Draft Agent",
  description: "Drafts deterministic guardian outreach that must be reviewed by a human before sending.",
  targetTypes: ["Student"],
  run(input) {
    const average = input.gradeSummary.average;
    const absences = input.attendanceSummary.absent;
    const tone =
      input.communicationReason === "PositiveProgress"
        ? "Celebratory"
        : average !== null && average < 65 || absences >= 5
          ? "Urgent"
          : "Supportive";
    const primaryConcern =
      input.communicationReason === "AttendanceConcern"
        ? `${absences} recent absence(s)`
        : input.communicationReason === "GradeConcern"
          ? `a current grade average of ${average === null ? "no recent graded work" : `${Math.round(average)}%`}`
          : input.activeInterventionSummary
            ? "an active intervention plan update"
            : "recent progress worth sharing";

    const bodyLines = [
      `Hello ${input.guardianName},`,
      "",
      `I am reaching out about ${input.studentName} because we are tracking ${primaryConcern}.`,
      input.missingAssignmentCount > 0
        ? `${input.studentName} currently has ${input.missingAssignmentCount} missing assignment(s), so a short recovery plan may help.`
        : `${input.studentName} does not currently have missing work in this snapshot.`,
      input.activeInterventionSummary
        ? `Current support plan: ${input.activeInterventionSummary}`
        : "No active support plan is included in this draft, so staff should confirm whether one is needed.",
      "",
      "Before this message is sent, please review for accuracy, tone, and any context that should stay out of guardian communications."
    ];

    const output: GuardianCommunicationDraftOutput = {
      subject:
        input.communicationReason === "PositiveProgress"
          ? `${input.studentName}: progress update`
          : `${input.studentName}: support follow-up`,
      draftBody: bodyLines.join("\n"),
      tone,
      requiredHumanReview: true,
      sensitiveContentWarnings:
        input.teacherNotes.length > 0
          ? ["Teacher/support notes may contain sensitive context; review before including specifics."]
          : ["No support-note context was included."],
      suggestedSendWindow: tone === "Urgent" ? "Next school day" : "Within three school days"
    };

    return {
      output,
      confidenceScore: confidenceFromSignals(82, [
        average === null ? 12 : 0,
        input.attendanceSummary.attendanceRate === null ? 10 : 0,
        input.teacherNotes.length === 0 ? 5 : 0
      ]),
      findings: [
        finding(tone === "Urgent" ? "warning" : "info", "Guardian outreach draft", `Tone selected as ${tone}.`),
        finding("info", "Human approval required", "The agent drafts communication but does not send it.")
      ],
      recommendations: [
        recommendation("Advisor", "Review the guardian communication draft before sending.", tone === "Urgent" ? "high" : "medium")
      ],
      limitations: [
        "Draft is template-based and cannot infer family context beyond the supplied snapshot.",
        "No communication is sent automatically."
      ],
      trace: [
        trace("primary-concern", `Selected concern: ${primaryConcern}.`),
        trace("tone", `Mapped concern signals to ${tone} tone.`),
        trace("review", "Forced human review for guardian-facing text.")
      ]
    };
  }
};
