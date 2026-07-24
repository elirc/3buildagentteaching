import { prisma } from "@agentic-edu/db";
import type { AssignmentInput } from "@agentic-edu/domain";
import { validateScore } from "@agentic-edu/domain";
import { AppError } from "../errors";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent } from "../audit";

export const assignmentService = {
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
    }
  ) {
    assertCan(actor, "submission:create", { studentId: input.studentId });
    return prisma.$transaction(async (tx) => {
      const assignment = await tx.assignment.findUniqueOrThrow({ where: { id: input.assignmentId } });
      const submittedAt = new Date();
      const status = submittedAt > assignment.dueDate ? "Late" : "Submitted";
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
      return submission;
    });
  }
};
