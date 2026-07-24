import { actionFailure, actionSuccess, type ActionResult } from "@agentic-edu/application";

/**
 * The state shape every Server Action in this app returns.
 *
 * `null` is the initial state before a form has been submitted — useActionState
 * needs something to start from, and "no result yet" is genuinely different
 * from "succeeded with no data".
 */
export type FormState<T = unknown> = ActionResult<T> | null;

/**
 * Runs the body of a Server Action and converts anything it throws into a
 * result the form can render.
 *
 * Without this, a thrown AppError becomes a full-page Next.js error screen. The
 * user loses the form they had filled in and gets no idea what was wrong. The
 * ActionResult primitives already existed in packages/application for exactly
 * this purpose; nothing had ever called them.
 *
 * Note the deliberate asymmetry: framework control-flow signals are re-thrown,
 * everything else is captured. See isFrameworkControlFlow below.
 */
export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return actionSuccess(await fn());
  } catch (error) {
    if (isFrameworkControlFlow(error)) {
      throw error;
    }
    return actionFailure(error);
  }
}

/**
 * `redirect()` and `notFound()` do their work by *throwing*. That is not a
 * quirk to work around — it is how they unwind out of deeply nested render
 * code without every caller having to check a return value.
 *
 * The consequence for us: a `catch` block that swallows everything also
 * swallows navigation. The redirect silently becomes a no-op and the user sits
 * on the same page wondering why the button did nothing. This is the single
 * most common bug introduced when adding error handling to Server Actions, and
 * it is invisible in unit tests because it only manifests in a real request.
 *
 * Next marks these errors with a `digest` string, which is the documented way
 * to recognise them without importing from `next/dist/**` internals.
 *
 * In this codebase the actions call `redirect()` *after* runAction returns, so
 * this guard should never actually fire. It stays because the next person to
 * add an action will not know that convention, and a wrong guess here fails
 * silently rather than loudly.
 */
function isFrameworkControlFlow(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND";
}
