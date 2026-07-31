import { confidenceFromSubagents, executeAgent } from "@agentic-edu/agents";
import type {
  AssignmentFeedbackInput,
  AssignmentFeedbackOutput,
  AtRiskInput,
  AtRiskOutput,
  AttendanceAnomalyInput,
  AttendanceAnomalyOutput,
  FailedJobInvestigationInput,
  FailedJobInvestigationOutput,
  GradingConsistencyInput,
  GradingConsistencyOutput,
  GuardianCommunicationDraftInput,
  GuardianCommunicationDraftOutput,
  StudentSuccessReviewInput,
  StudentSuccessReviewOutput,
  StudentProgressInput,
  StudentProgressOutput,
  TeacherWorkloadAgentInput,
  TeacherWorkloadAgentOutput,
  TermPostmortemInput,
  TermPostmortemOutput,
  AgentRecommendation as AgentRecommendationSuggestion
} from "@agentic-edu/agents";
import { Prisma, prisma } from "@agentic-edu/db";
import {
  analyseTerm,
  calculateGradeSummary,
  scoreStudentRisk,
  scoreTeacherWorkload,
  summarizeAttendance,
  PERMISSION_ACTIONS
} from "@agentic-edu/domain";
import type { AgentRunStatus, AgentTargetType, AgentType } from "@agentic-edu/shared";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent } from "../audit";
import { AppError } from "../errors";
import { jobService } from "./job-service";
import type { JobPayload } from "../jobs/schemas";
import { withServiceLogging } from "../logging";
import { resolveManifest } from "./manifest-gate";

