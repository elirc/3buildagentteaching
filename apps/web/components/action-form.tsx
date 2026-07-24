"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";
import type { FormState } from "@/lib/action-result";

export type FormAction = (previousState: FormState, formData: FormData) => Promise<FormState>;

/**
 * A <form> that shows what went wrong instead of throwing the page away.
 *
 * Every mutating form in the app goes through this. It is a client component
 * because useActionState needs to hold the result of the last submission
 * across a re-render, and hooks do not exist on the server.
 *
 * The children stay server-rendered: they are passed in as a prop, so React
 * renders them on the server and this component only wraps them. That is the
 * point of the children-as-props pattern — the "use client" boundary stops
 * here rather than spreading to every field and label inside the form.
 */
export function ActionForm({
  action,
  children,
  className,
  errorPlacement = "top"
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  /**
   * Long forms want the error next to the submit button at the bottom, where
   * the user is looking when they press it. Short ones want it at the top.
   */
  errorPlacement?: "top" | "bottom";
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, null);
  const error = state && !state.ok ? state.error : undefined;
  const banner = error ? <FormError code={error.code} message={error.message} /> : null;

  return (
    <form action={formAction} className={className} noValidate>
      {errorPlacement === "top" ? banner : null}
      {children}
      {errorPlacement === "bottom" ? banner : null}
    </form>
  );
}

/**
 * `role="alert"` matters here. A sighted user sees the red box appear; a screen
 * reader user gets nothing at all unless the region announces itself, and a
 * form that silently fails for assistive tech is a broken form.
 */
export function FormError({ code, message }: { code: string; message: string }) {
  return (
    <p className="form-error" role="alert">
      <strong>{labelForCode(code)}</strong> {message}
    </p>
  );
}

function labelForCode(code: string): string {
  switch (code) {
    case "FORBIDDEN":
      return "Not allowed:";
    case "VALIDATION_ERROR":
      return "Check this:";
    case "CONFLICT":
      return "Cannot do that right now:";
    case "NOT_FOUND":
      return "Missing:";
    default:
      return "Error:";
  }
}

/**
 * Submit button that disables itself while the action is in flight.
 *
 * useFormStatus reads the state of the nearest enclosing <form>, which is why
 * this has to be a separate component rather than a branch inside ActionForm —
 * a component cannot read its own form's status.
 *
 * Without this, double-clicking "Enroll" fires the action twice. The second
 * call is usually rejected by a unique constraint, but "usually" is not a
 * concurrency strategy and the user still sees an error for something that
 * worked.
 */
export function SubmitButton({
  children,
  variant = "primary",
  pendingLabel = "Working…",
  disabled = false
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  pendingLabel?: string;
  /**
   * Caller-supplied disable, for actions that are meaningless in the current
   * state (marking an already-read notification as read). It is OR-ed with the
   * pending state rather than replacing it, so a caller passing `false` cannot
   * accidentally re-enable the button mid-submit.
   */
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      className={`ui-button ui-button--${variant}`}
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
