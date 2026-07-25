import { prisma } from "@agentic-edu/db";
import type { AttendanceInput } from "@agentic-edu/domain";
import { canRecordAttendance } from "@agentic-edu/domain";
import type { AttendanceStatus } from "@agentic-edu/shared";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent } from "../audit";
import { AppError } from "../errors";

export const attendanceService = {
  /**
   * Records attendance for a whole section on one date, in one transaction.
   *
   * The single-record form meant 28 separate submissions for a Biology class,
   * each its own transaction and its own chance to be half-finished. Here the
   * whole register either lands or does not.
   *
   * Every entry is validated against the section's actual roster before
   * anything is written, so a stale form cannot create attendance rows for a
   * student who has since dropped.
   */
  async recordSectionAttendance(
    actor: ActorContext,
    input: {
      classSectionId: string;
      date: Date;
      recordedByTeacherId: string;
      entries: Array<{ studentId: string; status: AttendanceStatus; notes?: string | null }>;
    }
  ) {
    assertCan(actor, "attendance:record", { teacherId: input.recordedByTeacherId });

    return prisma.$transaction(async (tx) => {
      const section = await tx.classSection.findUniqueOrThrow({
        where: { id: input.classSectionId },
        include: { academicTerm: true, enrollments: true }
      });

      const enrollmentByStudent = new Map(section.enrollments.map((e) => [e.studentId, e]));

      for (const entry of input.entries) {
        const decision = canRecordAttendance({
          // A student with no enrollment row at all is treated as Dropped
          // rather than crashing — same outcome, better message.
          enrollmentStatus: enrollmentByStudent.get(entry.studentId)?.status ?? "Dropped",
          sectionStatus: section.status,
          date: input.date,
          termRange: section.academicTerm
            ? { startsAt: section.academicTerm.startsAt, endsAt: section.academicTerm.endsAt }
            : null
        });
        if (!decision.allowed) {
          throw new AppError("VALIDATION_ERROR", decision.reason ?? "Attendance cannot be recorded.", {
            studentId: entry.studentId,
            classSectionId: input.classSectionId
          });
        }
      }

      const saved = [];
      for (const entry of input.entries) {
        // Upsert on the natural key, so re-submitting the same date corrects
        // the register rather than failing on the unique constraint. Taking
        // attendance twice is normal — someone arrives late.
        saved.push(
          await tx.attendanceRecord.upsert({
            where: {
              studentId_classSectionId_date: {
                studentId: entry.studentId,
                classSectionId: input.classSectionId,
                date: input.date
              }
            },
            create: {
              studentId: entry.studentId,
              classSectionId: input.classSectionId,
              academicTermId: section.academicTermId,
              date: input.date,
              status: entry.status,
              notes: entry.notes ?? null,
              recordedByTeacherId: input.recordedByTeacherId
            },
            update: { status: entry.status, notes: entry.notes ?? null, recordedByTeacherId: input.recordedByTeacherId }
          })
        );
      }

      // One audit event for the register, not 28. The unit of intent here is
      // "took attendance for this class on this day"; 28 rows would bury that
      // in noise and make the audit log unreadable at term scale.
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "attendance.sectionRecorded",
        entityType: "ClassSection",
        entityId: input.classSectionId,
        after: {
          date: input.date,
          entries: saved.map((record) => ({ studentId: record.studentId, status: record.status }))
        },
        metadata: { recordCount: saved.length, recordedByTeacherId: input.recordedByTeacherId }
      });

      return saved;
    });
  },

  async recordAttendance(actor: ActorContext, input: AttendanceInput) {
    assertCan(actor, "attendance:record", { teacherId: input.recordedByTeacherId, studentId: input.studentId });
    return prisma.$transaction(async (tx) => {
      const existing = await tx.attendanceRecord.findUnique({
        where: {
          studentId_classSectionId_date: {
            studentId: input.studentId,
            classSectionId: input.classSectionId,
            date: input.date
          }
        }
      });
      const attendance = existing
        ? await tx.attendanceRecord.update({ where: { id: existing.id }, data: input })
        : await tx.attendanceRecord.create({ data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: existing ? "attendance.updated" : "attendance.recorded",
        entityType: "AttendanceRecord",
        entityId: attendance.id,
        before: existing,
        after: attendance
      });
      return attendance;
    });
  }
};
