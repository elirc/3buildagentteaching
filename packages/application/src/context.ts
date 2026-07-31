import { canPerform, type PermissionAction, type PermissionActor, type PermissionResource } from "@agentic-edu/domain";
import { forbidden } from "./errors";

/**
 * The actor, plus the id that ties together everything done while serving one
 * request.
 *
 * `requestId` is deliberately *not* on `PermissionActor`. A request id has
 * nothing to say about whether someone may grade a submission, and putting it
 * in the domain's permission type would invite exactly that confusion. This is
 * the application layer's view of the same person: who they are, plus how to
 * find every log line they caused.
 */
export type ActorContext = PermissionActor & {
  requestId?: string;
};

export function assertCan(actor: ActorContext, action: PermissionAction, resource: PermissionResource = {}): void {
  if (!canPerform(actor, action, resource)) {
    throw forbidden(actor, action);
  }
}
