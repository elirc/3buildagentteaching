import { prisma } from "@agentic-edu/db";
import type { StudentInput } from "@agentic-edu/domain";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent } from "../audit";

export const studentService = {
  async createStudent(actor: ActorContext, input: StudentInput) {
    assertCan(actor, "student:create");
    return prisma.$transaction(async (tx) => {
      const student = await tx.student.create({ data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "student.created",
        entityType: "Student",
        entityId: student.id,
        after: student
      });
      return student;
    });
  },

  async updateStudent(actor: ActorContext, id: string, input: StudentInput) {
    assertCan(actor, "student:update", { studentId: id });
    return prisma.$transaction(async (tx) => {
      const before = await tx.student.findUniqueOrThrow({ where: { id } });
      const student = await tx.student.update({ where: { id }, data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "student.updated",
        entityType: "Student",
        entityId: student.id,
        before,
        after: student
      });
      return student;
    });
  }
};
