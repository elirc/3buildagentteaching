import { prisma } from "@agentic-edu/db";
import type { AttendanceInput } from "@agentic-edu/domain";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent } from "../audit";

export const attendanceService = {
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
