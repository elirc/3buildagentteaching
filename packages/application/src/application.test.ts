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
});
