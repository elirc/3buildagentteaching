import { canPerform, type PermissionAction, type PermissionResource } from "@agentic-edu/domain";
import type { ActorContext } from "@agentic-edu/application";
import { getCurrentActor } from "@/lib/current-user";

export interface ActorCapabilities {
  actor: ActorContext;
  /**
   * Answers the same question `assertCan` answers, without throwing.
   *
   * Pages use this to decide what to *show*. Services use `assertCan` to decide
   * what to *allow*. They call the same underlying `canPerform`, so the two can
   * never disagree about the rules — only about the consequence of breaking
   * them.
   */
  can: (action: PermissionAction, resource?: PermissionResource) => boolean;
}

/**
 * Resolves the acting user once and returns a capability checker bound to them.
 *
 * IMPORTANT: hiding a button is not authorization. Everything this enables is
 * cosmetic — it stops users being offered actions that will be refused. The
 * actual enforcement stays in the service layer, where `assertCan` throws, and
 * this PR does not remove a single one of those calls.
 *
 * If you ever find yourself deleting an `assertCan` because "the button is
 * hidden anyway", stop: the button is hidden in the HTML you rendered, not in
 * the POST body someone can craft by hand.
 */
export async function getActorCapabilities(): Promise<ActorCapabilities> {
  const actor = await getCurrentActor();
  return {
    actor,
    can: (action, resource = {}) => canPerform(actor, action, resource)
  };
}
