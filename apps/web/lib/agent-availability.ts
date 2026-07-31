import { cache } from "react";
import { prisma } from "@agentic-edu/db";
import { selectActiveVersion } from "@agentic-edu/domain";
import type { AgentType } from "@agentic-edu/shared";

/**
 * Which agents currently have an active manifest.
 *
 * The UI counterpart to the manifest gate. `persistAgentRun` refuses an agent
 * with no active manifest; without this, the button would still be offered and
 * the click would fail — the exact "field of tripwires" US-02 set out to
 * remove.
 *
 * As always, this is cosmetic. Hiding a button is not authorization and the
 * gate in the service is what actually refuses. What this buys is that an
 * operator who deactivates an agent on /agent-ops sees it disappear from the
 * pages that offer it, rather than discovering the change through an error
 * message on someone else's screen.
 *
 * `cache` because several agent panels can render on one page and each would
 * otherwise issue the same query.
 */
export const getRunnableAgents = cache(async function getRunnableAgents(): Promise<Set<AgentType>> {
  const manifests = await prisma.agentManifest.findMany({
    select: { agentType: true, version: true, isActive: true }
  });

  const byType = new Map<AgentType, Array<{ version: string; isActive: boolean }>>();
  for (const manifest of manifests) {
    const bucket = byType.get(manifest.agentType);
    if (bucket) bucket.push(manifest);
    else byType.set(manifest.agentType, [manifest]);
  }

  const runnable = new Set<AgentType>();
  for (const [agentType, versions] of byType) {
    // selectActiveVersion rather than `.some(m => m.isActive)` so this agrees
    // with the gate exactly, including on the versions it would choose.
    if (selectActiveVersion(versions)) runnable.add(agentType);
  }
  return runnable;
});
