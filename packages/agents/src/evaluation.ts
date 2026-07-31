export type AssertionOperator = "equals" | "contains" | "lessThan" | "greaterThan" | "arrayIncludes" | "length";

export interface FixtureAssertion {
  path: string;
  op: AssertionOperator;
  value: unknown;
}

export interface AgentFixture {
  name: string;
  input: unknown;
  /** Human-readable expectations, stored on the evaluation row for context. */
  expected?: Record<string, unknown>;
  assertions: FixtureAssertion[];
}

export interface AssertionFailure {
  path: string;
  op: AssertionOperator;
  expected: unknown;
  actual: unknown;
  reason: string;
}

export interface FixtureEvaluation {
  passed: boolean;
  /** Fraction of assertions that held, 0..1. */
  score: number;
  failures: AssertionFailure[];
}

/**
 * Checks one agent's actual output against a fixture's assertions.
 *
 * Pure, and separate from the CLI that runs it, so the scoring rules can be
 * tested without executing an agent or touching a database.
 *
 * `score` is the fraction of assertions that held and `passed` requires all of
 * them. Those are deliberately different numbers: a fixture at 0.8 is a
 * regression worth looking at even though it is not a pass, and a harness that
 * only recorded pass/fail would lose the difference between "one assertion
 * drifted" and "the agent stopped working".
 */
export function evaluateFixture(fixture: AgentFixture, actual: unknown): FixtureEvaluation {
  const failures: AssertionFailure[] = [];

  for (const assertion of fixture.assertions) {
    const value = resolvePath(actual, assertion.path);
    const failure = checkAssertion(assertion, value);
    if (failure) failures.push(failure);
  }

  const total = fixture.assertions.length;
  return {
    // A fixture with no assertions scores 1 and passes. It asserts nothing, so
    // there is nothing for it to fail — but it is worth knowing that writing
    // one buys no coverage.
    score: total === 0 ? 1 : (total - failures.length) / total,
    passed: failures.length === 0,
    failures
  };
}

function checkAssertion(assertion: FixtureAssertion, actual: unknown): AssertionFailure | null {
  const fail = (reason: string): AssertionFailure => ({
    path: assertion.path,
    op: assertion.op,
    expected: assertion.value,
    actual,
    reason
  });

  switch (assertion.op) {
    case "equals":
      // Deep equality via JSON, so an assertion can target an object or array
      // without every fixture having to flatten it by hand.
      return jsonEqual(actual, assertion.value) ? null : fail("values differ");

    case "contains": {
      if (typeof actual !== "string") return fail("value is not a string");
      return actual.includes(String(assertion.value)) ? null : fail("substring not found");
    }

    case "lessThan": {
      if (typeof actual !== "number") return fail("value is not a number");
      return actual < Number(assertion.value) ? null : fail("value is not less than expected");
    }

    case "greaterThan": {
      if (typeof actual !== "number") return fail("value is not a number");
      return actual > Number(assertion.value) ? null : fail("value is not greater than expected");
    }

    case "arrayIncludes": {
      if (!Array.isArray(actual)) return fail("value is not an array");
      return actual.some((entry) => jsonEqual(entry, assertion.value)) ? null : fail("array does not include expected");
    }

    case "length": {
      const length = Array.isArray(actual) ? actual.length : typeof actual === "string" ? actual.length : null;
      if (length === null) return fail("value has no length");
      return length === Number(assertion.value) ? null : fail(`length ${length} != ${assertion.value}`);
    }

    default: {
      /*
       * Exhaustiveness check. Adding an operator to the union without a case
       * here fails to compile, rather than silently reporting every assertion
       * using it as passing — which is the direction this would fail if the
       * default returned null.
       */
      const exhaustive: never = assertion.op;
      return fail(`unknown operator ${String(exhaustive)}`);
    }
  }
}

/**
 * Resolves a dotted path, with `[n]` for array indices.
 *
 * Returns undefined for anything missing rather than throwing, so a fixture
 * asserting on a field the agent stopped producing reports as a failed
 * assertion — which is the correct outcome — instead of crashing the run and
 * taking every other fixture's result with it.
 */
export function resolvePath(value: unknown, path: string): unknown {
  const segments = path
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter((segment) => segment.length > 0);

  let current = value;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (Array.isArray(current)) {
      const index = Number.parseInt(segment, 10);
      if (!Number.isFinite(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
