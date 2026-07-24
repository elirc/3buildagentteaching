import { prisma } from "@agentic-edu/db";
import { decideEnrollment } from "@agentic-edu/domain";
import { AppError } from "../errors";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent } from "../audit";

export const enrollmentService = {
  async enrollStudent(
    actor: ActorContext,
    input: {
      studentId: string;
      classSectionId: string;
      allowWaitlist: boolean;
    }
  ) {
    assertCan(actor, "enrollment:manage", { studentId: input.studentId });

    return prisma.$transaction(async (tx) => {
      const [student, section, existing] = await Promise.all([
        tx.student.findUniqueOrThrow({ where: { id: input.studentId } }),
        tx.classSection.findUniqueOrThrow({
          where: { id: input.classSectionId },
          include: { teacher: true, enrollments: true }
        }),
        tx.enrollment.findUnique({
          where: {
            studentId_classSectionId: {
              studentId: input.studentId,
              classSectionId: input.classSectionId
            }
          }
        })
      ]);

      const activeEnrollmentCount = section.enrollments.filter((enrollment) => enrollment.status === "Enrolled").length;
      const decision = decideEnrollment({
        studentStatus: student.enrollmentStatus,
        sectionStatus: section.status,
        teacherStatus: section.teacher.employmentStatus,
        activeEnrollmentCount,
        sectionCapacity: section.capacity,
        hasExistingActiveEnrollment: existing?.status === "Enrolled" || existing?.status === "Waitlisted",
        allowWaitlist: input.allowWaitlist
      });

      if (!decision.allowed || !decision.status) {
        throw new AppError("CONFLICT", decision.reason ?? "Enrollment is not allowed.", input);
      }

      const enrollment = existing
        ? await tx.enrollment.update({
            where: { id: existing.id },
            data: { status: decision.status, enrolledAt: new Date(), droppedAt: null }
          })
        : await tx.enrollment.create({
            data: {
              studentId: input.studentId,
              classSectionId: input.classSectionId,
              status: decision.status
            }
          });

      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "enrollment.created",
        entityType: "Enrollment",
        entityId: enrollment.id,
        before: existing,
        after: enrollment
      });

      return enrollment;
    });
  },

  async dropEnrollment(actor: ActorContext, id: string) {
    assertCan(actor, "enrollment:manage");
    return prisma.$transaction(async (tx) => {
      const before = await tx.enrollment.findUniqueOrThrow({ where: { id } });
      const enrollment = await tx.enrollment.update({
        where: { id },
        data: { status: "Dropped", droppedAt: new Date() }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "enrollment.dropped",
        entityType: "Enrollment",
        entityId: id,
        before,
        after: enrollment
      });
      return enrollment;
    });
  }
};
