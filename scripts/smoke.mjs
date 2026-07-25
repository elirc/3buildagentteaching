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
 * A data check may set `as: "<userId>"` to run as a specific seeded user. The
 * app's auth is a cookie the dev switcher writes, so sending that cookie is
 * precisely what a browser does after switching accounts — these are real
 * role-scoped requests, not a simulation.
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
  "/", "/my-work", "/family", "/my-courses", "/teachers", "/students", "/courses", "/sections", "/terms", "/enrollments",
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
    // The roster attendance sheet renders one row per enrolled student.
    // section_algebra_a has 3 enrolled (noah is waitlisted, so excluded).
    url: "/sections/section_algebra_a/attendance",
    expect: (html) => {
      // Match the field name only. React streams part of the markup inside a
      // JSON payload where quotes are escaped as \", so anchoring on `name="`
      // matches the server-rendered half and misses the streamed half.
      const n = new Set([...html.matchAll(/status_(student_[a-z]+)/g)].map((m) => m[1])).size;
      return n === 3 ? null : `expected 3 register rows, got ${n}`;
    }
  },
  {
    url: "/teachers?q=patel",
    expect: (html) => {
      const n = new Set([...html.matchAll(/\/teachers\/(teacher_[a-z]+)/g)].map((m) => m[1])).size;
      return n === 1 ? null : `teacher search should narrow to 1, got ${n}`;
    }
  },

  /* ---- role-scoped checks -------------------------------------------------
   * Everything above runs as the default Admin. These run as a specific seeded
   * user, which is the only way to exercise the branches that matter most:
   * a teacher seeing only their own queue, a guardian seeing only their own
   * child. Both shipped unverified before this.
   * ------------------------------------------------------------------------ */

  {
    // Nina Patel teaches Algebra only. Her queue must not contain Biology or
    // English work — the ?teacherId= override must lose to her own identity.
    url: "/my-work",
    as: "user_teacher_algebra",
    expect: (html) =>
      /Nina Patel/.test(html) ? null : "teacher should see their own workbench"
  },
  {
    // The guard that matters: a teacher cannot read a colleague's queue by
    // editing the URL, because actor.teacherId wins over the query param.
    url: "/my-work?teacherId=teacher_biology",
    as: "user_teacher_algebra",
    expect: (html) => {
      const content = withoutSwitcher(html);
      return /Nina Patel/.test(content) && !/Marcus Green/.test(content)
        ? null
        : "teacherId param must not override the acting teacher";
    }
  },
  {
    // Denise Johnson is linked to Maya only. Liam and Sophia must not appear.
    url: "/family",
    as: "user_guardian",
    expect: (html) => {
      const content = withoutSwitcher(html);
      if (!/Maya/.test(content)) return "guardian should see their own child";
      if (/Liam|Sophia|Noah/.test(content)) return "guardian must not see other families";
      return null;
    }
  },
  {
    // AdvisorOnly note (note_maya_family, "Guardian requested weekly progress
    // digest") must never reach a parent. Only Shared notes do.
    url: "/family",
    as: "user_guardian",
    expect: (html) =>
      /requested weekly progress digest/i.test(html)
        ? "AdvisorOnly support note leaked to a guardian"
        : null
  },
  {
    // Maya is enrolled in Algebra, Biology and English. Her portal must show
    // those and must not show the Geometry course she is not enrolled in.
    url: "/my-courses",
    as: "user_student_maya",
    expect: (html) => {
      const content = withoutSwitcher(html);
      if (!/Algebra I/.test(content)) return "student should see their enrolled courses";
      if (/Geometry/.test(content)) return "student must not see courses they are not enrolled in";
      return null;
    }
  },
  {
    // The class average must never appear on a student's own view.
    url: "/my-courses",
    as: "user_student_maya",
    expect: (html) =>
      /class average/i.test(withoutSwitcher(html)) ? "class average leaked to a student" : null
  },
  {
    // The record-level guard: a student typing a staff URL is refused. Before
    // fix/record-level-route-guard this rendered the full staff page including
    // AdvisorOnly support notes and the audit history.
    url: "/students/student_maya",
    as: "user_student_maya",
    expect: (html) =>
      /do not have access/i.test(withoutSwitcher(html))
        ? null
        : "a student must not reach the staff student record"
  },
  {
    url: "/students/student_maya",
    as: "user_guardian",
    expect: (html) =>
      /do not have access/i.test(withoutSwitcher(html))
        ? null
        : "a guardian must not reach the staff student record"
  },
  {
    // Staff must still be able to open it — a guard that refuses everyone is
    // not a guard, it is an outage.
    url: "/students/student_maya",
    as: "user_teacher_algebra",
    expect: (html) =>
      /do not have access/i.test(withoutSwitcher(html))
        ? "staff must still reach student records"
        : null
  },
  {
    // A Viewer is refused the operational pages by guardRoute.
    url: "/jobs",
    as: "user_viewer",
    expect: (html) =>
      /do not have access/i.test(html) ? null : "Viewer should be refused /jobs"
  }
];

function countStudentRows(html) {
  return new Set([...html.matchAll(/\/students\/(student_[a-z]+)/g)].map((m) => m[1])).size;
}

/**
 * Strips the dev user switcher before matching.
 *
 * The switcher in the top bar lists *every* user in the system for *every*
 * actor — that is its entire job, and it is labelled "Local development user
 * simulation". Its <option> elements are layout chrome, not page content.
 *
 * Without this, a negative assertion like "a guardian must not see Liam" fails
 * on every page in the app, because Liam Brooks is always in the dropdown. The
 * first version of these checks did exactly that and reported a privacy leak
 * that did not exist.
 *
 * Both forms are removed: the server-rendered <option> markup, and the same
 * elements as they appear inside React's escaped streaming payload.
 */
function withoutSwitcher(html) {
  return html
    .replace(/<option value="user_[^"]*"[\s\S]*?<\/option>/g, "")
    .replace(/\\"option\\",\\"user_[^"]*\\",\{[\s\S]*?\]/g, "");
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
async function get(path, actorUserId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(BASE + path, {
      signal: controller.signal,
      redirect: "manual",
      /*
       * The app has no real auth — DevUserSwitcher writes an `active_user_id`
       * cookie and getCurrentActor reads it. Sending that header is therefore
       * exactly what a browser would do after switching accounts, which is why
       * this is a faithful test of role-scoped behaviour rather than a
       * simulation of one.
       */
      headers: actorUserId ? { cookie: `active_user_id=${actorUserId}` } : undefined
    });
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
      const { status, body, reason } = await get(check.url, check.as);
      const problem = status === 200 ? check.expect(body) : `status ${status}${reason ? ` (${reason})` : ""}`;
      const who = check.as ? ` [as ${check.as}]` : "";
      console.log(`${problem ? "FAIL" : "ok  "}  data  ${check.url}${who}${problem ? `  — ${problem}` : ""}`);
      if (problem) failures.push(`${check.url}${who}: ${problem}`);
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
