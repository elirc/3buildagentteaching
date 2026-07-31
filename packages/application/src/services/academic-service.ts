import { Prisma, prisma } from "@agentic-edu/db";
import type { ClassSectionInput, CourseInput } from "@agentic-edu/domain";
import { AppError } from "../errors";
import { assertCan, type ActorContext } from "../context";
import { canReduceCapacity } from "@agentic-edu/domain";
import { createAuditEvent } from "../audit";
import { withServiceLogging } from "../logging";

export const academicService = withServiceLogging("academic-service", {
  async createCourse(actor: ActorContext, input: CourseInput) {
    assertCan(actor, "course:create");
    return prisma.$transaction(async (tx) => {
      const course = await tx.course.create({ data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "course.created",
        entityType: "Course",
        entityId: course.id,
        after: course
      });
      return course;
    });
  },

  async updateCourse(actor: ActorContext, id: string, input: CourseInput) {
    assertCan(actor, "course:update");
    return prisma.$transaction(async (tx) => {
      const before = await tx.course.findUniqueOrThrow({ where: { id } });
      const course = await tx.course.update({ where: { id }, data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "course.updated",
        entityType: "Course",
        entityId: course.id,
        before,
        after: course
      });
      return course;
    });
  },

  async createSection(actor: ActorContext, input: ClassSectionInput) {
    assertCan(actor, "section:create", { teacherId: input.teacherId });
    return prisma.$transaction(async (tx) => {
      const teacher = await tx.teacher.findUniqueOrThrow({ where: { id: input.teacherId } });
      if (teacher.employmentStatus !== "Active") {
        throw new AppError("CONFLICT", "Inactive or on-leave teachers cannot be assigned to new class sections.", {
          teacherId: teacher.id,
          employmentStatus: teacher.employmentStatus
        });
      }
      const section = await tx.classSection.create({ data: { ...input, schedule: input.schedule as Prisma.InputJsonValue } });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "classSection.created",
        entityType: "ClassSection",
        entityId: section.id,
        after: section
      });
      return section;
    });
  },

  async updateSection(actor: ActorContext, id: string, input: ClassSectionInput) {
    assertCan(actor, "section:update", { teacherId: input.teacherId });
    return prisma.$transaction(async (tx) => {
      const before = await tx.classSection.findUniqueOrThrow({
        where: { id },
        include: { enrollments: { where: { status: "Enrolled" } } }
      });

      // Lowering capacity below the seated count leaves the section permanently
      // over-subscribed: every later enrollment check refuses and nothing says
      // why. Refuse the edit and name the number instead.
      const capacityDecision = canReduceCapacity({
        newCapacity: input.capacity,
        activeEnrollmentCount: before.enrollments.length
      });
      if (!capacityDecision.allowed) {
        throw new AppError("VALIDATION_ERROR", capacityDecision.reason ?? "Capacity is invalid.", {
          classSectionId: id
        });
      }

      const section = await tx.classSection.update({
        where: { id },
        data: { ...input, schedule: input.schedule as Prisma.InputJsonValue }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "classSection.updated",
        entityType: "ClassSection",
        entityId: section.id,
        before,
        after: section
      });
      return section;
    });
  }
});
