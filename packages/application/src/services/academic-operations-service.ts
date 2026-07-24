import { Prisma, prisma } from "@agentic-edu/db";
import {
  canTransitionApproval,
  nextNotificationStatusAfterRead,
  validateAcademicTerm,
  validateGradingPeriod
} from "@agentic-edu/domain";
import type {
  AcademicTermStatus,
  ApprovalStatus,
  GuardianRelationship,
  NotificationChannel,
  NotificationType
} from "@agentic-edu/shared";
import { createAuditEvent } from "../audit";
import { assertCan, type ActorContext } from "../context";
import { AppError } from "../errors";

export interface AcademicTermCreateInput {
  name: string;
  status: AcademicTermStatus;
  startsAt: Date;
  endsAt: Date;
}

export interface GradingPeriodCreateInput {
  academicTermId: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
  weight: number;
}

export interface GuardianCreateInput {
  userId?: string | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
}

export interface StudentGuardianLinkInput {
  studentId: string;
  guardianId: string;
  relationship: GuardianRelationship;
  isPrimary: boolean;
  receivesDigest: boolean;
  emergencyContact: boolean;
}

export interface RubricCreateInput {
  assignmentId?: string | null;
  title: string;
  description?: string | null;
  createdByTeacherId: string;
  criteria: Array<{ title: string; description: string; pointsPossible: number; sortOrder: number }>;
}

export interface NotificationCreateInput {
  userId?: string | null;
  studentId?: string | null;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  metadata?: Prisma.InputJsonValue;
}

export const academicOperationsService = {
  async createAcademicTerm(actor: ActorContext, input: AcademicTermCreateInput) {
    assertCan(actor, "term:manage");
    const decision = validateAcademicTerm(input);
    if (!decision.valid) {
      throw new AppError("VALIDATION_ERROR", decision.reason ?? "Academic term is invalid.", { input });
    }

    return prisma.$transaction(async (tx) => {
      const term = await tx.academicTerm.create({ data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "academicTerm.created",
        entityType: "AcademicTerm",
        entityId: term.id,
        after: term
      });
      return term;
    });
  },

  async createGradingPeriod(actor: ActorContext, input: GradingPeriodCreateInput) {
    assertCan(actor, "term:manage");
    const term = await prisma.academicTerm.findUniqueOrThrow({ where: { id: input.academicTermId } });
    const decision = validateGradingPeriod(term, input);
    if (!decision.valid) {
      throw new AppError("VALIDATION_ERROR", decision.reason ?? "Grading period is invalid.", { input });
    }

    return prisma.$transaction(async (tx) => {
      const period = await tx.gradingPeriod.create({ data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "gradingPeriod.created",
        entityType: "GradingPeriod",
        entityId: period.id,
        after: period
      });
      return period;
    });
  },

  async createGuardian(actor: ActorContext, input: GuardianCreateInput) {
    assertCan(actor, "guardian:manage");
    return prisma.$transaction(async (tx) => {
      const guardian = await tx.guardian.create({ data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "guardian.created",
        entityType: "Guardian",
        entityId: guardian.id,
        after: guardian
      });
      return guardian;
    });
  },

  async linkGuardianToStudent(actor: ActorContext, input: StudentGuardianLinkInput) {
    assertCan(actor, "guardian:manage", { studentId: input.studentId });
    return prisma.$transaction(async (tx) => {
      const link = await tx.studentGuardian.upsert({
        where: { studentId_guardianId: { studentId: input.studentId, guardianId: input.guardianId } },
        create: input,
        update: {
          relationship: input.relationship,
          isPrimary: input.isPrimary,
          receivesDigest: input.receivesDigest,
          emergencyContact: input.emergencyContact
        }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "studentGuardian.linked",
        entityType: "StudentGuardian",
        entityId: link.id,
        after: link
      });
      return link;
    });
  },

  async createRubric(actor: ActorContext, input: RubricCreateInput) {
    assertCan(actor, "rubric:manage", { teacherId: input.createdByTeacherId });
    if (input.criteria.length === 0 || input.criteria.some((criterion) => criterion.pointsPossible <= 0)) {
      throw new AppError("VALIDATION_ERROR", "Rubrics require at least one criterion with positive points.", { input });
    }

    return prisma.$transaction(async (tx) => {
      const rubric = await tx.rubric.create({
        data: {
          assignmentId: input.assignmentId,
          title: input.title,
          description: input.description,
          createdByTeacherId: input.createdByTeacherId,
          criteria: { create: input.criteria }
        },
        include: { criteria: true }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "rubric.created",
        entityType: "Rubric",
        entityId: rubric.id,
        after: rubric
      });
      return rubric;
    });
  },

  async createNotification(actor: ActorContext, input: NotificationCreateInput) {
    assertCan(actor, "notification:manage", { studentId: input.studentId });
    if (!input.userId && !input.studentId) {
      throw new AppError("VALIDATION_ERROR", "Notification requires a user or student recipient.", { input });
    }

    return prisma.$transaction(async (tx) => {
      const notification = await tx.notification.create({
        data: {
          ...input,
          status: "Queued",
          metadata: input.metadata ?? {}
        }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "notification.created",
        entityType: "Notification",
        entityId: notification.id,
        after: notification
      });
      return notification;
    });
  },

  async markNotificationRead(actor: ActorContext, notificationId: string) {
    assertCan(actor, "notification:manage");
    return prisma.$transaction(async (tx) => {
      const before = await tx.notification.findUniqueOrThrow({ where: { id: notificationId } });
      const notification = await tx.notification.update({
        where: { id: notificationId },
        data: {
          status: nextNotificationStatusAfterRead(before.status),
          readAt: before.status === "Failed" ? before.readAt : new Date()
        }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "notification.read",
        entityType: "Notification",
        entityId: notification.id,
        before,
        after: notification
      });
      return notification;
    });
  },

  async requestInterventionApproval(actor: ActorContext, interventionPlanId: string) {
    assertCan(actor, "intervention:update");
    return prisma.$transaction(async (tx) => {
      const approval = await tx.interventionApproval.create({
        data: {
          interventionPlanId,
          requestedByUserId: actor.id,
          status: "Requested"
        }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "interventionApproval.requested",
        entityType: "InterventionApproval",
        entityId: approval.id,
        after: approval
      });
      return approval;
    });
  },

  async decideInterventionApproval(actor: ActorContext, approvalId: string, status: ApprovalStatus, rationale?: string | null) {
    assertCan(actor, "intervention:approve");
    return prisma.$transaction(async (tx) => {
      const before = await tx.interventionApproval.findUniqueOrThrow({ where: { id: approvalId } });
      const decision = canTransitionApproval({ currentStatus: before.status, nextStatus: status });
      if (!decision.allowed) {
        throw new AppError("CONFLICT", decision.reason ?? "Approval cannot be transitioned.", { approvalId, status });
      }
      const approval = await tx.interventionApproval.update({
        where: { id: approvalId },
        data: {
          status,
          rationale,
          reviewedByUserId: actor.id,
          reviewedAt: new Date()
        }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: `interventionApproval.${status.toLowerCase()}`,
        entityType: "InterventionApproval",
        entityId: approval.id,
        before,
        after: approval
      });
      return approval;
    });
  }
};
