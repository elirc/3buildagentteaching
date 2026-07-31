import { prisma } from "@agentic-edu/db";
import type { AssignmentInput } from "@agentic-edu/domain";
import {
  calculateRubricScore,
  canSubmitAssignment,
  determineSubmissionStatus,
  rubricRequiresTeacherReview,
  validateScore
} from "@agentic-edu/domain";
import { AppError } from "../errors";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent } from "../audit";
import { jobService } from "./job-service";
import { notifyService } from "./notify-service";
import { withServiceLogging } from "../logging";

export const assignmentService = withServiceLogging("assignment-service", {
  async createAssignment(actor: ActorContext, input: AssignmentInput) {
    assertCan(actor, "assignment:create", { teacherId: input.createdByTeacherId });
    return prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.create({ data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "assignment.created",
        entityType: "Assignment",
        entityId: assignment.id,
        after: assignment
      });
      if (assignment.status === "Published") {
        await createAuditEvent(tx, {
          actorUserId: actor.id,
          action: "assignment.published",
          entityType: "Assignment",
          entityId: assignment.id,
          after: assignment
        });
      }
      return assignment;
    });
  },

  async updateAssignment(actor: ActorContext, id: string, input: AssignmentInput) {
    assertCan(actor, "assignment:update", { teacherId: input.createdByTeacherId });
    return prisma.$transaction(async (tx) => {
      const before = await tx.assignment.findUniqueOrThrow({ where: { id } });
      const assignment = await tx.assignment.update({ where: { id }, data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "assignment.updated",
        entityType: "Assignment",
        entityId: assignment.id,
        before,
        after: assignment
      });
      if (before.status !== "Published" && assignment.status === "Published") {
        await createAuditEvent(tx, {
          actorUserId: actor.id,
          action: "assignment.published",
          entityType: "Assignment",
          entityId: assignment.id,
          before,
          after: assignment
        });
      }
      return assignment;
    });
  },

  async publishAssignment(actor: ActorContext, id: string) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.assignment.findUniqueOrThrow({ where: { id } });
      assertCan(actor, "assignment:publish", { teacherId: before.createdByTeacherId });
      const assignment = await tx.assignment.update({ where: { id }, data: { status: "Published" } });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "assignment.published",
        entityType: "Assignment",
        entityId: id,
        before,
        after: assignment
      });
      return assignment;
    });
  },

  async submitAssignment(
    actor: ActorContext,
    input: {
      assignmentId: string;
      studentId: string;
      contentText: string;
      attachmentUrl: string | null;
      /** Injected so the late/on-time boundary is testable. */
      now?: Date;
    }
  ) {
    assertCan(actor, "submission:create", { studentId: input.studentId });
    return prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUniqueOrThrow({ where: { id: input.assignmentId } });
      const submittedAt = input.now ?? new Date();

      /*
       * canSubmitAssignment has existed and been unit-tested since the first
       * commit and was called by nothing. Without it, a student could submit to
       * a Draft assignment they were never meant to see, or to a Closed one
       * after the teacher had finished grading — both just worked.
       */
      const decision = canSubmitAssignment({
        assignmentStatus: assignment.status,
        dueDate: assignment.dueDate,
        submittedAt,
        now: submittedAt
      });
      if (!decision.allowed) {
        throw new AppError("CONFLICT", decision.reason ?? "This assignment is not open for submission.", {
          assignmentId: input.assignmentId
        });
      }

      /*
       * determineSubmissionStatus rather than an inline date comparison. Same
       * answer today, but the rule now lives in one tested place instead of
       * being duplicated between here and the domain function that was written
       * for it.
       */
      const status = determineSubmissionStatus({
        assignmentStatus: assignment.status,
        dueDate: assignment.dueDate,
        submittedAt,
        now: submittedAt
      });

      const submission = await tx.submission.upsert({
        where: {
          assignmentId_studentId: {
            assignmentId: input.assignmentId,
            studentId: input.studentId
          }
        },
        create: {
          assignmentId: input.assignmentId,
          studentId: input.studentId,
          status,
          submittedAt,
          contentText: input.contentText,
          attachmentUrl: input.attachmentUrl
        },
        update: {
          status,
          submittedAt,
          contentText: input.contentText,
          attachmentUrl: input.attachmentUrl
        }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "submission.created",
        entityType: "Submission",
        entityId: submission.id,
        after: submission
      });
      return submission;
    });
  },

  /**
   * Grades a submission against its assignment's rubric.
   *
   * The total is *derived* from the criterion scores, never supplied by the
   * caller. A rubric whose parts do not add up to its whole is not a rubric —
   * it is two numbers that will eventually disagree, and the disagreement will
   * surface as a student asking why their criterion scores do not match their
   * grade.
   *
   * Partial scoring is allowed on purpose. Teachers score a stack of work in
   * passes, and forcing all-or-nothing means either losing progress or entering
   * fake zeros. An incompletely-scored submission stays `Submitted` rather than
   * becoming `Graded`, so it remains in the US-05 queue until it is genuinely
   * finished.
   */
  async gradeSubmissionWithRubric(
    actor: ActorContext,
    input: {
      submissionId: string;
      gradedByTeacherId: string;
      feedback: string;
      scores: Array<{ criterionId: string; score: number; feedback?: string | null }>;
    }
  ) {
    assertCan(actor, "submission:grade", { teacherId: input.gradedByTeacherId });

    return prisma.$transaction(async (tx) => {
      const before = await tx.submission.findUniqueOrThrow({
        where: { id: input.submissionId },
        include: { assignment: { include: { rubric: { include: { criteria: true } } } }, criterionScores: true }
      });

      const rubric = before.assignment.rubric;
      if (!rubric) {
        throw new AppError("CONFLICT", "This assignment has no rubric. Use the plain score field instead.", {
          submissionId: input.submissionId
        });
      }

      // Reject scores for criteria that do not belong to this rubric before
      // doing anything else — otherwise a stale form could write orphan rows.
      const criterionIds = new Set(rubric.criteria.map((criterion) => criterion.id));
      const unknown = input.scores.find((score) => !criterionIds.has(score.criterionId));
      if (unknown) {
        throw new AppError("VALIDATION_ERROR", "That criterion does not belong to this assignment's rubric.", {
          criterionId: unknown.criterionId
        });
      }

      const summary = calculateRubricScore(
        rubric.criteria.map((criterion) => ({
          id: criterion.id,
          title: criterion.title,
          pointsPossible: criterion.pointsPossible
        })),
        input.scores.map((score) => ({ criterionId: score.criterionId, score: score.score }))
      );

      if (summary.invalidScores.length > 0) {
        throw new AppError("VALIDATION_ERROR", summary.invalidScores[0]!.reason, {
          invalidScores: summary.invalidScores
        });
      }

      for (const score of input.scores) {
        await tx.submissionCriterionScore.upsert({
          where: {
            submissionId_criterionId: { submissionId: input.submissionId, criterionId: score.criterionId }
          },
          create: {
            submissionId: input.submissionId,
            criterionId: score.criterionId,
            score: score.score,
            feedback: score.feedback ?? null
          },
          update: { score: score.score, feedback: score.feedback ?? null }
        });
      }

      const needsReview = rubricRequiresTeacherReview(summary);
      const submission = await tx.submission.update({
        where: { id: input.submissionId },
        data: {
          score: summary.totalScore,
          feedback: input.feedback,
          // Incomplete scoring keeps the submission in the grading queue.
          status: needsReview ? before.status : "Graded",
          gradedAt: needsReview ? before.gradedAt : new Date(),
          gradedByTeacherId: input.gradedByTeacherId
        }
      });

      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "submission.graded",
        entityType: "Submission",
        entityId: input.submissionId,
        before,
        after: {
          ...submission,
          // The per-criterion breakdown belongs in the audit trail: "why is this
          // 46 out of 50" is exactly the question an audit log should answer.
          criterionScores: input.scores,
          rubricSummary: summary
        },
        metadata: { rubricId: rubric.id, scoredCriteria: input.scores.length, totalCriteria: rubric.criteria.length }
      });

      return { submission, summary, needsReview };
    });
  },

  async gradeSubmission(
    actor: ActorContext,
    input: {
      id: string;
      score: number;
      feedback: string;
      gradedByTeacherId: string;
    }
  ) {
    assertCan(actor, "submission:grade", { teacherId: input.gradedByTeacherId });
    return prisma.$transaction(async (tx) => {
      const before = await tx.submission.findUniqueOrThrow({
        where: { id: input.id },
        include: { assignment: true }
      });
      const scoreDecision = validateScore(input.score, before.assignment.pointsPossible);
      if (!scoreDecision.valid) {
        throw new AppError("VALIDATION_ERROR", scoreDecision.reason ?? "Score is invalid.", {
          score: input.score,
          pointsPossible: before.assignment.pointsPossible
        });
      }
      const submission = await tx.submission.update({
        where: { id: input.id },
        data: {
          score: input.score,
          feedback: input.feedback,
          status: "Graded",
          gradedAt: new Date(),
          gradedByTeacherId: input.gradedByTeacherId
        }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "submission.graded",
        entityType: "Submission",
        entityId: input.id,
        before,
        after: submission
      });

      /*
       * Enqueued inside the same transaction as the grade.
       *
       * If the grade rolls back, the job must roll back with it — otherwise the
       * queue holds work for a grade that never happened, and the worker
       * recalculates against data that does not exist.
       *
       * The idempotency key is per-assignment, so grading thirty submissions in
       * one sitting queues one recalculation rather than thirty.
       */
      await jobService.enqueue(
        actor,
        {
          type: "GradeRecalculation",
          payload: { assignmentId: before.assignmentId },
          idempotencyKey: `grade-recalc:${before.assignmentId}`,
          relatedAssignmentId: before.assignmentId,
          relatedStudentId: before.studentId
        },
        tx
      );

      // Tell the student and their guardians, in the same transaction as the
      // grade. A notification about a grade that rolled back would be worse
      // than no notification.
      await notifyService.notify(
        actor,
        {
          type: "GradePosted",
          title: `${before.assignment.title} has been marked`,
          body: `Score: ${input.score} out of ${before.assignment.pointsPossible}.`,
          studentId: before.studentId,
          candidates: await notifyService.familyCandidates(tx, before.studentId),
          metadata: { submissionId: before.id }
        },
        tx
      );

      return submission;
    });
  }
});
