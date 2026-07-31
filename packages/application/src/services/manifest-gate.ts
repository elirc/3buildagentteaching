import { prisma } from "@agentic-edu/db";
import { selectActiveVersion, type PermissionAction } from "@agentic-edu/domain";
import type { AgentTargetType, AgentType } from "@agentic-edu/shared";
import { assertCan, type ActorContext } from "../context";
import { AppError } from "../errors";

export interface ResolvedManifest {
  id: string;
  version: string;
  inputSchemaVersion: string;
  outputSchemaVersion: string;
}

/**
 * The gate every agent run passes through.
 *
 * Before this, `AgentManifest` was a table `/agent-ops` rendered and nothing
 * read. `isActive: false` changed nothing, `requiredPermissions` was decoration,
 * and `persistAgentRun` hardcoded `agentVersion: "1.0.0"` — so the runs table
 * claimed a version the registry had never heard of.
 *
 * Three checks, in a deliberate order:
 *
 * 1. **Is there an active manifest?** No → CONFLICT, and crucially *no AgentRun
 *    row*. A disabled agent should leave no trace of having been attempted,
 *    because a Failed run in the table means "it ran and broke", which is a
 *    different and more alarming claim than "it is switched off".
 *
 * 2. **Does the actor hold the manifest's requiredPermissions?** These are
 *    checked *in addition to* `agent:run`, not instead of it. The seeded
 *    GuardianCommunicationDraft manifest requires `notification:manage`, so a
 *    Teacher can no longer draft messages to families — which is the intended
 *    behaviour, and is now expressed in data rather than in code.
 *
 * 3. **Does the target type match supportedTargets?** A mismatch names both, so
 *    the message says what was asked for and what the agent accepts.
 *
 * Unknown permission strings in a manifest are a configuration error and are
 * refused rather than ignored. Ignoring them would mean a typo silently removes
 * a permission requirement — the failure mode where security controls quietly
 * stop applying.
 */
export async function resolveManifest(input: {
  actor: ActorContext;
  agentType: AgentType;
  targetType: AgentTargetType;
  knownPermissions: readonly string[];
}): Promise<ResolvedManifest> {
  const manifests = await prisma.agentManifest.findMany({ where: { agentType: input.agentType } });
  const manifest = selectActiveVersion(manifests);

  if (!manifest) {
    throw new AppError("CONFLICT", `Agent ${input.agentType} has no active manifest.`, {
      agentType: input.agentType,
      manifestCount: manifests.length
    });
  }

  for (const permission of manifest.requiredPermissions) {
    if (!input.knownPermissions.includes(permission)) {
      throw new AppError(
        "CONFLICT",
        `Manifest for ${input.agentType} requires unknown permission "${permission}".`,
        { agentType: input.agentType, permission }
      );
    }
    assertCan(input.actor, permission as PermissionAction);
  }

  if (!manifest.supportedTargets.includes(input.targetType)) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Agent ${input.agentType} does not support ${input.targetType} targets (it supports ${manifest.supportedTargets.join(", ")}).`,
      { agentType: input.agentType, targetType: input.targetType, supportedTargets: manifest.supportedTargets }
    );
  }

  const schemaVersion = (schema: unknown): string => {
    if (typeof schema === "object" && schema !== null) {
      const version = (schema as { version?: unknown }).version;
      if (typeof version === "string") return version;
    }
    // The manifest's own version is a better default than a hardcoded "1.0.0":
    // it is at least true that this run used that manifest.
    return manifest.version;
  };

  return {
    id: manifest.id,
    version: manifest.version,
    inputSchemaVersion: schemaVersion(manifest.inputSchema),
    outputSchemaVersion: schemaVersion(manifest.outputSchema)
  };
}
