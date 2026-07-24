import { explainPermission, type PermissionAction, type PermissionActor } from "@agentic-edu/domain";

export type AppErrorCode = "FORBIDDEN" | "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT" | "INTERNAL_ERROR";

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly userMessage: string;
  readonly metadata: Record<string, unknown>;

  constructor(code: AppErrorCode, userMessage: string, metadata: Record<string, unknown> = {}) {
    super(userMessage);
    this.name = "AppError";
    this.code = code;
    this.userMessage = userMessage;
    this.metadata = metadata;
  }
}

export interface ActionResult<T> {
  ok: boolean;
  data?: T;
  error?: {
    code: AppErrorCode;
    message: string;
  };
}

export function actionSuccess<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function actionFailure(error: unknown): ActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.userMessage } };
  }
  return { ok: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong while processing the request." } };
}

export function forbidden(actor: PermissionActor, action: PermissionAction): AppError {
  return new AppError("FORBIDDEN", explainPermission(action), { actorId: actor.id, role: actor.role, action });
}
