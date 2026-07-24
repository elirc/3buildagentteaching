import { canPerform, type PermissionAction, type PermissionActor, type PermissionResource } from "@agentic-edu/domain";
import { forbidden } from "./errors";

export type ActorContext = PermissionActor;

export function assertCan(actor: ActorContext, action: PermissionAction, resource: PermissionResource = {}): void {
  if (!canPerform(actor, action, resource)) {
    throw forbidden(actor, action);
  }
}
