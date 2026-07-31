import { Prisma, prisma } from "@agentic-edu/db";
import {
  canTransitionApproval,
  decideGuardianUnlink,
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
import { createAuditEvent, type PrismaTransaction } from "../audit";
import { assertCan, type ActorContext } from "../context";
import { AppError } from "../errors";
import { withServiceLogging } from "../logging";
import { findOrCreateGuardian } from "./student-service";

/**
 * Enforces "exactly one primary guardian per student" by demoting the others.
 *
 * Postgres can express this as a partial unique index
 * (`WHERE "isPrimary"`), and Prisma's schema language cannot — it would need a
 * hand-written migration, and this repo uses `db push`. Enforcing it in the
 * service instead is the honest trade: it holds as long as every write goes
 * through these methods, which is the same assumption the rest of the
 * authorization model already makes.
 */
async function demoteOtherPrimaries(tx: PrismaTransaction, studentId: string, keepLinkId: string) {
  await tx.studentGuardian.updateMany({
    where: { studentId, isPrimary: true, id: { not: keepLinkId } },
    data: { isPrimary: false }
  });
}

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

export const academicOperationsService = withServiceLogging("academic-operations-service", {
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
      if (input.isPrimary) await demoteOtherPrimaries(tx, input.studentId, link.id);
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

  /**
   * Adds a guardian to a student from the student's own page, by email.
   *
   * Deliberately one action rather than the two-step "create the guardian on
   * /guardians, then come back and link it". Two steps is how a half-finished
   * guardian with no student ends up in the table, and the person filling this
   * in is thinking about one student, not about the guardian directory.
   */
  async addGuardianToStudent(
    actor: ActorContext,
    input: {
      studentId: string;
      name: string;
      email: string;
      relationship: GuardianRelationship;
      isPrimary: boolean;
      receivesDigest: boolean;
    }
  ) {
    assertCan(actor, "guardian:manage", { studentId: input.studentId });

    return prisma.$transaction(async (tx) => {
      const student = await tx.student.findUniqueOrThrow({ where: { id: input.studentId } });
      const guardian = await findOrCreateGuardian(tx, {
        email: input.email,
        name: input.name,
        fallbackLastName: student.lastName
      });

      const existing = await tx.studentGuardian.findUnique({
        where: { studentId_guardianId: { studentId: input.studentId, guardianId: guardian.id } }
      });
      if (existing) {
        throw new AppError("CONFLICT", `${guardian.firstName} ${guardian.lastName} is already linked to this student.`, {
          studentId: input.studentId,
          guardianId: guardian.id
        });
      }

      const link = await tx.studentGuardian.create({
        data: {
          studentId: input.studentId,
          guardianId: guardian.id,
          relationship: input.relationship,
          isPrimary: input.isPrimary,
          receivesDigest: input.receivesDigest,
          emergencyContact: false
        }
      });
      if (input.isPrimary) await demoteOtherPrimaries(tx, input.studentId, link.id);

      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "studentGuardian.linked",
        entityType: "StudentGuardian",
        entityId: link.id,
        after: { ...link, guardianEmail: guardian.email }
      });
      return link;
    });
  },

  /** Promotes one link to primary and demotes whichever one held it. */
  async setPrimaryGuardian(actor: ActorContext, linkId: string) {
    return prisma.$transaction(async (tx) => {
      const link = await tx.studentGuardian.findUniqueOrThrow({ where: { id: linkId } });
      assertCan(actor, "guardian:manage", { studentId: link.studentId });

      const updated = await tx.studentGuardian.update({ where: { id: linkId }, data: { isPrimary: true } });
      await demoteOtherPrimaries(tx, link.studentId, linkId);

      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "studentGuardian.primaryChanged",
        entityType: "StudentGuardian",
        entityId: linkId,
        before: link,
        after: updated
      });
      return updated;
    });
  },

  /**
   * Removes a guardian link, unless it is the last one.
   *
   * The count is taken inside the transaction rather than trusted from the page
   * that rendered the button. A roster page showing two guardians is stating
   * something that was true when it rendered; by the time both "Remove" buttons
   * have been clicked it is not.
   */
  async unlinkGuardianFromStudent(actor: ActorContext, linkId: string) {
    return prisma.$transaction(async (tx) => {
      const link = await tx.studentGuardian.findUniqueOrThrow({ where: { id: linkId } });
      assertCan(actor, "guardian:manage", { studentId: link.studentId });

      const linkCount = await tx.studentGuardian.count({ where: { studentId: link.studentId } });
      const decision = decideGuardianUnlink({ linkCount });
      if (!decision.allowed) {
        throw new AppError("CONFLICT", decision.reason ?? "This guardian cannot be removed.", {
          studentId: link.studentId,
          linkId
        });
      }

      await tx.studentGuardian.delete({ where: { id: linkId } });

      /*
       * Removing the primary leaves the student with guardians but no primary,
       * and buildGuardianCommunicationDraftInput now refuses to draft without
       * one. Promoting the oldest remaining link keeps the invariant rather
       * than leaving a hole for someone to discover when an agent fails.
       */
      if (link.isPrimary) {
        const next = await tx.studentGuardian.findFirst({
          where: { studentId: link.studentId },
          orderBy: { createdAt: "asc" }
        });
        if (next) await tx.studentGuardian.update({ where: { id: next.id }, data: { isPrimary: true } });
      }

      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "studentGuardian.unlinked",
        entityType: "StudentGuardian",
        entityId: linkId,
        before: link
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
    // Read the recipient before deciding, because "may I mark this read" cannot
    // be answered without knowing whose it is. Ownership wins: anyone may mark
    // their own. Only if it belongs to someone else is the broader
    // notification:manage required.
    const target = await prisma.notification.findUniqueOrThrow({ where: { id: notificationId } });
    if (target.userId === actor.id) {
      assertCan(actor, "notification:readOwn", { recipientUserId: target.userId });
    } else {
      assertCan(actor, "notification:manage");
    }

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

  /**
   * A guardian changing their own contact preferences.
   *
   * Only receivesDigest is writable here. isPrimary and emergencyContact are
   * staff-managed: a parent quietly making themselves the emergency contact, or
   * demoting the other parent, is a safeguarding problem rather than a
   * preference.
   */
  async updateGuardianPreferences(
    actor: ActorContext,
    input: { studentId: string; receivesDigest: boolean }
  ) {
    assertCan(actor, "guardian:updateOwnPreferences", { studentId: input.studentId });

    return prisma.$transaction(async (tx) => {
      const link = await tx.studentGuardian.findFirstOrThrow({
        where: { studentId: input.studentId, guardian: { userId: actor.id } }
      });
      const updated = await tx.studentGuardian.update({
        where: { id: link.id },
        data: { receivesDigest: input.receivesDigest }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "studentGuardian.preferencesUpdated",
        entityType: "StudentGuardian",
        entityId: link.id,
        before: link,
        after: updated
      });
      return updated;
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
});