function jsonSafe(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

const recommendationPriority: Record<AgentRecommendationSuggestion["priority"], number> = {
  low: 1,
  medium: 2,
  high: 3
};

type AgentRunRow = Awaited<ReturnType<typeof startAgentRun>>;

interface AgentExecutionResult<TOutput> {
  output: TOutput;
  confidenceScore: number;
  trace: unknown;
  findings: unknown;
  recommendations: unknown;
  limitations: unknown;
}

/**
 * Creates the Running row, after the manifest gate has allowed it.
 *
 * Split out of persistAgentRun because the orchestrator needs the parent's id
 * before its children can exist: a child's parentRunId has to point at
 * something, and nothing exists until this row does. Everything else still goes
 * through persistAgentRun, which composes these three.
 */
async function startAgentRun(input: {
  actor: ActorContext;
  agentType: AgentType;
  targetType: AgentTargetType;
  targetId: string;
  inputSnapshot: unknown;
  parentRunId?: string | null;
}) {
  /*
   * The manifest gate runs BEFORE the AgentRun row is created, and that
   * ordering is the acceptance criterion rather than an implementation detail.
   *
   * A refused run must leave no trace. A Failed row in the table means "it ran
   * and it broke" — a different and more alarming claim than "that agent is
   * switched off", and one that would make the failed-run count on /agent-ops
   * meaningless the moment anyone deactivated a manifest.
   */
  const manifest = await resolveManifest({
    actor: input.actor,
    agentType: input.agentType,
    targetType: input.targetType,
    knownPermissions: PERMISSION_ACTIONS
  });

  return prisma.$transaction(async (tx) => {
    const run = await tx.agentRun.create({
      data: {
        agentType: input.agentType,
        status: "Running" satisfies AgentRunStatus,
        // From the manifest, not from a hardcoded "1.0.0". The runs table used
        // to claim a version the registry had never heard of.
        agentVersion: manifest.version,
        inputSchemaVersion: manifest.inputSchemaVersion,
        outputSchemaVersion: manifest.outputSchemaVersion,
        targetType: input.targetType,
        targetId: input.targetId,
        inputSnapshot: jsonSafe(input.inputSnapshot),
        trace: [],
        startedAt: new Date(),
        createdByUserId: input.actor.id,
        parentRunId: input.parentRunId ?? null
      }
    });
    await createAuditEvent(tx, {
      actorUserId: input.actor.id,
      action: "agent.started",
      entityType: "AgentRun",
      entityId: run.id,
      after: run
    });
    return run;
  });
}

/**
 * Marks a run Succeeded and creates its recommendations.
 *
 * `inputSnapshot` is written here as well as at start, because the orchestrator
 * cannot know its own input until its children have produced theirs. A parent
 * that recorded only the placeholder would be an audit trail of nothing.
 */
async function finishAgentRun<TOutput>(input: {
  actor: ActorContext;
  run: AgentRunRow;
  result: AgentExecutionResult<TOutput>;
  inputSnapshot?: unknown;
}) {
  const { result, run: started } = input;
  const output = {
    ...jsonSafe(result.output),
    findings: result.findings,
    recommendations: result.recommendations,
    limitations: result.limitations
  };

  return prisma.$transaction(async (tx) => {
    const completed = await tx.agentRun.update({
      where: { id: started.id },
      data: {
        status: "Succeeded",
        output: jsonSafe(output),
        confidenceScore: result.confidenceScore,
        trace: jsonSafe(result.trace),
        completedAt: new Date(),
        ...(input.inputSnapshot === undefined ? {} : { inputSnapshot: jsonSafe(input.inputSnapshot) })
      }
    });
    await createAuditEvent(tx, {
      actorUserId: input.actor.id,
      action: "agent.completed",
      entityType: "AgentRun",
      entityId: started.id,
      before: started,
      after: completed
    });
    const recommendations = Array.isArray(result.recommendations)
      ? (result.recommendations as AgentRecommendationSuggestion[])
      : [];
    if (recommendations.length > 0) {
      await tx.agentRecommendation.createMany({
        data: recommendations.map((recommendation) => ({
          agentRunId: started.id,
          status: "Proposed",
          ownerRole: recommendation.owner,
          action: recommendation.action,
          priority: recommendationPriority[recommendation.priority],
          rationale: `Generated by ${started.agentType} with confidence ${result.confidenceScore}.`
        }))
      });
    }
    return completed;
  });
}

async function failAgentRun(input: { actor: ActorContext; run: AgentRunRow; message: string }) {
  return prisma.$transaction(async (tx) => {
    const failed = await tx.agentRun.update({
      where: { id: input.run.id },
      data: { status: "Failed", errorMessage: input.message, completedAt: new Date() }
    });
    await createAuditEvent(tx, {
      actorUserId: input.actor.id,
      action: "agent.failed",
      entityType: "AgentRun",
      entityId: input.run.id,
      before: input.run,
      after: failed
    });
    return failed;
  });
}

async function persistAgentRun<TInput, TOutput>(input: {
  actor: ActorContext;
  agentType: AgentType;
  targetType: AgentTargetType;
  targetId: string;
  inputSnapshot: TInput;
  parentRunId?: string | null;
  execute: () => AgentExecutionResult<TOutput>;
}) {
  const started = await startAgentRun(input);

  try {
    return await finishAgentRun({ actor: input.actor, run: started, result: input.execute() });
  } catch (error) {
    await failAgentRun({
      actor: input.actor,
      run: started,
      message: error instanceof Error ? error.message : "Unknown agent error"
    });
    throw error;
  }
}

export const agentRunService = withServiceLogging("agent-run-service", {
  /**
   * Queues an agent instead of running it inline.
   *
   * Running an agent inside a request is fine for one student. StudentSuccessReview
   * over a whole year group is not — it fans out to three sub-agents each, and
   * the request would time out long before the work finished.
   *
   * The permission check happens here, at enqueue time, not when the worker
   * later picks it up. The worker runs as whoever pressed "Run next job", and
   * checking then would ask the wrong question about the wrong person.
   */
  async enqueueAgentRun(
    actor: ActorContext,
    input: { agentType: JobPayload<"AgentRun">["agentType"]; targetId: string }
  ) {
    assertCan(actor, "agent:run", input.agentType === "TeacherWorkloadInsight" ? { teacherId: input.targetId } : { studentId: input.targetId });

    return jobService.enqueue(actor, {
      type: "AgentRun",
      payload: { agentType: input.agentType, targetId: input.targetId },
      idempotencyKey: `agent:${input.agentType}:${input.targetId}`
    });
  },


  async runStudentProgressAgent(actor: ActorContext, studentId: string) {
    assertCan(actor, "agent:run", { studentId });
    const agentInput = await buildStudentProgressInput(studentId, actor.role);
    return persistAgentRun<StudentProgressInput, StudentProgressOutput>({
      actor,
      agentType: "StudentProgressSummary",
      targetType: "Student",
      targetId: studentId,
      inputSnapshot: agentInput,
      execute: () => executeAgent<StudentProgressInput, StudentProgressOutput>("StudentProgressSummary", agentInput)
    });
  },

  async runAtRiskAgent(actor: ActorContext, studentId: string, now: Date = new Date()) {
    assertCan(actor, "agent:run", { studentId });
    const agentInput = await buildAtRiskInput(studentId, now);
    return persistAgentRun<AtRiskInput, AtRiskOutput>({
      actor,
      agentType: "AtRiskStudentDetection",
      targetType: "Student",
      targetId: studentId,
      inputSnapshot: agentInput,
      execute: () => executeAgent<AtRiskInput, AtRiskOutput>("AtRiskStudentDetection", agentInput)
    });
  },

  async runAssignmentFeedbackAgent(actor: ActorContext, submissionId: string) {
    assertCan(actor, "agent:run");
    const submission = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId }, include: { assignment: true } });
    const agentInput: AssignmentFeedbackInput = {
      assignment: {
        title: submission.assignment.title,
        type: submission.assignment.type,
        dueDate: submission.assignment.dueDate,
        pointsPossible: submission.assignment.pointsPossible
      },
      submission: {
        status: submission.status,
        submittedAt: submission.submittedAt,
        contentText: submission.contentText,
        score: submission.score,
        feedback: submission.feedback
      },
      rubricFields: ["reasoning", "evidence", "complete", "reflection"]
    };
    return persistAgentRun<AssignmentFeedbackInput, AssignmentFeedbackOutput>({
      actor,
      agentType: "AssignmentFeedback",
      targetType: "Submission",
      targetId: submissionId,
      inputSnapshot: agentInput,
      execute: () => executeAgent<AssignmentFeedbackInput, AssignmentFeedbackOutput>("AssignmentFeedback", agentInput)
    });
  },

  async runAttendanceAnomalyAgent(actor: ActorContext, input: { targetType: "Student" | "ClassSection"; targetId: string }) {
    assertCan(actor, "agent:run", input.targetType === "Student" ? { studentId: input.targetId } : {});
    const agentInput = await buildAttendanceAnomalyInput(input.targetType, input.targetId);
    return persistAgentRun<AttendanceAnomalyInput, AttendanceAnomalyOutput>({
      actor,
      agentType: "AttendanceAnomaly",
      targetType: input.targetType,
      targetId: input.targetId,
      inputSnapshot: agentInput,
      execute: () => executeAgent<AttendanceAnomalyInput, AttendanceAnomalyOutput>("AttendanceAnomaly", agentInput)
    });
  },

  async runTeacherWorkloadAgent(actor: ActorContext, teacherId: string) {
    assertCan(actor, "agent:run", { teacherId });
    const agentInput = await buildTeacherWorkloadInput(teacherId);
    return persistAgentRun<TeacherWorkloadAgentInput, TeacherWorkloadAgentOutput>({
      actor,
      agentType: "TeacherWorkloadInsight",
      targetType: "Teacher",
      targetId: teacherId,
      inputSnapshot: agentInput,
      execute: () => executeAgent<TeacherWorkloadAgentInput, TeacherWorkloadAgentOutput>("TeacherWorkloadInsight", agentInput)
    });
  },

  async runFailedJobInvestigationAgent(actor: ActorContext, jobId: string) {
    assertCan(actor, "agent:run");
    const job = await prisma.backgroundJob.findUniqueOrThrow({ where: { id: jobId } });
    const relatedLogs = await prisma.structuredLog.findMany({
      where: {
        OR: [
          { entityType: "Job", entityId: jobId },
          { message: { contains: job.type, mode: "insensitive" } },
          { message: { contains: job.errorMessage ?? "no-error", mode: "insensitive" } }
        ]
      },
      take: 5,
      orderBy: { timestamp: "desc" }
    });
    const agentInput: FailedJobInvestigationInput = {
      job: {
        id: job.id,
        type: job.type,
        status: job.status,
        attempts: job.attempts,
        maxAttempts: job.maxAttempts,
        errorMessage: job.errorMessage,
        payload: job.payload
      },
      relatedLogs: relatedLogs.map((log) => ({ level: log.level, message: log.message, fingerprint: log.fingerprint }))
    };
    return persistAgentRun<FailedJobInvestigationInput, FailedJobInvestigationOutput>({
      actor,
      agentType: "FailedJobInvestigation",
      targetType: "Job",
      targetId: jobId,
      inputSnapshot: agentInput,
      execute: () => executeAgent<FailedJobInvestigationInput, FailedJobInvestigationOutput>("FailedJobInvestigation", agentInput)
    });
  },

  async runGuardianCommunicationDraftAgent(actor: ActorContext, studentId: string) {
    assertCan(actor, "agent:run", { studentId });
    const agentInput = await buildGuardianCommunicationDraftInput(studentId);
    return persistAgentRun<GuardianCommunicationDraftInput, GuardianCommunicationDraftOutput>({
      actor,
      agentType: "GuardianCommunicationDraft",
      targetType: "Student",
      targetId: studentId,
      inputSnapshot: agentInput,
      execute: () => executeAgent<GuardianCommunicationDraftInput, GuardianCommunicationDraftOutput>("GuardianCommunicationDraft", agentInput)
    });
  },

  async runGradingConsistencyAgent(actor: ActorContext, assignmentId: string) {
    assertCan(actor, "agent:run");
    const agentInput = await buildGradingConsistencyInput(assignmentId);
    return persistAgentRun<GradingConsistencyInput, GradingConsistencyOutput>({
      actor,
      agentType: "GradingConsistency",
      targetType: "Assignment",
      targetId: assignmentId,
      inputSnapshot: agentInput,
      execute: () => executeAgent<GradingConsistencyInput, GradingConsistencyOutput>("GradingConsistency", agentInput)
    });
  },

  /**
   * Runs the orchestrator, persisting each sub-agent as a child run.
   *
   * The shape here is the story. The parent is created first and left Running,
   * because a child needs a parentRunId to point at and that id does not exist
   * until the row does. Then each sub-agent runs through persistAgentRun like
   * any other agent — same manifest gate, same audit events, same input
   * snapshot — and the parent consumes their persisted outputs.
   *
   * If a child fails, the parent is marked Failed with a message naming which
   * one, and the children that did succeed are left in place. That is the
   * behaviour an advisor needs: "the review failed because the attendance agent
   * did" is actionable, and the two runs that did work are still worth reading.
   */
  /**
   * Reviews a whole term.
   *
   * Targets an AcademicTerm rather than a student, which is why US-20 had to
   * add an AgentTargetType — and why the manifest's supportedTargets matter:
   * pointing this at a Student is refused by the gate rather than producing a
   * confident report about the wrong kind of thing.
   */
  async runTermPostmortemAgent(actor: ActorContext, termId: string, now: Date = new Date()) {
    assertCan(actor, "agent:run");
    const agentInput = await buildTermPostmortemInput(termId, now);
    return persistAgentRun<TermPostmortemInput, TermPostmortemOutput>({
      actor,
      agentType: "TermPostmortem",
      targetType: "AcademicTerm",
      targetId: termId,
      inputSnapshot: agentInput,
      execute: () => executeAgent<TermPostmortemInput, TermPostmortemOutput>("TermPostmortem", agentInput)
    });
  },

  async runStudentSuccessReviewAgent(actor: ActorContext, studentId: string, now: Date = new Date()) {
    assertCan(actor, "agent:run", { studentId });

    // One fetch for the whole tree. Previously each buildXxxInput helper issued
    // its own findUniqueOrThrow for the same student — four round-trips for one
    // logical operation, concurrent but still four.
    const student = await loadStudentAggregate(studentId);

    const parent = await startAgentRun({
      actor,
      agentType: "StudentSuccessReview",
      targetType: "Student",
      targetId: studentId,
      inputSnapshot: { studentId, note: "Sub-agent runs pending." }
    });

    try {
      const progress = await persistAgentRun<StudentProgressInput, StudentProgressOutput>({
        actor,
        agentType: "StudentProgressSummary",
        targetType: "Student",
        targetId: studentId,
        parentRunId: parent.id,
        inputSnapshot: buildStudentProgressInputFrom(student, actor.role),
        execute: () =>
          executeAgent<StudentProgressInput, StudentProgressOutput>(
            "StudentProgressSummary",
            buildStudentProgressInputFrom(student, actor.role)
          )
      });

      const risk = await persistAgentRun<AtRiskInput, AtRiskOutput>({
        actor,
        agentType: "AtRiskStudentDetection",
        targetType: "Student",
        targetId: studentId,
        parentRunId: parent.id,
        inputSnapshot: buildAtRiskInputFrom(student, now),
        execute: () => executeAgent<AtRiskInput, AtRiskOutput>("AtRiskStudentDetection", buildAtRiskInputFrom(student, now))
      });

      const attendance = await persistAgentRun<AttendanceAnomalyInput, AttendanceAnomalyOutput>({
        actor,
        agentType: "AttendanceAnomaly",
        targetType: "Student",
        targetId: studentId,
        parentRunId: parent.id,
        inputSnapshot: buildAttendanceAnomalyInputFrom(student),
        execute: () =>
          executeAgent<AttendanceAnomalyInput, AttendanceAnomalyOutput>(
            "AttendanceAnomaly",
            buildAttendanceAnomalyInputFrom(student)
          )

      });

      const agentInput: StudentSuccessReviewInput = {
        studentName: `${student.firstName} ${student.lastName}`,
        progress: (progress.output as { [key: string]: unknown }) as unknown as StudentProgressOutput,
        risk: (risk.output as { [key: string]: unknown }) as unknown as AtRiskOutput,
        attendance: (attendance.output as { [key: string]: unknown }) as unknown as AttendanceAnomalyOutput,
        activeInterventions: student.interventionPlans
          .filter((plan) => plan.status === "Active")
          .map((plan) => ({ riskArea: plan.riskArea, summary: plan.summary, followUpDate: plan.followUpDate })),
        guardianDigestOptIn: student.guardians.some((link) => link.receivesDigest),
        // The same clock the children used, so a review and its sub-runs never
        // disagree about what "next week" means.
        now
      };

      const result = executeAgent<StudentSuccessReviewInput, StudentSuccessReviewOutput>(
        "StudentSuccessReview",
        agentInput
      );

      /*
       * The parent's confidence is penalised by its weakest child. A review
       * built on a sub-agent that had almost no data to work with is a thin
       * review, and reporting the orchestrator's own certainty would hide that.
       */
      const childConfidences = [progress.confidenceScore, risk.confidenceScore, attendance.confidenceScore].filter(
        (score): score is number => typeof score === "number"
      );

      return finishAgentRun({
        actor,
        run: parent,
        inputSnapshot: agentInput,
        result: { ...result, confidenceScore: confidenceFromSubagents(result.confidenceScore, childConfidences) }
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sub-agent error";
      await failAgentRun({ actor, run: parent, message: `Sub-agent failure during success review: ${message}` });
      throw error;
    }
  }
});

