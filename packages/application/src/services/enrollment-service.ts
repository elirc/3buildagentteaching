import { prisma } from "@agentic-edu/db";
import { decideEnrollment, decideWaitlistPromotion } from "@agentic-edu/domain";
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

  /**
   * Moves a waitlisted student into a seat.
   *
   * Capacity is re-counted inside the transaction rather than trusted from the
   * page that rendered the button. "1 seat open" was true when the roster was
   * drawn; by the time someone clicks Promote it may not be.
   */
  async promoteFromWaitlist(actor: ActorContext, enrollmentId: string) {
    assertCan(actor, "enrollment:promote");

    return prisma.$transaction(async (tx) => {
      const enrollment = await tx.enrollment.findUniqueOrThrow({
        where: { id: enrollmentId },
        include: { student: true, classSection: { include: { teacher: true, enrollments: true } } }
      });

      const decision = decideWaitlistPromotion({
        studentStatus: enrollment.student.enrollmentStatus,
        sectionStatus: enrollment.classSection.status,
        teacherStatus: enrollment.classSection.teacher.employmentStatus,
        enrollmentStatus: enrollment.status,
        activeEnrollmentCount: enrollment.classSection.enrollments.filter((e) => e.status === "Enrolled").length,
        sectionCapacity: enrollment.classSection.capacity
      });
      if (!decision.allowed || !decision.status) {
        throw new AppError("CONFLICT", decision.reason ?? "Promotion is not allowed.", { enrollmentId });
      }

      const promoted = await tx.enrollment.update({
        where: { id: enrollmentId },
        data: { status: decision.status, enrolledAt: new Date(), droppedAt: null }
      });

      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "enrollment.promoted",
        entityType: "Enrollment",
        entityId: enrollmentId,
        before: enrollment,
        after: promoted
      });

      return promoted;
    });
  },

  /**
   * Enrols several students, deciding each one independently.
   *
   * Deliberately NOT all-or-nothing. Selecting twelve students where one has
   * withdrawn should enrol eleven and tell you about the twelfth — failing the
   * whole batch would make the operator re-select eleven names to work around
   * one bad row, and they would quickly stop using the bulk form at all.
   *
   * Each enrollment is its own transaction so one failure cannot roll back the
   * others. The trade-off: there is no single atomic "batch" to undo. That is
   * the right way round here, because the batch is a UI convenience rather
   * than a business transaction — nothing depends on all twelve landing
   * together.
   */
  async bulkEnroll(
    actor: ActorContext,
    input: { classSectionId: string; studentIds: string[]; allowWaitlist: boolean }
  ) {
    assertCan(actor, "enrollment:manage");

    const results: Array<{ studentId: string; ok: boolean; status?: string; reason?: string }> = [];

    for (const studentId of input.studentIds) {
      try {
        const enrollment = await this.enrollStudent(actor, {
          studentId,
          classSectionId: input.classSectionId,
          allowWaitlist: input.allowWaitlist
        });
        results.push({ studentId, ok: true, status: enrollment.status });
      } catch (error) {
        results.push({
          studentId,
          ok: false,
          reason: error instanceof AppError ? error.userMessage : "Could not enrol this student."
        });
      }
    }

    return results;
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
