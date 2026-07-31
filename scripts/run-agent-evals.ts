/**
 * Runs every fixture through its agent and records the result.
 *
 *   npm run agents:eval            run everything, write AgentEvaluation rows
 *   npm run agents:eval -- --dry   run everything, write nothing
 *
 * Exits non-zero when any fixture fails, so CI can gate on it.
 *
 * The split that matters: all the judgement lives in `evaluateFixture`, which
 * is pure and unit-tested. This file only does I/O — read the fixture
 * directory, call the agent, print a table, write rows. When the scoring rules
 * need to change, they change in one pure function rather than in a script
 * nobody can test without a database.
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { agentRegistry, evaluateFixture, executeAgent, type AgentFixture } from "@agentic-edu/agents";
import { selectActiveVersion } from "@agentic-edu/domain";
import type { AgentType } from "@agentic-edu/shared";

const FIXTURE_ROOT = resolve(process.cwd(), "packages/agents/fixtures");
const prisma = new PrismaClient();

interface EvalRow {
  agentType: AgentType;
  fixtureName: string;
  version: string;
  passed: boolean;
  score: number;
  expected: unknown;
  actual: unknown;
  failures: string[];
}

async function main() {
  const dryRun = process.argv.includes("--dry");
  const rows: EvalRow[] = [];

  for (const agentType of Object.keys(agentRegistry) as AgentType[]) {
    const directory = resolve(FIXTURE_ROOT, agentType);
    if (!existsSync(directory)) {
      // Loud, not silent: an agent with no fixtures is untested, and a harness
      // that quietly skips it reports a perfect pass rate for no coverage.
      console.warn(`! ${agentType} has no fixtures directory`);
      continue;
    }

    const files = readdirSync(directory).filter((file) => file.endsWith(".json"));
    if (files.length === 0) console.warn(`! ${agentType} has no fixtures`);

    /*
     * The version recorded against each result comes from the active manifest,
     * so evaluation history lines up with the version that was actually
     * serving. Falling back to "unversioned" rather than "1.0.0" keeps a
     * missing manifest visible instead of inventing a plausible number.
     *
     * The database is optional in --dry mode on purpose: authoring a fixture is
     * an edit-run-correct loop, and requiring Postgres to find out that an
     * assertion has the wrong threshold makes that loop slow enough that people
     * stop using it.
     */
    const version = await activeVersionFor(agentType, dryRun);

    for (const file of files) {
      const raw = JSON.parse(readFileSync(resolve(directory, file), "utf8")) as AgentFixture;
      const fixture = { ...raw, input: reviveDates(raw.input) };

      let actual: unknown;
      let evaluation: ReturnType<typeof evaluateFixture>;
      let threw: string | null = null;

      try {
        actual = executeAgent(agentType, fixture.input).output;
        evaluation = evaluateFixture(fixture, actual);
      } catch (error) {
        // An agent that throws on a fixture is a failure of that fixture, not a
        // reason to abandon the other twenty-six.
        threw = error instanceof Error ? error.message : String(error);
        actual = { error: threw };
        evaluation = { passed: false, score: 0, failures: [] };
      }

      rows.push({
        agentType,
        fixtureName: fixture.name,
        version,
        passed: evaluation.passed,
        score: evaluation.score,
        expected: fixture.expected ?? {},
        actual,
        failures: threw
          ? [`agent threw: ${threw}`]
          : evaluation.failures.map(
              (failure) =>
                `${failure.path} ${failure.op} ${JSON.stringify(failure.expected)} — ${failure.reason} (got ${JSON.stringify(failure.actual)})`
            )
      });
    }
  }

  printTable(rows);

  if (!dryRun) {
    /*
     * Every run is inserted; nothing is deleted or updated. Regression over
     * time is the point of the table — "this fixture passed last month and
     * fails today" is the question it exists to answer, and an upsert keyed on
     * (agentType, version, fixtureName) would erase exactly that.
     */
    await prisma.agentEvaluation.createMany({
      data: rows.map((row) => ({
        agentType: row.agentType,
        version: row.version,
        fixtureName: row.fixtureName,
        passed: row.passed,
        score: row.score,
        expectedOutput: row.expected as never,
        actualOutput: row.actual as never
      }))
    });
    console.log(`\nRecorded ${rows.length} evaluation row(s).`);
  }

  const failed = rows.filter((row) => !row.passed);
  if (failed.length > 0) {
    console.error(`\n${failed.length} of ${rows.length} fixture(s) failed:`);
    for (const row of failed) {
      console.error(`  ${row.agentType}/${row.fixtureName} (score ${row.score.toFixed(2)})`);
      for (const failure of row.failures) console.error(`    - ${failure}`);
    }
    process.exitCode = 1;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/;

/**
 * Turns ISO date strings in a fixture into `Date` objects.
 *
 * JSON has no date type and the agents take `Date` — `gradedAt`, `dueDate`,
 * attendance `date`, and (since the clock injection) `now`. Without this the
 * agents receive strings, `now.getTime()` throws, and every fixture scores zero
 * for a reason that has nothing to do with what it was testing. Which is
 * exactly what happened on the first run of this harness.
 *
 * Matching on shape rather than on a list of field names: a fixture author
 * should not have to know which keys the reviver was told about, and a string
 * that looks exactly like an ISO timestamp is one in every fixture here.
 */
function reviveDates(value: unknown): unknown {
  if (typeof value === "string") return ISO_DATE.test(value) ? new Date(value) : value;
  if (Array.isArray(value)) return value.map(reviveDates);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, reviveDates(entry)]));
  }
  return value;
}

async function activeVersionFor(agentType: AgentType, dryRun: boolean): Promise<string> {
  try {
    const manifests = await prisma.agentManifest.findMany({ where: { agentType } });
    return selectActiveVersion(manifests)?.version ?? "unversioned";
  } catch (error) {
    if (!dryRun) throw error;
    return "unversioned";
  }
}

function printTable(rows: EvalRow[]) {
  const width = Math.max(...rows.map((row) => `${row.agentType}/${row.fixtureName}`.length), 10);
  console.log(`${"FIXTURE".padEnd(width)}  VERSION      SCORE  RESULT`);
  for (const row of rows) {
    const label = `${row.agentType}/${row.fixtureName}`.padEnd(width);
    console.log(`${label}  ${row.version.padEnd(11)}  ${row.score.toFixed(2)}   ${row.passed ? "pass" : "FAIL"}`);
  }
  const passed = rows.filter((row) => row.passed).length;
  console.log(`\n${passed}/${rows.length} passed.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
