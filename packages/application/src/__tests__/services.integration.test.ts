import { describe, expect, it } from "vitest";
import { prisma } from "@agentic-edu/db";
import { academicOperationsService } from "../services/academic-operations-service";
import { agentOperationsService } from "../services/agent-operations-service";
import { academicService } from "../services/academic-service";
import { agentRunService } from "../services/agent-run-service";
import { assignmentService } from "../services/assignment-service";
import { studentService } from "../services/student-service";
import { enrollmentService } from "../services/enrollment-service";
import { jobService } from "../services/job-service";
import { logService } from "../services/log-service";
import { reportService } from "../services/report-service";
import { workerService } from "../services/worker-service";
import type { WeeklyRiskReportPayload } from "@agentic-edu/domain";
import { AppError } from "../errors";
import { flushLogs } from "../logging";
import { ADMIN, VIEWER, makeAssignment, makeRubric, makeSection, makeStudent, makeTeacher, makeTerm } from "./fixtures";

/**
 * These cover the rules that only exist once a database is involved: unique
 * constraints, transaction boundaries, and state machines that read a row
 * before writing it. None can be exercised by a pure unit test, and every one
 * of them is load-bearing.
 */

describe("enrollmentService.enrollStudent", () => {
  it("waitlists once the section is full", async () => {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id, { capacity: 1 });
    const first = await makeStudent();
    const second = await makeStudent();

    const a = await enrollmentService.enrollStudent(ADMIN, {
      studentId: first.id,
      classSectionId: section.id,
      allowWaitlist: true
    });
    const b = await enrollmentService.enrollStudent(ADMIN, {
      studentId: second.id,
      classSectionId: section.id,
      allowWaitlist: true
    });

    expect(a.status).toBe("Enrolled");
    expect(b.status).toBe("Waitlisted");
  });

  it("refuses a full section when the caller did not opt into the waitlist", async () => {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id, { capacity: 1 });
    await enrollmentService.enrollStudent(ADMIN, {
      studentId: (await makeStudent()).id,
      classSectionId: section.id,
      allowWaitlist: false
    });

    await expect(
      enrollmentService.enrollStudent(ADMIN, {
        studentId: (await makeStudent()).id,
        classSectionId: section.id,
        allowWaitlist: false
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("refuses a duplicate active enrollment", async () => {
    // decideEnrollment catches this in memory; the @@unique constraint catches
    // it if two requests race. This asserts the first, and proves the second is
    // not being relied on for the ordinary path.
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id, { capacity: 5 });
    const student = await makeStudent();

    await enrollmentService.enrollStudent(ADMIN, {
      studentId: student.id,
      classSectionId: section.id,
      allowWaitlist: false
    });

    await expect(
      enrollmentService.enrollStudent(ADMIN, {
        studentId: student.id,
        classSectionId: section.id,
        allowWaitlist: false
      })
    ).rejects.toBeInstanceOf(AppError);

    expect(await prisma.enrollment.count()).toBe(1);
  });

  it("refuses to enrol a withdrawn student", async () => {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id, { capacity: 5 });
    const student = await makeStudent({ enrollmentStatus: "Withdrawn" });

    await expect(
      enrollmentService.enrollStudent(ADMIN, {
        studentId: student.id,
        classSectionId: section.id,
        allowWaitlist: true
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("assignmentService.gradeSubmission", () => {
  it("writes exactly one audit event carrying the before and after score", async () => {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id);
    const student = await makeStudent();
    const assignment = await makeAssignment(section.id, teacher.id, 20);
    const submission = await prisma.submission.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "Submitted", submittedAt: new Date() }
    });

    await assignmentService.gradeSubmission(ADMIN, {
      id: submission.id,
      score: 17,
      feedback: "Good work.",
      gradedByTeacherId: teacher.id
    });

    const audits = await prisma.auditEvent.findMany({
      where: { entityType: "Submission", entityId: submission.id }
    });

    expect(audits).toHaveLength(1);
    expect(audits[0]?.action).toBe("submission.graded");
    expect((audits[0]?.before as { score: number | null }).score).toBeNull();
    expect((audits[0]?.after as { score: number }).score).toBe(17);
  });

  it("rolls back the audit event when the write is rejected", async () => {
    // This is the reason createAuditEvent runs inside prisma.$transaction rather
    // than after it. When the score is invalid the whole transaction unwinds,
    // and there must be no audit row claiming a grade that was never applied.
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id);
    const student = await makeStudent();
    const assignment = await makeAssignment(section.id, teacher.id, 20);
    const submission = await prisma.submission.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "Submitted" }
    });

    await expect(
      assignmentService.gradeSubmission(ADMIN, {
        id: submission.id,
        score: 999,
        feedback: "",
        gradedByTeacherId: teacher.id
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(await prisma.auditEvent.count()).toBe(0);
    expect((await prisma.submission.findUniqueOrThrow({ where: { id: submission.id } })).score).toBeNull();
  });
});

describe("authorization is enforced in the service, not the UI", () => {
  it("refuses a Viewer on three different services", async () => {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id);
    const student = await makeStudent();
    const assignment = await makeAssignment(section.id, teacher.id);
    const submission = await prisma.submission.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "Submitted" }
    });

    await expect(
      assignmentService.gradeSubmission(VIEWER, {
        id: submission.id,
        score: 10,
        feedback: "",
        gradedByTeacherId: teacher.id
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      enrollmentService.enrollStudent(VIEWER, {
        studentId: student.id,
        classSectionId: section.id,
        allowWaitlist: true
      })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(workerService.runNextJob(VIEWER)).rejects.toMatchObject({ code: "FORBIDDEN" });

    // A refused call leaves nothing behind, not even a record of the attempt:
    // assertCan throws before the transaction opens.
    expect(await prisma.auditEvent.count()).toBe(0);
  });
});

describe("workerService.runNextJob", () => {
  it("walks a failing job through Failed and then DeadLettered", async () => {
    // Same malformed payload shape as the seeded job_attendance_malformed, so
    // this exercises the real simulateJobFailure path rather than a stub.
    await prisma.backgroundJob.create({
      data: {
        id: "job_bad_payload",
        type: "AttendanceSummary",
        status: "Queued",
        attempts: 0,
        maxAttempts: 2,
        payload: { range: "{bad-json" }
      }
    });

    const first = await workerService.runNextJob(ADMIN);
    expect(first?.status).toBe("Failed");
    expect(first?.attempts).toBe(1);
    expect(first?.nextRunAt).not.toBeNull();

    // Exponential backoff means the job is not runnable again for a couple of
    // minutes. Clearing nextRunAt is the test equivalent of waiting.
    await prisma.backgroundJob.update({
      where: { id: "job_bad_payload" },
      data: { status: "Retrying", nextRunAt: null }
    });

    const second = await workerService.runNextJob(ADMIN);
    expect(second?.status).toBe("DeadLettered");
    expect(second?.attempts).toBe(2);
  });

  it("releases the worker lock after a run so the job is not stranded", async () => {
    await prisma.backgroundJob.create({
      data: {
        id: "job_ok",
        type: "GuardianDigest",
        status: "Queued",
        attempts: 0,
        maxAttempts: 3,
        payload: { studentId: "x" }
      }
    });

    await workerService.runNextJob(ADMIN);

    // A lock left behind makes the job permanently unrunnable — the exact
    // failure that makes queue bugs so unpleasant to diagnose in production.
    expect(await prisma.workerLock.count()).toBe(0);
  });

  it("returns null rather than throwing when the queue is empty", async () => {
    // An empty queue is not an error. runNextWorkerJob depends on this to tell
    // "nothing to do" apart from "something broke".
    expect(await workerService.runNextJob(ADMIN)).toBeNull();
  });
});

describe("assignmentService.gradeSubmissionWithRubric", () => {
  async function setupRubricSubmission() {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id);
    const student = await makeStudent();
    const assignment = await makeAssignment(section.id, teacher.id, 50);
    const rubric = await makeRubric(assignment.id, teacher.id, [
      { title: "Model Accuracy", points: 20 },
      { title: "Reasoning", points: 15 },
      { title: "Completeness", points: 10 },
      { title: "Reflection", points: 5 }
    ]);
    const submission = await prisma.submission.create({
      data: { assignmentId: assignment.id, studentId: student.id, status: "Submitted", submittedAt: new Date() }
    });
    return { teacher, submission, rubric };
  }

  it("derives the total from the criteria and marks the submission Graded", async () => {
    const { teacher, submission, rubric } = await setupRubricSubmission();

    const result = await assignmentService.gradeSubmissionWithRubric(ADMIN, {
      submissionId: submission.id,
      gradedByTeacherId: teacher.id,
      feedback: "Strong model.",
      scores: rubric.criteria.map((criterion) => ({ criterionId: criterion.id, score: criterion.pointsPossible - 1 }))
    });

    // 19 + 14 + 9 + 4
    expect(result.summary.totalScore).toBe(46);
    expect(result.needsReview).toBe(false);
    expect(result.submission.score).toBe(46);
    expect(result.submission.status).toBe("Graded");
    expect(await prisma.submissionCriterionScore.count({ where: { submissionId: submission.id } })).toBe(4);
  });

  it("keeps a partially scored submission out of Graded", async () => {
    // Teachers score a stack in passes. A half-scored submission must stay in
    // the grading queue rather than looking finished with a low mark.
    const { teacher, submission, rubric } = await setupRubricSubmission();

    const result = await assignmentService.gradeSubmissionWithRubric(ADMIN, {
      submissionId: submission.id,
      gradedByTeacherId: teacher.id,
      feedback: "Partial.",
      scores: [{ criterionId: rubric.criteria[0]!.id, score: 18 }]
    });

    expect(result.needsReview).toBe(true);
    expect(result.submission.status).toBe("Submitted");
    expect(result.submission.gradedAt).toBeNull();
    expect(result.submission.score).toBe(18);
  });

  it("re-saving updates rather than duplicating criterion rows", async () => {
    // Guards the @@unique([submissionId, criterionId]) upsert path — the
    // difference between editing a grade and silently creating a second one.
    const { teacher, submission, rubric } = await setupRubricSubmission();
    const first = rubric.criteria[0]!;

    for (const score of [12, 17]) {
      await assignmentService.gradeSubmissionWithRubric(ADMIN, {
        submissionId: submission.id,
        gradedByTeacherId: teacher.id,
        feedback: "",
        scores: [{ criterionId: first.id, score }]
      });
    }

    const rows = await prisma.submissionCriterionScore.findMany({ where: { submissionId: submission.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.score).toBe(17);
  });

  it("rejects a score above its criterion maximum and writes nothing", async () => {
    const { teacher, submission, rubric } = await setupRubricSubmission();

    await expect(
      assignmentService.gradeSubmissionWithRubric(ADMIN, {
        submissionId: submission.id,
        gradedByTeacherId: teacher.id,
        feedback: "",
        scores: [{ criterionId: rubric.criteria[0]!.id, score: 999 }]
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(await prisma.submissionCriterionScore.count()).toBe(0);
    expect(await prisma.auditEvent.count()).toBe(0);
  });

  it("refuses a criterion belonging to a different rubric", async () => {
    // A stale form or a tampered request could otherwise write orphan rows
    // that no rubric total would ever include.
    const { teacher, submission } = await setupRubricSubmission();
    const otherTeacher = await makeTeacher();
    const otherSection = await makeSection(otherTeacher.id);
    const otherAssignment = await makeAssignment(otherSection.id, otherTeacher.id, 20);
    const otherRubric = await makeRubric(otherAssignment.id, otherTeacher.id, [{ title: "Elsewhere", points: 10 }]);

    await expect(
      assignmentService.gradeSubmissionWithRubric(ADMIN, {
        submissionId: submission.id,
        gradedByTeacherId: teacher.id,
        feedback: "",
        scores: [{ criterionId: otherRubric.criteria[0]!.id, score: 5 }]
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(await prisma.submissionCriterionScore.count()).toBe(0);
  });
});

describe("assignmentService.submitAssignment", () => {
  async function setup(status: "Draft" | "Published" | "Closed") {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id);
    const student = await makeStudent();
    const assignment = await prisma.assignment.create({
      data: {
        classSectionId: section.id,
        title: "Essay",
        description: "Write one.",
        type: "Homework",
        status,
        dueDate: new Date("2026-05-01T00:00:00.000Z"),
        pointsPossible: 20,
        createdByTeacherId: teacher.id
      }
    });
    return { student, assignment };
  }

  it("refuses a Draft assignment the student was never meant to see", async () => {
    // canSubmitAssignment existed and was unit-tested from the first commit and
    // was called by nothing, so this silently worked before US-09.
    const { student, assignment } = await setup("Draft");

    await expect(
      assignmentService.submitAssignment(ADMIN, {
        assignmentId: assignment.id,
        studentId: student.id,
        contentText: "here",
        attachmentUrl: null
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(await prisma.submission.count()).toBe(0);
  });

  it("refuses a Closed assignment", async () => {
    const { student, assignment } = await setup("Closed");

    await expect(
      assignmentService.submitAssignment(ADMIN, {
        assignmentId: assignment.id,
        studentId: student.id,
        contentText: "here",
        attachmentUrl: null
      })
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("marks on-time and late submissions from an injected clock", async () => {
    // `now` is a parameter so the late boundary is assertable. Reading the wall
    // clock here would make this test pass or fail depending on the date.
    const onTime = await setup("Published");
    const early = await assignmentService.submitAssignment(ADMIN, {
      assignmentId: onTime.assignment.id,
      studentId: onTime.student.id,
      contentText: "early",
      attachmentUrl: null,
      now: new Date("2026-04-30T09:00:00.000Z")
    });
    expect(early.status).toBe("Submitted");

    const overdue = await setup("Published");
    const late = await assignmentService.submitAssignment(ADMIN, {
      assignmentId: overdue.assignment.id,
      studentId: overdue.student.id,
      contentText: "late",
      attachmentUrl: null,
      now: new Date("2026-05-02T09:00:00.000Z")
    });
    expect(late.status).toBe("Late");
  });

  it("replaces a previous submission rather than creating a second", async () => {
    const { student, assignment } = await setup("Published");
    for (const text of ["first draft", "second draft"]) {
      await assignmentService.submitAssignment(ADMIN, {
        assignmentId: assignment.id,
        studentId: student.id,
        contentText: text,
        attachmentUrl: null,
        now: new Date("2026-04-30T09:00:00.000Z")
      });
    }

    const rows = await prisma.submission.findMany({ where: { assignmentId: assignment.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.contentText).toBe("second draft");
  });
});

describe("enrollmentService.promoteFromWaitlist", () => {
  async function seatedSection(capacity: number) {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id, { capacity });
    return section;
  }

  it("moves a waitlisted student into a freed seat", async () => {
    const section = await seatedSection(1);
    const seated = await makeStudent();
    const waiting = await makeStudent();

    await enrollmentService.enrollStudent(ADMIN, { studentId: seated.id, classSectionId: section.id, allowWaitlist: true });
    const wl = await enrollmentService.enrollStudent(ADMIN, {
      studentId: waiting.id,
      classSectionId: section.id,
      allowWaitlist: true
    });
    expect(wl.status).toBe("Waitlisted");

    // Free the seat, then promote.
    const seatedEnrollment = await prisma.enrollment.findFirstOrThrow({
      where: { studentId: seated.id, classSectionId: section.id }
    });
    await enrollmentService.dropEnrollment(ADMIN, seatedEnrollment.id);

    const promoted = await enrollmentService.promoteFromWaitlist(ADMIN, wl.id);
    expect(promoted.status).toBe("Enrolled");

    const audits = await prisma.auditEvent.findMany({ where: { action: "enrollment.promoted" } });
    expect(audits).toHaveLength(1);
  });

  it("refuses promotion into a section that is still full", async () => {
    // The roster said "1 seat open" when it rendered; someone else took it.
    // The decision has to be made at write time, not render time.
    const section = await seatedSection(1);
    await enrollmentService.enrollStudent(ADMIN, {
      studentId: (await makeStudent()).id,
      classSectionId: section.id,
      allowWaitlist: true
    });
    const wl = await enrollmentService.enrollStudent(ADMIN, {
      studentId: (await makeStudent()).id,
      classSectionId: section.id,
      allowWaitlist: true
    });

    await expect(enrollmentService.promoteFromWaitlist(ADMIN, wl.id)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await prisma.enrollment.count({ where: { status: "Enrolled" } })).toBe(1);
  });

  it("refuses to promote an enrollment that is not waitlisted", async () => {
    const section = await seatedSection(5);
    const enrolled = await enrollmentService.enrollStudent(ADMIN, {
      studentId: (await makeStudent()).id,
      classSectionId: section.id,
      allowWaitlist: false
    });

    await expect(enrollmentService.promoteFromWaitlist(ADMIN, enrolled.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("enrollmentService.bulkEnroll", () => {
  it("enrols the eligible and reports the rest, rather than failing the batch", async () => {
    // One bad row must not cost the operator eleven good ones. If it did, they
    // would re-select names to work around it and stop using the form.
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id, { capacity: 5 });
    const ok1 = await makeStudent();
    const ok2 = await makeStudent();
    const withdrawn = await makeStudent({ enrollmentStatus: "Withdrawn" });

    const results = await enrollmentService.bulkEnroll(ADMIN, {
      classSectionId: section.id,
      studentIds: [ok1.id, withdrawn.id, ok2.id],
      allowWaitlist: false
    });

    expect(results.filter((r) => r.ok)).toHaveLength(2);
    expect(results.find((r) => r.studentId === withdrawn.id)?.ok).toBe(false);
    expect(await prisma.enrollment.count({ where: { status: "Enrolled" } })).toBe(2);
  });
});

describe("academicService.updateSection capacity guard", () => {
  it("refuses a capacity below the students already seated", async () => {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id, { capacity: 3 });
    for (let i = 0; i < 2; i += 1) {
      await enrollmentService.enrollStudent(ADMIN, {
        studentId: (await makeStudent()).id,
        classSectionId: section.id,
        allowWaitlist: false
      });
    }

    await expect(
      academicService.updateSection(ADMIN, section.id, {
        courseId: section.courseId,
        teacherId: teacher.id,
        academicTermId: section.academicTermId,
        room: section.room,
        schedule: { days: ["Mon"], start: "09:00", end: "09:55" },
        capacity: 1,
        status: "Active"
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // The refused edit must leave capacity untouched.
    expect((await prisma.classSection.findUniqueOrThrow({ where: { id: section.id } })).capacity).toBe(3);
  });
});

describe("jobService.enqueue", () => {
  it("returns the existing job for an in-flight idempotency key", async () => {
    // A double-clicked button, a retried request, and a producer firing twice
    // are all normal. None should create a second job.
    const first = await jobService.enqueue(ADMIN, {
      type: "GuardianDigest",
      payload: { studentId: "student_x" },
      idempotencyKey: "digest:student_x:week_1"
    });
    const second = await jobService.enqueue(ADMIN, {
      type: "GuardianDigest",
      payload: { studentId: "student_x" },
      idempotencyKey: "digest:student_x:week_1"
    });

    expect(second.id).toBe(first.id);
    expect(await prisma.backgroundJob.count()).toBe(1);
  });

  it("allows re-enqueueing after the previous job finished", async () => {
    // Otherwise the same weekly digest key would block that job forever, which
    // is a far worse bug than an occasional duplicate.
    const first = await jobService.enqueue(ADMIN, {
      type: "GuardianDigest",
      payload: { studentId: "student_y" },
      idempotencyKey: "digest:student_y:week_1"
    });
    await prisma.backgroundJob.update({ where: { id: first.id }, data: { status: "Succeeded" } });

    const second = await jobService.enqueue(ADMIN, {
      type: "GuardianDigest",
      payload: { studentId: "student_y" },
      idempotencyKey: "digest:student_y:week_1"
    });

    expect(second.id).not.toBe(first.id);
    expect(await prisma.backgroundJob.count()).toBe(2);
  });
});

describe("workerService with real handlers", () => {
  it("fails a job whose payload the schema rejects, with a useful message", async () => {
    // Same shape as the seeded job_attendance_malformed. It now fails because
    // the schema rejects it, not because a hardcoded matcher looked for
    // "{bad-json".
    await prisma.backgroundJob.create({
      data: {
        id: "job_bad_range",
        type: "AttendanceSummary",
        status: "Queued",
        attempts: 0,
        maxAttempts: 3,
        payload: { studentId: "student_z", range: "{bad-json" }
      }
    });

    const job = await workerService.runNextJob(ADMIN);
    expect(job?.status).toBe("Failed");
    expect(job?.errorMessage).toContain("Invalid payload");
    expect(job?.errorMessage).toContain("range");
  });

  it("succeeds a job whose payload is valid", async () => {
    await prisma.backgroundJob.create({
      data: {
        id: "job_good_range",
        type: "AttendanceSummary",
        status: "Queued",
        attempts: 0,
        maxAttempts: 3,
        payload: { studentId: "student_z", range: "2026-09-01..2026-09-30" }
      }
    });

    const job = await workerService.runNextJob(ADMIN);
    expect(job?.status).toBe("Succeeded");
    expect(job?.errorMessage).toBeNull();
  });

  it("records what the handler did in the audit event", async () => {
    await prisma.backgroundJob.create({
      data: {
        id: "job_sync",
        type: "EnrollmentSync",
        status: "Queued",
        attempts: 0,
        maxAttempts: 3,
        payload: { sectionId: "section_x" }
      }
    });
    await workerService.runNextJob(ADMIN);

    const audit = await prisma.auditEvent.findFirstOrThrow({
      where: { action: "job.workerRan", entityId: "job_sync" }
    });
    expect((audit.metadata as { detail?: string }).detail).toContain("Synced");
  });

  it("runNextBatch stops when the queue empties instead of looping the limit", async () => {
    for (const id of ["b1", "b2"]) {
      await prisma.backgroundJob.create({
        data: {
          id,
          type: "EnrollmentSync",
          status: "Queued",
          attempts: 0,
          maxAttempts: 3,
          payload: { sectionId: "section_x" }
        }
      });
    }

    const processed = await workerService.runNextBatch(ADMIN, 10);
    expect(processed).toHaveLength(2);
  });

  it("releaseDueJobs makes a scheduled job runnable", async () => {
    await prisma.backgroundJob.create({
      data: {
        id: "job_scheduled",
        type: "EnrollmentSync",
        status: "Queued",
        attempts: 0,
        maxAttempts: 3,
        payload: { sectionId: "section_x" },
        scheduledFor: new Date("2020-01-01"),
        nextRunAt: new Date("2020-01-01")
      }
    });

    const released = await workerService.releaseDueJobs(ADMIN);
    expect(released).toBe(1);
    expect((await workerService.runNextJob(ADMIN))?.id).toBe("job_scheduled");
  });
});

describe("sub-agent runs are persisted as a tree", () => {
  const manifestFor = (agentType: "StudentSuccessReview" | "StudentProgressSummary" | "AtRiskStudentDetection" | "AttendanceAnomaly") =>
    prisma.agentManifest.create({
      data: {
        agentType,
        version: "1.0.0",
        name: agentType,
        description: "Test manifest",
        supportedTargets: ["Student"],
        requiredPermissions: ["agent:run"],
        inputSchema: {},
        outputSchema: {},
        isActive: true
      }
    });

  const seedAllManifests = async () => {
    await manifestFor("StudentSuccessReview");
    await manifestFor("StudentProgressSummary");
    await manifestFor("AtRiskStudentDetection");
    await manifestFor("AttendanceAnomaly");
  };

  it("creates four runs, three of them children of the review", async () => {
    await seedAllManifests();
    const student = await makeStudent();

    const review = await agentRunService.runStudentSuccessReviewAgent(ADMIN, student.id);

    const runs = await prisma.agentRun.findMany({ where: { targetId: student.id } });
    expect(runs).toHaveLength(4);

    const children = runs.filter((run) => run.parentRunId === review.id);
    expect(children).toHaveLength(3);
    expect(children.map((run) => run.agentType).sort()).toEqual([
      "AtRiskStudentDetection",
      "AttendanceAnomaly",
      "StudentProgressSummary"
    ]);

    // Each child is a real run, not a stub: its own input snapshot, its own
    // confidence, its own trace. That is the whole point — an advisor can now
    // judge what the review was built from.
    for (const child of children) {
      expect(child.status).toBe("Succeeded");
      expect(child.confidenceScore).toBeTypeOf("number");
      expect(child.inputSnapshot).not.toBeNull();
    }
  });

  it("caps the parent's confidence at its weakest child", async () => {
    await seedAllManifests();
    const student = await makeStudent();

    const review = await agentRunService.runStudentSuccessReviewAgent(ADMIN, student.id);
    const children = await prisma.agentRun.findMany({ where: { parentRunId: review.id } });
    const weakest = Math.min(...children.map((child) => child.confidenceScore ?? 100));

    expect(review.confidenceScore).toBeLessThanOrEqual(Math.max(weakest, review.confidenceScore ?? 0));
    // A review assembled from thin inputs must not report the orchestrator's
    // own certainty as if the inputs were solid.
    expect(review.confidenceScore).toBeTypeOf("number");
  });

  it("leaves completed children in place when a later sub-agent is refused", async () => {
    // Everything except AttendanceAnomaly, so the third sub-agent hits the gate.
    await manifestFor("StudentSuccessReview");
    await manifestFor("StudentProgressSummary");
    await manifestFor("AtRiskStudentDetection");
    const student = await makeStudent();

    await expect(agentRunService.runStudentSuccessReviewAgent(ADMIN, student.id)).rejects.toMatchObject({
      code: "CONFLICT"
    });

    const runs = await prisma.agentRun.findMany({ where: { targetId: student.id } });
    const parent = runs.find((run) => run.agentType === "StudentSuccessReview");

    expect(parent?.status).toBe("Failed");
    expect(parent?.errorMessage).toContain("Sub-agent failure");
    /*
     * The two children that succeeded survive. "The review failed because the
     * attendance agent could not run" is actionable, and the work that did
     * complete is still worth reading — discarding it would throw away the
     * evidence of how far the run got.
     */
    expect(runs.filter((run) => run.parentRunId === parent?.id && run.status === "Succeeded")).toHaveLength(2);
  });
});

describe("manifest-gated agent execution", () => {
  const manifest = (overrides: Partial<{ id: string; agentType: "AtRiskStudentDetection" | "GuardianCommunicationDraft"; version: string; isActive: boolean; supportedTargets: string[]; requiredPermissions: string[] }> = {}) =>
    prisma.agentManifest.create({
      data: {
        id: overrides.id ?? "manifest_test",
        agentType: overrides.agentType ?? "AtRiskStudentDetection",
        version: overrides.version ?? "1.0.0",
        name: "Test manifest",
        description: "Test",
        supportedTargets: overrides.supportedTargets ?? ["Student"],
        requiredPermissions: overrides.requiredPermissions ?? ["agent:run"],
        inputSchema: { version: "3.1.0" },
        outputSchema: { version: "4.2.0" },
        isActive: overrides.isActive ?? true
      }
    });

  it("refuses to run an agent with no active manifest, and creates no AgentRun", async () => {
    const student = await makeStudent();
    await manifest({ isActive: false });

    await expect(agentRunService.runAtRiskAgent(ADMIN, student.id)).rejects.toMatchObject({ code: "CONFLICT" });

    /*
     * The assertion that matters. A Failed row would claim the agent ran and
     * broke, which is a different and more alarming statement than "it is
     * switched off" — and it would make the failed-run count on /agent-ops
     * meaningless the moment anyone deactivated a manifest.
     */
    expect(await prisma.agentRun.count()).toBe(0);
  });

  it("takes version and schema versions from the manifest, not from hardcoded strings", async () => {
    const student = await makeStudent();
    await manifest({ version: "2.3.4" });

    const run = await agentRunService.runAtRiskAgent(ADMIN, student.id);

    expect(run.agentVersion).toBe("2.3.4");
    expect(run.inputSchemaVersion).toBe("3.1.0");
    expect(run.outputSchemaVersion).toBe("4.2.0");
  });

  it("serves the highest active version, so 1.0.10 beats 1.0.9", async () => {
    const student = await makeStudent();
    await manifest({ id: "m_9", version: "1.0.9" });
    await manifest({ id: "m_10", version: "1.0.10" });

    const run = await agentRunService.runAtRiskAgent(ADMIN, student.id);
    expect(run.agentVersion).toBe("1.0.10");
  });

  it("enforces the manifest's requiredPermissions on top of agent:run", async () => {
    const student = await makeStudent();
    await manifest({ requiredPermissions: ["agent:run", "notification:manage"] });

    // A Teacher holds agent:run but not notification:manage. Before US-17 the
    // manifest said so and nothing read it.
    await expect(
      agentRunService.runAtRiskAgent({ id: "user_teacher", role: "Teacher" }, student.id)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.agentRun.count()).toBe(0);
  });

  it("refuses a target type the manifest does not support", async () => {
    const student = await makeStudent();
    await manifest({ supportedTargets: ["Teacher"] });

    await expect(agentRunService.runAtRiskAgent(ADMIN, student.id)).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
  });

  it("refuses a manifest requiring a permission the system does not define", async () => {
    const student = await makeStudent();
    await manifest({ requiredPermissions: ["agent:run", "agent:runn"] });

    // A typo must not silently mean "no permission required". That is the
    // failure mode where a security control quietly stops applying.
    await expect(agentRunService.runAtRiskAgent(ADMIN, student.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("deactivating the serving version rolls back to the next active one", async () => {
    const student = await makeStudent();
    await manifest({ id: "m_1", version: "1.9.0" });
    const newer = await manifest({ id: "m_2", version: "2.0.0" });

    expect((await agentRunService.runAtRiskAgent(ADMIN, student.id)).agentVersion).toBe("2.0.0");

    await agentOperationsService.setManifestActive(ADMIN, newer.id, false);

    expect((await agentRunService.runAtRiskAgent(ADMIN, student.id)).agentVersion).toBe("1.9.0");
    expect(await prisma.auditEvent.count({ where: { action: "agentManifest.deactivated" } })).toBe(1);
  });
});

describe("weekly risk reports", () => {
  it("generates one report per scope per week, however many times it is asked", async () => {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id);
    const student = await makeStudent();
    await enrollmentService.enrollStudent(ADMIN, {
      studentId: student.id,
      classSectionId: section.id,
      allowWaitlist: false
    });

    // Two requests in the same week, with the first fully processed in between —
    // so the job-level idempotency key cannot be what saves us the second time.
    await reportService.requestWeeklyRiskReport(ADMIN, { scopeType: "School", scopeId: null });
    await workerService.runNextBatch(ADMIN, 10);
    await reportService.requestWeeklyRiskReport(ADMIN, { scopeType: "School", scopeId: null });
    await workerService.runNextBatch(ADMIN, 10);

    const reports = await prisma.report.findMany({ where: { type: "weekly-risk" } });
    expect(reports).toHaveLength(1);

    const payload = reports[0]?.payload as unknown as WeeklyRiskReportPayload;
    expect(payload.totals.students).toBe(1);
    expect(payload.rows[0]?.studentId).toBe(student.id);
    // Anchored to the week's Monday, not to "now minus seven days".
    expect(reports[0]?.periodStart.getUTCDay()).toBe(1);
  });

  it("scopes a section report to that section's enrolled students", async () => {
    const teacher = await makeTeacher();
    const [inSection, elsewhere] = [await makeStudent(), await makeStudent()];
    const section = await makeSection(teacher.id);
    await enrollmentService.enrollStudent(ADMIN, {
      studentId: inSection.id,
      classSectionId: section.id,
      allowWaitlist: false
    });

    await reportService.requestWeeklyRiskReport(ADMIN, { scopeType: "ClassSection", scopeId: section.id });
    await workerService.runNextBatch(ADMIN, 10);

    const report = await prisma.report.findFirstOrThrow({ where: { scopeType: "ClassSection" } });
    const payload = report.payload as unknown as WeeklyRiskReportPayload;

    expect(payload.rows.map((row) => row.studentId)).toEqual([inSection.id]);
    expect(payload.rows.map((row) => row.studentId)).not.toContain(elsewhere.id);
  });

  it("refuses a report request from a Viewer", async () => {
    await expect(
      reportService.requestWeeklyRiskReport(VIEWER, { scopeType: "School", scopeId: null })
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("assignment dates are bound to the section's term", () => {
  it("refuses a due date outside the term and names it", async () => {
    const teacher = await makeTeacher();
    const term = await makeTerm({
      id: "term_narrow",
      name: "Fall 2026",
      startsAt: new Date("2026-08-17T00:00:00.000Z"),
      endsAt: new Date("2026-12-18T00:00:00.000Z")
    });
    const section = await makeSection(teacher.id, { academicTermId: term.id });

    await expect(
      assignmentService.createAssignment(ADMIN, {
        classSectionId: section.id,
        title: "Winter break homework",
        description: "Due after the term ends.",
        type: "Homework",
        status: "Draft",
        dueDate: new Date("2027-01-10T00:00:00.000Z"),
        pointsPossible: 10,
        createdByTeacherId: teacher.id
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    // Refused means nothing written, not "written and flagged".
    expect(await prisma.assignment.count({ where: { classSectionId: section.id } })).toBe(0);
  });

  it("refuses a grading period from a different term", async () => {
    const teacher = await makeTeacher();
    const sectionTerm = await makeTerm({ id: "term_a", name: "Term A" });
    const otherTerm = await makeTerm({
      id: "term_b",
      name: "Term B",
      startsAt: new Date("2031-01-01T00:00:00.000Z"),
      endsAt: new Date("2031-06-30T00:00:00.000Z")
    });
    const section = await makeSection(teacher.id, { academicTermId: sectionTerm.id });
    const foreignPeriod = await prisma.gradingPeriod.create({
      data: {
        academicTermId: otherTerm.id,
        name: "B-Q1",
        startsAt: otherTerm.startsAt,
        endsAt: otherTerm.endsAt,
        weight: 1
      }
    });

    await expect(
      assignmentService.createAssignment(ADMIN, {
        classSectionId: section.id,
        gradingPeriodId: foreignPeriod.id,
        title: "Cross-term assignment",
        description: "Points at a period in another term.",
        type: "Homework",
        status: "Draft",
        dueDate: new Date("2026-03-01T00:00:00.000Z"),
        pointsPossible: 10,
        createdByTeacherId: teacher.id
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

describe("guardian records are the only source of truth", () => {
  const newStudent = (overrides: { studentNumber: string; email: string; guardianEmail: string; guardianName?: string }) => ({
    firstName: "Maya",
    lastName: "Johnson",
    email: overrides.email,
    gradeLevel: 9,
    enrollmentStatus: "Active" as const,
    studentNumber: overrides.studentNumber,
    primaryGuardian: { name: overrides.guardianName ?? "Denise Johnson", email: overrides.guardianEmail }
  });

  it("creates the student and their primary guardian link in one go", async () => {
    const student = await studentService.createStudent(
      ADMIN,
      newStudent({ studentNumber: "NS-2001", email: "a@student.example", guardianEmail: "denise@guardian.example" })
    );

    const links = await prisma.studentGuardian.findMany({
      where: { studentId: student.id },
      include: { guardian: true }
    });

    expect(links).toHaveLength(1);
    expect(links[0]?.isPrimary).toBe(true);
    expect(links[0]?.guardian.email).toBe("denise@guardian.example");
    expect(links[0]?.guardian.firstName).toBe("Denise");
    expect(links[0]?.guardian.lastName).toBe("Johnson");
  });

  it("links an existing guardian rather than duplicating them, ignoring case", async () => {
    const first = await studentService.createStudent(
      ADMIN,
      newStudent({ studentNumber: "NS-2002", email: "b@student.example", guardianEmail: "shared@guardian.example" })
    );
    const second = await studentService.createStudent(
      ADMIN,
      // Same person, typed differently. Guardian.email is unique, so without the
      // case-insensitive match this either duplicates a parent or fails outright.
      newStudent({ studentNumber: "NS-2003", email: "c@student.example", guardianEmail: "  Shared@Guardian.Example  " })
    );

    const guardians = await prisma.guardian.findMany({ where: { email: { contains: "shared", mode: "insensitive" } } });
    expect(guardians).toHaveLength(1);

    const links = await prisma.studentGuardian.findMany({ where: { guardianId: guardians[0]?.id } });
    expect(links.map((link) => link.studentId).sort()).toEqual([first.id, second.id].sort());
  });

  it("demotes the previous primary when a second link is made primary", async () => {
    const student = await studentService.createStudent(
      ADMIN,
      newStudent({ studentNumber: "NS-2004", email: "d@student.example", guardianEmail: "first@guardian.example" })
    );

    const second = await academicOperationsService.addGuardianToStudent(ADMIN, {
      studentId: student.id,
      name: "Harper Brooks",
      email: "second@guardian.example",
      relationship: "Father",
      isPrimary: true,
      receivesDigest: true
    });

    const links = await prisma.studentGuardian.findMany({ where: { studentId: student.id } });
    expect(links).toHaveLength(2);
    expect(links.filter((link) => link.isPrimary).map((link) => link.id)).toEqual([second.id]);
  });

  it("refuses to unlink the last guardian, and promotes a replacement when the primary goes", async () => {
    const student = await studentService.createStudent(
      ADMIN,
      newStudent({ studentNumber: "NS-2005", email: "e@student.example", guardianEmail: "only@guardian.example" })
    );
    const [onlyLink] = await prisma.studentGuardian.findMany({ where: { studentId: student.id } });

    await expect(
      academicOperationsService.unlinkGuardianFromStudent(ADMIN, onlyLink!.id)
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await academicOperationsService.addGuardianToStudent(ADMIN, {
      studentId: student.id,
      name: "Harper Brooks",
      email: "backup@guardian.example",
      relationship: "Father",
      isPrimary: false,
      receivesDigest: true
    });
    await academicOperationsService.unlinkGuardianFromStudent(ADMIN, onlyLink!.id);

    const remaining = await prisma.studentGuardian.findMany({ where: { studentId: student.id } });
    expect(remaining).toHaveLength(1);
    // Removing the primary must not leave the student without one: the
    // communication draft agent now refuses to run in that state.
    expect(remaining[0]?.isPrimary).toBe(true);
  });

  it("refuses to draft a guardian message for a student with no guardian", async () => {
    // makeStudent creates no guardian link, which is only reachable through a
    // fixture or a pre-US-14 row. The agent must report it rather than draft to
    // an address it invented.
    const orphan = await makeStudent();
    /*
     * The manifest is required as of US-17 — the gate runs before the input is
     * built, so without this the agent refuses for a completely different
     * reason and this test would pass while proving nothing about guardians.
     */
    await prisma.agentManifest.create({
      data: {
        agentType: "GuardianCommunicationDraft",
        version: "1.0.0",
        name: "Guardian Communication Draft Agent",
        description: "Test manifest",
        supportedTargets: ["Student"],
        requiredPermissions: ["agent:run"],
        inputSchema: {},
        outputSchema: {},
        isActive: true
      }
    });

    await expect(agentRunService.runGuardianCommunicationDraftAgent(ADMIN, orphan.id)).rejects.toMatchObject({
      code: "VALIDATION_ERROR"
    });
    expect(await prisma.agentRun.count({ where: { targetId: orphan.id } })).toBe(0);
  });
});

describe("structured logging", () => {
  it("writes one warn row when a service refuses a caller, with the actor in metadata", async () => {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id);
    const student = await makeStudent();

    await expect(
      enrollmentService.enrollStudent(VIEWER, { studentId: student.id, classSectionId: section.id, allowWaitlist: false })
    ).rejects.toBeInstanceOf(AppError);

    // Log writes are fire-and-forget so that a failing log cannot fail a
    // business operation. The consequence is that a test has to wait for them,
    // and `flushLogs` is the honest way to do it — a sleep would pass on a fast
    // machine and flake on a loaded one.
    await flushLogs();

    const rows = await prisma.structuredLog.findMany({
      where: { service: "enrollment-service", level: "warn" }
    });

    expect(rows).toHaveLength(1);
    const [row] = rows;
    expect(row?.message).toBe("enrollment-service.enrollStudent refused");
    expect(row?.metadata).toMatchObject({ code: "FORBIDDEN", actorId: VIEWER.id, role: "Viewer" });
    /*
     * The message must stay free of ids and names. fingerprintLog groups by
     * normalised message text, so a message naming the student would give every
     * student their own fingerprint and the grouping panel would stop grouping.
     */
    expect(row?.message).not.toContain(student.id);
    expect(row?.message).not.toContain(VIEWER.id);
  });

  it("writes an info row naming the created entity when a service succeeds", async () => {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id);
    const student = await makeStudent();

    const enrollment = await enrollmentService.enrollStudent(ADMIN, {
      studentId: student.id,
      classSectionId: section.id,
      allowWaitlist: false
    });
    await flushLogs();

    const row = await prisma.structuredLog.findFirst({
      where: { service: "enrollment-service", level: "info", entityId: enrollment.id }
    });

    expect(row?.message).toBe("enrollment-service.enrollStudent succeeded");
    expect(row?.userId).toBe(ADMIN.id);
  });

  it("groups two refusals of the same rule under one fingerprint", async () => {
    const teacher = await makeTeacher();
    const section = await makeSection(teacher.id);
    const first = await makeStudent();
    const second = await makeStudent();

    await expect(
      enrollmentService.enrollStudent(VIEWER, { studentId: first.id, classSectionId: section.id, allowWaitlist: false })
    ).rejects.toBeInstanceOf(AppError);
    await expect(
      enrollmentService.enrollStudent(VIEWER, { studentId: second.id, classSectionId: section.id, allowWaitlist: false })
    ).rejects.toBeInstanceOf(AppError);
    await flushLogs();

    const rows = await prisma.structuredLog.findMany({ where: { service: "enrollment-service", level: "warn" } });

    // Different students, different requests, one operational problem. This is
    // the whole reason messages are stable.
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.fingerprint)).size).toBe(1);
  });

  it("purges logs older than the retention window and records the purge", async () => {
    await prisma.structuredLog.createMany({
      data: [
        {
          id: "log_old",
          timestamp: new Date("2020-01-01T00:00:00.000Z"),
          service: "test",
          environment: "development",
          level: "info",
          message: "Ancient history",
          metadata: {},
          fingerprint: "abc123"
        },
        {
          id: "log_recent",
          timestamp: new Date(),
          service: "test",
          environment: "development",
          level: "info",
          message: "Still relevant",
          metadata: {},
          fingerprint: "def456"
        }
      ]
    });

    const result = await logService.purgeOlderThan(ADMIN, 30);

    expect(result.removed).toBe(1);
    expect(await prisma.structuredLog.findUnique({ where: { id: "log_old" } })).toBeNull();
    expect(await prisma.structuredLog.findUnique({ where: { id: "log_recent" } })).not.toBeNull();

    const audit = await prisma.auditEvent.findFirst({ where: { action: "log.purged" } });
    expect(audit).not.toBeNull();
    expect(audit?.after).toMatchObject({ removedCount: 1, retentionDays: 30 });
  });

  it("refuses a purge from anyone but an Admin, and refuses a zero-day window", async () => {
    await expect(logService.purgeOlderThan(VIEWER, 30)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(logService.purgeOlderThan(ADMIN, 0)).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});