/**
 * The union of everything the student-scoped agents need, in one query.
 *
 * Before this, each buildXxxInput helper fetched its own copy of the same
 * student. The success review needed four of them — concurrently, via
 * Promise.all, but still four round-trips carrying largely the same rows for
 * one logical operation. Loading once and passing the aggregate down costs a
 * slightly wider include and removes three queries.
 *
 * The `From` builders below are pure functions of this shape, which is what
 * makes them reusable by the orchestrator without either duplicating the query
 * or the mapping.
 */
const STUDENT_AGGREGATE_INCLUDE = {
  enrollments: { include: { classSection: { include: { course: true, academicTerm: true } } } },
  submissions: { include: { assignment: true } },
  attendanceRecords: true,
  supportNotes: true,
  interventionPlans: true,
  guardians: true
} as const;

type StudentAggregate = Prisma.StudentGetPayload<{ include: typeof STUDENT_AGGREGATE_INCLUDE }>;

async function loadStudentAggregate(studentId: string): Promise<StudentAggregate> {
  return prisma.student.findUniqueOrThrow({ where: { id: studentId }, include: STUDENT_AGGREGATE_INCLUDE });
}

async function buildStudentProgressInput(studentId: string, role: string): Promise<StudentProgressInput> {
  return buildStudentProgressInputFrom(await loadStudentAggregate(studentId), role);
}

