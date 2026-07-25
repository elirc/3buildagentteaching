import { Prisma, prisma } from "@agentic-edu/db";
import { routeNotificationRecipients } from "@agentic-edu/domain";
import type { NotificationChannel, NotificationType } from "@agentic-edu/shared";
import { createAuditEvent, type PrismaTransaction } from "../audit";
import type { ActorContext } from "../context";
import { jobService } from "./job-service";

export interface NotifyInput {
  type: NotificationType;
  title: string;
  body: string;
  channel?: NotificationChannel;
  studentId?: string | null;
  ownerRole?: string | null;
  /** Users to consider. routeNotificationRecipients decides which actually get it. */
  candidates: Array<{ userId: string; role: Parameters<typeof routeNotificationRecipients>[1][number]["role"] }>;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Creates notifications from an event and queues their delivery.
 *
 * Separate from academicOperationsService.createNotification, which is the
 * manual "an admin composes a message" path and requires notification:manage.
 * This is the automatic path: the system noticed something and is telling the
 * people who should know.
 *
 * It takes no permission check on purpose. The *event* was authorized — grading
 * a submission, dead-lettering a job — and the notification is a consequence of
 * it, not a separate action a user requested. Requiring notification:manage here
 * would mean a teacher could grade work but not tell the student about it.
 */
export const notifyService = {
  async notify(actor: ActorContext, input: NotifyInput, tx: PrismaTransaction) {
    const recipients = routeNotificationRecipients(input.type, input.candidates, { ownerRole: input.ownerRole });
    if (recipients.length === 0) return [];

    const channel = input.channel ?? "InApp";
    const created = [];

    for (const userId of recipients) {
      const notification = await tx.notification.create({
        data: {
          userId,
          studentId: input.studentId ?? null,
          type: input.type,
          channel,
          status: "Queued",
          title: input.title,
          body: input.body,
          metadata: input.metadata ?? {}
        }
      });
      created.push(notification);

      /*
       * Digest-channel notifications are NOT queued for individual delivery.
       * They exist to be batched into a periodic digest, and sending one email
       * per digest-channel notification is precisely the behaviour a digest is
       * meant to replace.
       */
      if (channel !== "Digest") {
        await jobService.enqueue(
          actor,
          {
            type: "EmailNotification",
            payload: { notificationId: notification.id, recipient: `${userId}@northstar.example` },
            idempotencyKey: `email:${notification.id}`,
            relatedStudentId: input.studentId ?? null
          },
          tx
        );
      }
    }

    await createAuditEvent(tx, {
      actorUserId: actor.id,
      action: "notification.dispatched",
      entityType: "Notification",
      // The batch is the unit of intent; per-recipient rows are in `after`.
      entityId: created[0]?.id ?? "none",
      after: { type: input.type, recipients, title: input.title },
      metadata: { recipientCount: recipients.length }
    });

    return created;
  },

  /** Staff who might receive an operational notification. */
  async staffCandidates(tx: PrismaTransaction) {
    const users = await tx.user.findMany({
      where: { role: { in: ["Admin", "SchoolManager", "Advisor", "Teacher"] } },
      select: { id: true, role: true }
    });
    return users.map((user) => ({ userId: user.id, role: user.role }));
  },

  /** A student's own user plus their linked guardians. */
  async familyCandidates(tx: PrismaTransaction, studentId: string) {
    const [student, links] = await Promise.all([
      tx.student.findUnique({ where: { id: studentId }, select: { userId: true } }),
      tx.studentGuardian.findMany({
        where: { studentId },
        include: { guardian: { select: { userId: true } } }
      })
    ]);

    const candidates: Array<{ userId: string; role: "Student" | "Guardian" }> = [];
    if (student?.userId) candidates.push({ userId: student.userId, role: "Student" });
    for (const link of links) {
      if (link.guardian.userId) candidates.push({ userId: link.guardian.userId, role: "Guardian" });
    }
    return candidates;
  }
};
