import type { AgentDefinition, AgentRunResult } from "./types";
import { assignmentFeedbackAgent } from "./assignment-feedback-agent";
import { atRiskStudentDetectionAgent } from "./at-risk-agent";
import { attendanceAnomalyAgent } from "./attendance-anomaly-agent";
import { failedJobInvestigationAgent } from "./failed-job-agent";
import { gradingConsistencyAgent } from "./grading-consistency-agent";
import { guardianCommunicationDraftAgent } from "./guardian-communication-agent";
import { studentProgressSummaryAgent } from "./student-progress-agent";
import { studentSuccessReviewAgent } from "./student-success-review-agent";
import { teacherWorkloadInsightAgent } from "./teacher-workload-agent";
import { termPostmortemAgent } from "./term-postmortem-agent";
import type { AgentType } from "@agentic-edu/shared";

export const agentRegistry = {
  StudentProgressSummary: studentProgressSummaryAgent,
  AtRiskStudentDetection: atRiskStudentDetectionAgent,
  AssignmentFeedback: assignmentFeedbackAgent,
  AttendanceAnomaly: attendanceAnomalyAgent,
  TeacherWorkloadInsight: teacherWorkloadInsightAgent,
  FailedJobInvestigation: failedJobInvestigationAgent,
  GuardianCommunicationDraft: guardianCommunicationDraftAgent,
  GradingConsistency: gradingConsistencyAgent,
  StudentSuccessReview: studentSuccessReviewAgent,
  TermPostmortem: termPostmortemAgent
} satisfies Record<AgentType, AgentDefinition<unknown, unknown>>;

export function listAgents(): AgentDefinition<unknown, unknown>[] {
  return Object.values(agentRegistry);
}

export function getAgent(type: AgentType): AgentDefinition<unknown, unknown> {
  return agentRegistry[type];
}

export function executeAgent<TInput, TOutput>(type: AgentType, input: TInput): AgentRunResult<TOutput> {
  const agent = getAgent(type) as AgentDefinition<TInput, TOutput>;
  return agent.run(input);
}