function buildStudentProgressInputFrom(student: StudentAggregate, role: string): StudentProgressInput {
  const visibleSupportNotes = student.supportNotes.filter((note) => {
    if (note.visibility === "Shared") return true;
    if (note.visibility === "AdminOnly") return role === "Admin" || role === "SchoolManager";
    if (note.visibility === "AdvisorOnly") return role === "Advisor" || role === "Admin" || role === "SchoolManager";
    return role === "Teacher" || role === "Admin" || role === "SchoolManager";
  });

  return {
    studentProfile: {
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      enrollmentStatus: student.enrollmentStatus,
      gradeLevel: student.gradeLevel
    },
    activeEnrollments: student.enrollments
      .filter((enrollment) => enrollment.status === "Enrolled")
      .map((enrollment) => ({
        sectionName: `${enrollment.classSection.course.code} ${enrollment.classSection.academicTerm.name}`,
        courseTitle: enrollment.classSection.course.title
      })),
    recentGrades: student.submissions.map((submission) => ({
      score: submission.score,
      pointsPossible: submission.assignment.pointsPossible,
      status: submission.status,
      gradedAt: submission.gradedAt
    })),
    missingAssignments: student.submissions.filter((submission) => submission.status === "Missing").length,
    lateAssignments: student.submissions.filter((submission) => submission.status === "Late").length,
    attendanceRecords: student.attendanceRecords.map((record) => ({ status: record.status, date: record.date })),
    supportNotes: visibleSupportNotes.map((note) => ({ noteType: note.noteType, content: note.content, createdAt: note.createdAt })),
    activeInterventionPlans: student.interventionPlans
      .filter((plan) => plan.status === "Active")
      .map((plan) => ({ riskArea: plan.riskArea, summary: plan.summary, followUpDate: plan.followUpDate }))
  };
}

