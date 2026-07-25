import { describe, expect, it } from "vitest";
import { prisma } from "@agentic-edu/db";
import { assignmentService } from "../services/assignment-service";
import { enrollmentService } from "../services/enrollment-service";
import { workerService } from "../services/worker-service";
import { AppError } from "../errors";
import { ADMIN, VIEWER, makeAssignment, makeRubric, makeSection, makeStudent, makeTeacher } from "./fixtures";

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
