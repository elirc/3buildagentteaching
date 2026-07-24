import { calculatePercentage } from "@agentic-edu/domain";
import { confidenceFromSignals, finding, recommendation, trace } from "./helpers";
import type { AgentDefinition, AssignmentFeedbackInput, AssignmentFeedbackOutput } from "./types";

export const assignmentFeedbackAgent: AgentDefinition<AssignmentFeedbackInput, AssignmentFeedbackOutput> = {
  type: "AssignmentFeedback",
  name: "Assignment Feedback Agent",
  description: "Drafts deterministic feedback for a submission based on score, lateness, type, and rubric fields.",
  targetTypes: ["Submission", "Assignment"],
  run(input) {
    const percentage = calculatePercentage(input.submission.score, input.assignment.pointsPossible);
    const isLate = Boolean(input.submission.submittedAt && input.submission.submittedAt > input.assignment.dueDate);
    const isEmpty = !input.submission.contentText?.trim();
    const missingCriteria = input.rubricFields?.filter((field) => !input.submission.contentText?.toLowerCase().includes(field.toLowerCase())) ?? [];
    const suggestions: string[] = [];

    if (percentage === null || isEmpty) {
      suggestions.push("Submit complete work that directly addresses the assignment prompt.");
    } else if (percentage >= 90) {
      suggestions.push("Keep using the strategies that produced this strong result.");
    } else if (percentage >= 70) {
      suggestions.push("Revise the lower-scoring criteria and add more specific evidence.");
    } else {
      suggestions.push("Review the core concepts and meet with the teacher before the next assessment.");
    }

    if (input.assignment.type === "Project" || input.assignment.type === "Lab") {
      suggestions.push("Document process, evidence, and reflection more explicitly.");
    }
    if (input.assignment.type === "Quiz" || input.assignment.type === "Exam") {
      suggestions.push("Revisit missed topics and practice retrieval before the next quiz or exam.");
    }
    if (isLate) {
      suggestions.push("Plan checkpoints before the due date to improve timeliness.");
    }

    const output: AssignmentFeedbackOutput = {
      feedbackSummary:
        percentage === null
          ? "Submission cannot be scored confidently from the available data."
          : `Submission score is ${Math.round(percentage)}% for ${input.assignment.title}.`,
      studentFacingFeedbackDraft:
        percentage === null
          ? "This work appears incomplete. Please review the assignment requirements and submit the missing parts."
          : percentage >= 90
            ? "Strong work. Your response shows command of the main criteria and should be used as a model for future assignments."
            : percentage >= 70
              ? "You are on the right track. Focus your revision on adding stronger evidence and tightening the incomplete criteria."
              : "This submission needs more support. Review the core ideas, address the missing criteria, and ask for help before the next due date.",
      teacherFacingGradingNotes: [
        percentage === null ? "Score is missing or points possible is invalid." : `Calculated performance band from ${Math.round(percentage)}%.`,
        isEmpty ? "Submission text is empty or missing." : "Submission includes student text.",
        isLate ? "Submission was late." : "Submission was on time or no timestamp was provided."
      ],
      missingCriteria,
      lateSubmissionNote: isLate ? "Submission was received after the due date." : null,
      improvementSuggestions: suggestions
    };

    return {
      output,
      confidenceScore: confidenceFromSignals(80, [percentage === null ? 20 : 0, isEmpty ? 15 : 0, missingCriteria.length > 3 ? 8 : 0]),
      findings: [
        ...(isEmpty ? [finding("warning", "Incomplete work", "Submission content is empty.")] : []),
        ...(isLate ? [finding("info", "Late submission", "Submission timestamp is after due date.")] : []),
        ...(percentage !== null && percentage < 70 ? [finding("warning", "Low score", `Score is ${Math.round(percentage)}%.`)] : [])
      ],
      recommendations: [recommendation("Teacher", "Review the feedback draft before returning it to the student.", "medium")],
      limitations: ["Feedback is template-based and cannot interpret nuanced writing quality."],
      trace: [
        trace("score", percentage === null ? "No score percentage available." : `Calculated score percentage ${Math.round(percentage)}%.`),
        trace("lateness", isLate ? "Submission is late." : "No late submission signal."),
        trace("criteria", `${missingCriteria.length} rubric criteria missing from simple text match.`)
      ]
    };
  }
};