async function buildAtRiskInput(studentId: string, now: Date): Promise<AtRiskInput> {
  return buildAtRiskInputFrom(await loadStudentAggregate(studentId), now);
}

function buildAtRiskInputFrom(student: StudentAggregate, now: Date): AtRiskInput {
  return {
    /*
     * One clock per run, passed in rather than read here. Agents are pure
     * functions of their input, and a `new Date()` inside one makes its output
     * change with the calendar — which is exactly what made a golden-fixture
     * harness impossible before US-19.
     */
    now,
    studentName: `${student.firstName} ${student.lastName}`,
    gradeSummary: calculateGradeSummary(
      student.submissions.map((submission) => ({
        score: submission.score,
        pointsPossible: submission.assignment.pointsPossible,
        status: submission.status,
        gradedAt: submission.gradedAt
      }))
    ),
    attendanceSummary: summarizeAttendance(student.attendanceRecords.map((record) => ({ status: record.status, date: record.date }))),
    interventionHistory: student.interventionPlans.map((plan) => ({ status: plan.status, riskArea: plan.riskArea, summary: plan.summary })),
    recentSupportNotes: student.supportNotes.map((note) => ({ noteType: note.noteType, content: note.content }))
  };
}

function buildAttendanceAnomalyInputFrom(student: StudentAggregate): AttendanceAnomalyInput {
  return {
    targetName: `${student.firstName} ${student.lastName}`,
    targetType: "Student",
    records: student.attendanceRecords.map((record) => ({ date: record.date, status: record.status })),
    dateRangeLabel: "recent records",
    historicalAverageIssuePoints: 2
  };
}

