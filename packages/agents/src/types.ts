import type {
  AgentTargetType,
  AgentType,
  AssignmentType,
  EmploymentStatus,
  JobStatus,
  RiskLevel
} from "@agentic-edu/shared";
import type { AttendanceRecordLike, AttendanceSummary, GradeSummary, ScoreRecord } from "@agentic-edu/domain";

export interface AgentFinding {
  severity: "info" | "warning" | "critical";
  title: string;
  evidence: string;
}

export interface AgentRecommendation {
  owner: "Teacher" | "Advisor" | "Admin" | "Guardian" | "System";
  action: string;
  priority: "low" | "medium" | "high";
}

export interface AgentTraceStep {
  step: string;
  detail: string;
  scoreDelta?: number;
}

export interface AgentRunResult<TOutput> {
  output: TOutput;
  confidenceScore: number;
  findings: AgentFinding[];
  recommendations: AgentRecommendation[];
  limitations: string[];
  trace: AgentTraceStep[];
}

export interface AgentDefinition<TInput, TOutput> {
  type: AgentType;
  name: string;
  description: string;
  targetTypes: AgentTargetType[];
  run(input: TInput): AgentRunResult<TOutput>;
}

export interface StudentProgressInput {
  studentProfile: {
    id: string;
    firstName: string;
    lastName: string;
    enrollmentStatus: string;
    gradeLevel: number;
  };
  activeEnrollments: Array<{ sectionName: string; courseTitle: string }>;
  recentGrades: ScoreRecord[];
  missingAssignments: number;
  lateAssignments: number;
  attendanceRecords: AttendanceRecordLike[];
  supportNotes: Array<{ noteType: string; content: string; createdAt?: Date }>;
  activeInterventionPlans: Array<{ riskArea: string; summary: string; followUpDate?: Date }>;
}

export interface StudentProgressOutput {
  academicSummary: string;
  strengths: string[];
  concerns: string[];
  gradeTrend: GradeSummary["trend"];
  attendanceTrend: AttendanceSummary["concernLevel"];
  missingWorkSummary: string;
  recommendedNextActions: string[];
  recommendedOwner: "Teacher" | "Advisor" | "Admin" | "Guardian";
  interventionRecommended: boolean;
}

export interface AtRiskInput {
  studentName: string;
  gradeSummary: GradeSummary;
  attendanceSummary: AttendanceSummary;
  interventionHistory: Array<{ status: string; riskArea: string; summary: string }>;
  recentSupportNotes: Array<{ noteType: string; content: string }>;
}

export interface AtRiskOutput {
  riskScore: number;
  riskLevel: RiskLevel;
  primaryRiskAreas: string[];
  evidence: string[];
  recommendedIntervention: string;
  suggestedFollowUpDate: string;
  escalationRecommendation: string;
}

export interface AssignmentFeedbackInput {
  assignment: {
    title: string;
    type: AssignmentType;
    dueDate: Date;
    pointsPossible: number;
  };
  submission: {
    status: string;
    submittedAt?: Date | null;
    contentText?: string | null;
    score?: number | null;
    feedback?: string | null;
  };
  rubricFields?: string[];
}

export interface AssignmentFeedbackOutput {
  feedbackSummary: string;
  studentFacingFeedbackDraft: string;
  teacherFacingGradingNotes: string[];
  missingCriteria: string[];
  lateSubmissionNote: string | null;
  improvementSuggestions: string[];
}

export interface AttendanceAnomalyInput {
  targetName: string;
  targetType: "Student" | "ClassSection";
  records: AttendanceRecordLike[];
  dateRangeLabel: string;
  historicalAverageIssuePoints?: number;
  relatedSupportNotes?: Array<{ noteType: string; content: string }>;
}

export interface AttendanceAnomalyOutput {
  anomalyScore: number;
  anomalyType: "AbsenceStreak" | "TardyCluster" | "SectionSpike" | "DataQuality" | "NoAnomaly";
  affectedTarget: string;
  evidence: string[];
  suspectedCauseCategory: "AcademicEngagement" | "ScheduleOrEvent" | "DataQuality" | "Unknown";
  recommendedNextAction: string;
  advisorFollowUpRecommended: boolean;
}

export interface TeacherWorkloadAgentInput {
  teacherProfile: {
    id: string;
    name: string;
    employmentStatus: EmploymentStatus;
  };
  activeSectionCount: number;
  studentCount: number;
  activeAssignmentCount: number;
  ungradedSubmissionCount: number;
  highRiskStudentCount: number;
  recentSupportNoteCount: number;
  failedJobCount: number;
}

export interface TeacherWorkloadAgentOutput {
  workloadSummary: string;
  workloadScore: number;
  overloadedIndicators: string[];
  gradingBacklogSummary: string;
  sectionSizeConcerns: string[];
  recommendedAdministrativeAction: string;
}

export interface FailedJobInvestigationInput {
  job: {
    id: string;
    type: string;
    status: JobStatus;
    attempts: number;
    maxAttempts: number;
    errorMessage?: string | null;
    payload?: unknown;
  };
  relatedLogs: Array<{ level: string; message: string; fingerprint: string }>;
}

export interface FailedJobInvestigationOutput {
  summary: string;
  suspectedRootCause: string;
  retryRecommendation: "Retry" | "DeadLetter" | "FixPayloadThenRetry" | "Escalate";
  evidence: string[];
  nextActions: string[];
}

export interface GuardianCommunicationDraftInput {
  studentName: string;
  guardianName: string;
  guardianEmail: string;
  communicationReason: "AttendanceConcern" | "GradeConcern" | "InterventionUpdate" | "PositiveProgress";
  gradeSummary: GradeSummary;
  attendanceSummary: AttendanceSummary;
  missingAssignmentCount: number;
  activeInterventionSummary?: string | null;
  teacherNotes: Array<{ noteType: string; content: string }>;
}

export interface GuardianCommunicationDraftOutput {
  subject: string;
  draftBody: string;
  tone: "Supportive" | "Urgent" | "Celebratory";
  requiredHumanReview: boolean;
  sensitiveContentWarnings: string[];
  suggestedSendWindow: string;
}

export interface GradingConsistencyInput {
  assignment: {
    id: string;
    title: string;
    type: AssignmentType;
    pointsPossible: number;
  };
  submissions: Array<{
    studentId: string;
    status: string;
    score: number | null;
    feedback: string | null;
    criterionScores?: Array<{ criterionTitle: string; score: number; pointsPossible: number }>;
  }>;
}

export interface GradingConsistencyOutput {
  consistencyScore: number;
  outlierStudentIds: string[];
  feedbackCoverageSummary: string;
  rubricCoverageSummary: string;
  recommendedTeacherActions: string[];
}

export interface StudentSuccessReviewInput {
  studentName: string;
  progress: StudentProgressOutput;
  risk: AtRiskOutput;
  attendance: AttendanceAnomalyOutput;
  activeInterventions: Array<{ riskArea: string; summary: string; followUpDate?: Date }>;
  guardianDigestOptIn: boolean;
}

export interface StudentSuccessReviewOutput {
  executiveSummary: string;
  orchestratedFindings: string[];
  recommendedPlan: string[];
  subagentSummaries: Array<{ agentType: AgentType; summary: string; confidence: number }>;
  needsHumanApproval: boolean;
  nextReviewDate: string;
}
