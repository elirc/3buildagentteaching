import { prisma } from "@agentic-edu/db";
import type { TeacherInput } from "@agentic-edu/domain";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent } from "../audit";

export const teacherService = {
  async createTeacher(actor: ActorContext, input: TeacherInput) {
    assertCan(actor, "teacher:create");
    return prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.create({ data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "teacher.created",
        entityType: "Teacher",
        entityId: teacher.id,
        after: teacher
      });
      return teacher;
    });
  },

  async updateTeacher(actor: ActorContext, id: string, input: TeacherInput) {
    assertCan(actor, "teacher:update", { teacherId: id });
    return prisma.$transaction(async (tx) => {
      const before = await tx.teacher.findUniqueOrThrow({ where: { id } });
      const teacher = await tx.teacher.update({ where: { id }, data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "teacher.updated",
        entityType: "Teacher",
        entityId: teacher.id,
        before,
        after: teacher
      });
      return teacher;
    });
  }
};