async function buildAttendanceAnomalyInput(targetType: "Student" | "ClassSection", targetId: string): Promise<AttendanceAnomalyInput> {
  if (targetType === "Student") {
    return buildAttendanceAnomalyInputFrom(await loadStudentAggregate(targetId));
  }

  const [section, records] = await Promise.all([
    prisma.classSection.findUniqueOrThrow({ where: { id: targetId }, include: { course: true } }),
    prisma.attendanceRecord.findMany({ where: { classSectionId: targetId } })
  ]);
  return {
    targetName: section.course.title,
    targetType,
    records: records.map((record) => ({ date: record.date, status: record.status })),
    dateRangeLabel: "recent records",
    historicalAverageIssuePoints: 2
  };
}

async function buildTeacherWorkloadInput(teacherId: string): Promise<TeacherWorkloadAgentInput> {
  const teacher = await prisma.teacher.findUniqueOrThrow({
    where: { id: teacherId },
    include: {
      sections: {
        include: {
          enrollments: {
            include: {
              student: {
                include: {
                  submissions: { include: { assignment: true } },
                  attendanceRecords: true,
                  interventionPlans: true,
                  supportNotes: true
                }
              }
            }
          },
          assignments: { include: { submissions: true } }
        }
      },
      jobs: true
    }
  });
  const activeSections = teacher.sections.filter((section) => section.status === "Active");
  const enrollments = activeSections.flatMap((section) => section.enrollments.filter((enrollment) => enrollment.status === "Enrolled"));
  const studentIds = new Set(enrollments.map((enrollment) => enrollment.studentId));
  const activeAssignments = activeSections.flatMap((section) => section.assignments.filter((assignment) => assignment.status === "Published"));
  const ungradedSubmissionCount = activeAssignments.flatMap((assignment) => assignment.submissions).filter((submission) => submission.score === null).length;
  const highRiskStudentCount = enrollments.filter((enrollment) => {
    const student = enrollment.student;
    const gradeSummary = calculateGradeSummary(
      student.submissions.map((submission) => ({
        score: submission.score,
        pointsPossible: submission.assignment.pointsPossible,
        status: submission.status,
        gradedAt: submission.gradedAt
      }))
    );
    const attendanceSummary = summarizeAttendance(student.attendanceRecords.map((record) => ({ status: record.status, date: record.date })));
    const risk = scoreStudentRisk({
      gradeSummary,
      attendanceSummary,
      activeInterventionCount: student.interventionPlans.filter((plan) => plan.status === "Active").length,
      recentSupportNoteCount: student.supportNotes.length
    });

    // High OR Critical. Counting only "High" excluded the worst cases from a
    // teacher's workload figure — the students generating the most work were
    // precisely the ones the number ignored.
    return risk.level === "High" || risk.level === "Critical";
  }).length;

  return {
    teacherProfile: {
      id: teacher.id,
      name: `${teacher.firstName} ${teacher.lastName}`,
      employmentStatus: teacher.employmentStatus
    },
    activeSectionCount: activeSections.length,
    studentCount: studentIds.size,
    activeAssignmentCount: activeAssignments.length,
    ungradedSubmissionCount,
    highRiskStudentCount,
    recentSupportNoteCount: enrollments.reduce((sum, enrollment) => sum + enrollment.student.supportNotes.length, 0),
    failedJobCount: teacher.jobs.filter((job) => job.status === "Failed").length
  };
}

