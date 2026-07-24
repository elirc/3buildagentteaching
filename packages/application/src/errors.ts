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

/**
 * Turns anything thrown below the action boundary into a result the UI can
 * render.
 *
 * The rule this enforces: `AppError.userMessage` is written to be read by a
 * user, so it is passed through verbatim. Everything else is replaced with a
 * generic message. `AppError.metadata` is *never* returned — it carries actor
 * ids, entity ids and raw input for the logs, and none of that belongs in a
 * form error.
 */
export function actionFailure(error: unknown): ActionResult<never> {
  if (error instanceof AppError) {
    return { ok: false, error: { code: error.code, message: error.userMessage } };
  }

  const zodMessage = firstZodIssueMessage(error);
  if (zodMessage) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: zodMessage } };
  }

  return { ok: false, error: { code: "INTERNAL_ERROR", message: "Something went wrong while processing the request." } };
}

/**
 * Extracts the first human-readable issue from a ZodError.
 *
 * Detected structurally (`name === "ZodError"` plus an issues array) rather than
 * with `instanceof z.ZodError`. Two reasons: this package does not depend on
 * zod, and `instanceof` across duplicate copies of a library in a monorepo is a
 * classic source of "why is my catch block not catching" bugs. Structural
 * detection has neither problem.
 *
 * Only the first issue is surfaced. Showing a user six simultaneous complaints
 * about one form is worse than showing them the one to fix first.
 */
function firstZodIssueMessage(error: unknown): string | null {
  if (typeof error !== "object" || error === null) return null;
  const candidate = error as { name?: unknown; issues?: unknown };
  if (candidate.name !== "ZodError" || !Array.isArray(candidate.issues)) return null;

  const issue = candidate.issues[0] as { message?: unknown; path?: unknown } | undefined;
  if (!issue || typeof issue.message !== "string") return null;

  const field = Array.isArray(issue.path) && issue.path.length > 0 ? String(issue.path[0]) : null;
  return field ? `${field}: ${issue.message}` : issue.message;
}

export function forbidden(actor: PermissionActor, action: PermissionAction): AppError {
  return new AppError("FORBIDDEN", explainPermission(action), { actorId: actor.id, role: actor.role, action });
}
