import { prisma } from "@agentic-edu/db";
import type { InterventionPlanInput, SupportNoteInput } from "@agentic-edu/domain";
import { assertCan, type ActorContext } from "../context";
import { createAuditEvent } from "../audit";
import { withServiceLogging } from "../logging";

export const supportService = withServiceLogging("support-service", {
  async createSupportNote(actor: ActorContext, input: SupportNoteInput) {
    assertCan(actor, "supportNote:create", { studentId: input.studentId });
    return prisma.$transaction(async (tx) => {
      const note = await tx.supportNote.create({ data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "supportNote.created",
        entityType: "SupportNote",
        entityId: note.id,
        after: note
      });
      return note;
    });
  },

  async createInterventionPlan(actor: ActorContext, input: InterventionPlanInput) {
    assertCan(actor, "intervention:create", { studentId: input.studentId });
    return prisma.$transaction(async (tx) => {
      const plan = await tx.interventionPlan.create({ data: input });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "intervention.created",
        entityType: "InterventionPlan",
        entityId: plan.id,
        after: plan
      });
      return plan;
    });
  },

  async updateInterventionStatus(actor: ActorContext, id: string, status: InterventionPlanInput["status"]) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.interventionPlan.findUniqueOrThrow({ where: { id } });
      assertCan(actor, "intervention:update", { studentId: before.studentId });
      const plan = await tx.interventionPlan.update({ where: { id }, data: { status } });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "intervention.updated",
        entityType: "InterventionPlan",
        entityId: id,
        before,
        after: plan
      });
      return plan;
    });
  }
});