async function buildGuardianCommunicationDraftInput(studentId: string): Promise<GuardianCommunicationDraftInput> {
  const student = await prisma.student.findUniqueOrThrow({
    where: { id: studentId },
    include: {
      submissions: { include: { assignment: true } },
      attendanceRecords: true,
      supportNotes: true,
      interventionPlans: true,
      guardians: { include: { guardian: true }, orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }] }
    }
  });
  const gradeSummary = calculateGradeSummary(
    student.submissions.map((submission) => ({
      score: submission.score,
      pointsPossible: submission.assignment.pointsPossible,
      status: submission.status,
      gradedAt: submission.gradedAt
    }))
  );
  const attendanceSummary = summarizeAttendance(student.attendanceRecords.map((record) => ({ status: record.status, date: record.date })));
  /*
   * No fallback. This used to read
   *
   *   guardianName: primaryGuardian ? ... : student.guardianName
   *
   * and that `:` was the bug US-14 exists to remove — it meant the address an
   * agent drafted to depended on which of two stores happened to be populated,
   * with no error and no warning when they disagreed. There is now one store,
   * and a student with nothing in it is a data problem to report rather than to
   * paper over: drafting to an unknown address is worse than failing.
   */
  const primaryGuardian = student.guardians.find((link) => link.isPrimary)?.guardian;
  if (!primaryGuardian) {
    throw new AppError(
      "VALIDATION_ERROR",
      `${student.firstName} ${student.lastName} has no guardian on record, so there is no one to draft to.`,
      { studentId: student.id }
    );
  }
  const activeIntervention = student.interventionPlans.find((plan) => plan.status === "Active");

  return {
    studentName: `${student.firstName} ${student.lastName}`,
    guardianName: `${primaryGuardian.firstName} ${primaryGuardian.lastName}`,
    guardianEmail: primaryGuardian.email,
    communicationReason:
      attendanceSummary.absent >= 5
        ? "AttendanceConcern"
        : gradeSummary.average !== null && gradeSummary.average < 70
          ? "GradeConcern"
          : activeIntervention
            ? "InterventionUpdate"
            : "PositiveProgress",
    gradeSummary,
    attendanceSummary,
    missingAssignmentCount: gradeSummary.missingCount,
    activeInterventionSummary: activeIntervention?.summary ?? null,
    teacherNotes: student.supportNotes
      .filter((note) => note.visibility === "Shared" || note.visibility === "TeacherOnly")
      .map((note) => ({ noteType: note.noteType, content: note.content }))
  };
}

async function buildGradingConsistencyInput(assignmentId: string): Promise<GradingConsistencyInput> {
  const assignment = await prisma.assignment.findUniqueOrThrow({
    where: { id: assignmentId },
    include: {
      submissions: {
        include: {
          criterionScores: { include: { criterion: true } }
        }
      }
    }
  });

  return {
    assignment: {
      id: assignment.id,
      title: assignment.title,
      type: assignment.type,
      pointsPossible: assignment.pointsPossible
    },
    submissions: assignment.submissions.map((submission) => ({
      studentId: submission.studentId,
      status: submission.status,
      score: submission.score,
      feedback: submission.feedback,
      criterionScores: submission.criterionScores.map((score) => ({
        criterionTitle: score.criterion.title,
        score: score.score,
        pointsPossible: score.criterion.pointsPossible
      }))
    }))
  };
}

/**
 * Everything the postmortem needs about a term, in one pass.
 *
 * The aggregation itself is `analyseTerm` in packages/domain — this only
 * fetches and shapes. That split is what makes the thresholds testable without
 * a database, and it is the same division the story asks for: the handler
 * fetches and persists, the domain decides.
 */
