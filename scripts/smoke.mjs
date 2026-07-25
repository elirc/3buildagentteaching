#!/usr/bin/env node
/**
 * Route smoke test.
 *
 * Exists because of a specific incident: during US-03, `tsc -b` passed and 53
 * unit tests passed while *every route in the application returned 500*. The
 * cause was environmental (the database container had gone away), but the gap
 * it exposed is permanent — a unit suite verifies functions, not whether the
 * app serves a page.
 *
 * Two kinds of check, and the second matters more:
 *
 *   1. Every sidebar route returns 200 and contains no error marker.
 *   2. Specific URLs return the *right data*. A 200 only proves the page did
 *      not throw. `/students?status=DROP` returning every student is what
 *      proves an invalid enum is being ignored rather than forwarded to Prisma.
 *
 * Usage:
 *   node scripts/smoke.mjs                  # spawns `npm run dev`, waits, checks, kills
 *   SMOKE_BASE_URL=http://localhost:3000 node scripts/smoke.mjs   # reuse a running server
 */

import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const EXTERNAL = process.env.SMOKE_BASE_URL;
const BASE = EXTERNAL ?? "http://localhost:3000";
const BOOT_TIMEOUT_MS = Number(process.env.SMOKE_BOOT_TIMEOUT_MS ?? 900_000);
const REQUEST_TIMEOUT_MS = Number(process.env.SMOKE_REQUEST_TIMEOUT_MS ?? 120_000);

const ROUTES = [
  "/", "/teachers", "/students", "/courses", "/sections", "/terms", "/enrollments",
  "/assignments", "/rubrics", "/gradebook", "/attendance", "/at-risk", "/interventions",
  "/approvals", "/guardians", "/notifications", "/jobs", "/worker-jobs", "/logs",
  "/agent-runs", "/agent-ops", "/agent-recommendations", "/audit-events", "/settings"
];

/**
 * Data assertions. Each returns null when satisfied, or a message when not.
 *
 * `contains` / `missing` operate on the raw streamed HTML. React's payload
 * splits text across the wire, so these match on stable substrings (ids in
 * hrefs) rather than rendered sentences.
 */
const DATA_CHECKS = [
  {
    url: "/students",
    expect: (html) => (countStudentRows(html) === 4 ? null : `expected 4 student rows, got ${countStudentRows(html)}`)
  },
  {
    url: "/students?q=maya",
    expect: (html) => (countStudentRows(html) === 1 ? null : `search should narrow to 1, got ${countStudentRows(html)}`)
  },
  {
    // The regression guard for the `as never` removal in US-01/US-03.
    url: "/students?status=DROP",
    expect: (html) =>
      countStudentRows(html) === 4 ? null : `invalid enum must not filter; got ${countStudentRows(html)} rows`
  },
  {
    // buildPagination clamps a page past the end back to the last populated one.
    url: "/students?page=99",
    expect: (html) => (countStudentRows(html) === 4 ? null : `page past end should clamp, got ${countStudentRows(html)}`)
  },
  {
    url: "/teachers?q=patel",
    expect: (html) => {
      const n = new Set([...html.matchAll(/\/teachers\/(teacher_[a-z]+)/g)].map((m) => m[1])).size;
      return n === 1 ? null : `teacher search should narrow to 1, got ${n}`;
    }
  }
];

function countStudentRows(html) {
  return new Set([...html.matchAll(/\/students\/(student_[a-z]+)/g)].map((m) => m[1])).size;
}

/**
 * Fetch that never throws.
 *
 * A smoke test whose own HTTP client can crash is worse than useless: the run
 * dies on the first slow route and reports nothing about the other twenty-three.
 * A timeout or a refused connection is a *result* here — status 0 with a reason
 * — not an exception for the caller to handle.
 *
 * (This function originally used try/finally without a catch. The first slow
 * route aborted, the rejection escaped, and node exited with an uncaught
 * DOMException and no report at all.)
 */
async function get(path) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, { signal: controller.signal, redirect: "manual" });
    return { status: res.status, body: await res.text() };
  } catch (error) {
    const reason = error?.name === "AbortError" ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : String(error?.message ?? error);
    return { status: 0, body: "", reason };
  } finally {
    clearTimeout(timer);
  }
}

async function waitForServer(deadline) {
  while (Date.now() < deadline) {
    try {
      const res = await fetch(BASE + "/", { signal: AbortSignal.timeout(10_000) });
      if (res.status > 0) return true;
    } catch {
      // Not listening yet. Next's first compile takes a while on a cold cache.
    }
    await sleep(2000);
  }
  return false;
}

let server;
if (!EXTERNAL) {
  console.log("starting dev server…");
  server = spawn("npm", ["run", "dev"], { stdio: "ignore", shell: true });
}

let failures = [];
try {
  if (!(await waitForServer(Date.now() + BOOT_TIMEOUT_MS))) {
    console.error(`server did not respond at ${BASE} within ${BOOT_TIMEOUT_MS}ms`);
    process.exitCode = 1;
    failures.push("boot");
  } else {
    for (const route of ROUTES) {
      const { status, body, reason } = await get(route);
      // A Next error page still returns 200 in dev, so the status alone is not
      // enough — the digest marker is what distinguishes a rendered error.
      const errored = /"digest":"\d/.test(body) || /Application error: a server-side exception/.test(body);
      const ok = status === 200 && !errored;
      console.log(`${ok ? "ok  " : "FAIL"}  ${status}  ${route}${reason ? `  (${reason})` : ""}`);
      if (!ok) failures.push(`${route} -> ${status}${reason ? ` ${reason}` : ""}${errored ? " (server exception)" : ""}`);
    }

    for (const check of DATA_CHECKS) {
      const { status, body, reason } = await get(check.url);
      const problem = status === 200 ? check.expect(body) : `status ${status}${reason ? ` (${reason})` : ""}`;
      console.log(`${problem ? "FAIL" : "ok  "}  data  ${check.url}${problem ? `  — ${problem}` : ""}`);
      if (problem) failures.push(`${check.url}: ${problem}`);
    }
  }
} finally {
  if (server) server.kill();
}

if (failures.length > 0) {
  console.error(`\n${failures.length} smoke failure(s):`);
  for (const failure of failures) console.error("  - " + failure);
  process.exit(1);
}
console.log("\nsmoke passed");
