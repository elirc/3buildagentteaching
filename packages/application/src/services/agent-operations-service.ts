import { Prisma, prisma } from "@agentic-edu/db";
import type { AgentRecommendationStatus, AgentType } from "@agentic-edu/shared";
import { createAuditEvent } from "../audit";
import { assertCan, type ActorContext } from "../context";
import { AppError } from "../errors";

export interface AgentManifestInput {
  agentType: AgentType;
  version: string;
  name: string;
  description: string;
  supportedTargets: string[];
  requiredPermissions: string[];
  inputSchema: Prisma.InputJsonValue;
  outputSchema: Prisma.InputJsonValue;
  isActive?: boolean;
}

export const agentOperationsService = {
  async upsertManifest(actor: ActorContext, input: AgentManifestInput) {
    assertCan(actor, "agentManifest:manage");
    return prisma.$transaction(async (tx) => {
      const manifest = await tx.agentManifest.upsert({
        where: { agentType_version: { agentType: input.agentType, version: input.version } },
        create: {
          ...input,
          isActive: input.isActive ?? true
        },
        update: {
          name: input.name,
          description: input.description,
          supportedTargets: input.supportedTargets,
          requiredPermissions: input.requiredPermissions,
          inputSchema: input.inputSchema,
          outputSchema: input.outputSchema,
          isActive: input.isActive ?? true
        }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: "agentManifest.upserted",
        entityType: "AgentManifest",
        entityId: manifest.id,
        after: manifest
      });
      return manifest;
    });
  },

  async decideRecommendation(
    actor: ActorContext,
    recommendationId: string,
    status: Exclude<AgentRecommendationStatus, "Proposed">,
    rationale?: string | null
  ) {
    assertCan(actor, "agentRecommendation:decide");
    return prisma.$transaction(async (tx) => {
      const before = await tx.agentRecommendation.findUniqueOrThrow({ where: { id: recommendationId } });
      if (before.status !== "Proposed" && status !== "Completed") {
        throw new AppError("CONFLICT", "Only proposed recommendations can be approved or rejected.", {
          recommendationId,
          status: before.status
        });
      }
      if (status === "Completed" && before.status !== "Approved") {
        throw new AppError("CONFLICT", "Only approved recommendations can be completed.", {
          recommendationId,
          status: before.status
        });
      }
      const recommendation = await tx.agentRecommendation.update({
        where: { id: recommendationId },
        data: {
          status,
          // Preserve the existing rationale when none is supplied. Passing the
          // raw value would null out the agent's own explanation the moment
          // someone approved without typing one — losing the reason the
          // recommendation existed at the exact moment it was acted on.
          rationale: rationale ?? before.rationale,
          approvedByUserId: status === "Approved" || status === "Completed" ? actor.id : before.approvedByUserId,
          decidedAt: new Date()
        }
      });
      await createAuditEvent(tx, {
        actorUserId: actor.id,
        action: `agentRecommendation.${status.toLowerCase()}`,
        entityType: "AgentRecommendation",
        entityId: recommendation.id,
        before,
        after: recommendation
      });
      return recommendation;
    });
  }
};