export async function buildTermPostmortemInput(termId: string, now: Date): Promise<TermPostmortemInput> {
  const term = await prisma.academicTerm.findUniqueOrThrow({
    where: { id: termId },
    include: {
      sections: {
        include: {
          course: true,
          teacher: true,
          enrollments: true,
          assignments: { include: { submissions: true } }
        }
      }
    }
  });

  const sectionIds = term.sections.map((section) => section.id);
  const [interventions, deadLettered, students, recommendations] = await Promise.all([
    // Interventions are not scoped to a term in the schema, so this is the
    // whole set. Narrowing it would need an intervention-to-term link that
    // does not exist; claiming a term-scoped number we cannot compute would be
    // worse than reporting the school-wide one and saying so.
    prisma.interventionPlan.findMany({ select: { status: true, riskArea: true } }),
    prisma.backgroundJob.count({ where: { status: "DeadLettered" } }),
    prisma.student.findMany({
      where: sectionIds.length > 0 ? { enrollments: { some: { classSectionId: { in: sectionIds } } } } : { id: "none" },
      include: { submissions: { include: { assignment: true } }, attendanceRecords: true, interventionPlans: true, supportNotes: true }
    }),
    prisma.agentRecommendation.findMany({ select: { status: true } })
  ]);

  const sections = term.sections.map((section) => {
    // Paired with their assignment so pointsPossible travels with the score.
    // Flattening submissions on their own and looking pointsPossible up by
    // index is the shape of bug that produces a plausible wrong average.
    const scored = section.assignments.flatMap((assignment) =>
      assignment.submissions
        .filter((submission) => typeof submission.score === "number")
        .map((submission) => ({ score: submission.score ?? 0, pointsPossible: assignment.pointsPossible }))
    );
    const submissions = section.assignments.flatMap((assignment) => assignment.submissions);
    const enrolled = section.enrollments.filter((enrollment) => enrollment.status === "Enrolled");

    const possible = scored.reduce((sum, entry) => sum + entry.pointsPossible, 0);
    const earned = scored.reduce((sum, entry) => sum + entry.score, 0);
    const classAverage = possible > 0 ? (earned / possible) * 100 : null;

    return {
      sectionId: section.id,
      sectionLabel: `${section.course.code} · ${section.room}`,
      teacherName: `${section.teacher.firstName} ${section.teacher.lastName}`,
      enrolledCount: enrolled.length,
      classAverage,
      submittedCount: submissions.filter((submission) => submission.status !== "Missing" && submission.status !== "NotStarted").length,
      missingCount: submissions.filter((submission) => submission.status === "Missing").length,
      ungradedCount: submissions.filter(
        (submission) => submission.status === "Submitted" || submission.status === "Late"
      ).length,
      attendanceConcernCount: 0
    };
  });

  const studentRiskLevels = students.map((student) => {
    const gradeSummary = calculateGradeSummary(
      student.submissions.map((submission) => ({
        score: submission.score,
        pointsPossible: submission.assignment.pointsPossible,
        status: submission.status,
        gradedAt: submission.gradedAt
      }))
    );
    const attendanceSummary = summarizeAttendance(
      student.attendanceRecords.map((record) => ({ status: record.status, date: record.date }))
    );
    return scoreStudentRisk({
      gradeSummary,
      attendanceSummary,
      activeInterventionCount: student.interventionPlans.filter((plan) => plan.status === "Active").length,
      recentSupportNoteCount: student.supportNotes.length
    }).level;
  });

  // Attendance concerns per section, counted from the students actually in it.
  for (const section of sections) {
    section.attendanceConcernCount = students.filter((student) => {
      const summary = summarizeAttendance(
        student.attendanceRecords
          .filter((record) => record.classSectionId === section.sectionId)
          .map((record) => ({ status: record.status, date: record.date }))
      );
      return summary.concernLevel === "Concern" || summary.concernLevel === "Severe";
    }).length;
  }

  const analysis = analyseTerm({
    termName: term.name,
    sections,
    interventions,
    teacherWorkloads: term.sections.map((section) => ({
      teacherName: `${section.teacher.firstName} ${section.teacher.lastName}`,
      score: scoreTeacherWorkload({
        employmentStatus: section.teacher.employmentStatus,
        activeSectionCount: 1,
        studentCount: section.enrollments.length,
        activeAssignmentCount: section.assignments.length,
        ungradedSubmissionCount: section.assignments.flatMap((assignment) => assignment.submissions).filter((submission) => submission.status === "Submitted" || submission.status === "Late").length,
        highRiskStudentCount: 0
      }).score
    })),
    agentRunCount: 0,
    recommendationsProposed: recommendations.length,
    recommendationsAccepted: recommendations.filter(
      (recommendation) => recommendation.status === "Approved" || recommendation.status === "Completed"
    ).length,
    deadLetteredJobCount: deadLettered,
    studentRiskLevels
  });

  return { termName: term.name, termStatus: term.status, analysis, now };
}

/*
 * buildStudentSuccessReviewInput used to live here. US-18 inlined it into
 * runStudentSuccessReviewAgent so the sub-agents could be persisted as child
 * runs, and left this behind — dead, but still compiling, still typechecking,
 * and still calling executeAgent inline in a way the story had just removed.
 * Deleted rather than updated for the clock: the fastest way to keep a
 * superseded code path from being resurrected is to not have one.
 */
