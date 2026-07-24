import { describe, expect, it } from "vitest";
import { actionFailure, actionSuccess, AppError } from "./errors";

describe("application action results", () => {
  it("wraps successful data in a typed action result", () => {
    expect(actionSuccess({ id: "student_maya" })).toEqual({ ok: true, data: { id: "student_maya" } });
  });

  it("converts application errors to user-safe action failures", () => {
    const result = actionFailure(new AppError("FORBIDDEN", "You cannot do that.", { secret: "internal" }));

    expect(result).toEqual({
      ok: false,
      error: {
        code: "FORBIDDEN",
        message: "You cannot do that."
      }
    });
  });

  it("never leaks AppError metadata to the caller", () => {
    // metadata carries actor ids, entity ids and raw input for the logs. It is
    // the single most likely thing to get accidentally rendered into a form.
    const result = actionFailure(
      new AppError("FORBIDDEN", "You cannot do that.", { actorId: "user_admin", internalToken: "s3cret" })
    );

    expect(JSON.stringify(result)).not.toContain("s3cret");
    expect(JSON.stringify(result)).not.toContain("user_admin");
    expect(Object.keys(result.error ?? {})).toEqual(["code", "message"]);
  });

  it("maps a ZodError to a validation failure naming the offending field", () => {
    // Shaped like a real ZodError. Detected structurally rather than with
    // instanceof, so this fixture is a faithful stand-in.
    const zodError = Object.assign(new Error("Invalid input"), {
      name: "ZodError",
      issues: [
        { message: "Invalid email", path: ["email"] },
        { message: "Expected number", path: ["gradeLevel"] }
      ]
    });

    expect(actionFailure(zodError)).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "email: Invalid email" }
    });
  });

  it("hides the detail of errors it does not recognise", () => {
    const result = actionFailure(new Error("connect ECONNREFUSED 127.0.0.1:5432"));

    expect(result.error?.code).toBe("INTERNAL_ERROR");
    expect(result.error?.message).not.toContain("ECONNREFUSED");
  });
});
