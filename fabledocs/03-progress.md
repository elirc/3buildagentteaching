# Progress

Where the 20-story backlog in [`02-user-stories.md`](./02-user-stories.md)
actually stands. Updated when a story merges.

## Shipped

| Story | PR | What landed |
| --- | --- | --- |
| — | [#1](https://github.com/elirc/3buildagentteaching/pull/1) | Repo runs from a fresh clone: configurable Postgres port, container healthcheck, `npm run verify` |
| US-01 | [#2](https://github.com/elirc/3buildagentteaching/pull/2) | All 40 Server Actions return `ActionResult`; 48 forms render failures inline; 5 `as never` casts removed |
| US-02 | [#3](https://github.com/elirc/3buildagentteaching/pull/3) | Sidebar filtered by role; 9 operational routes guarded; job controls gated; acting role shown in the top bar |
| US-03 | [#4](https://github.com/elirc/3buildagentteaching/pull/4) | `/students` + `/teachers` paginated with search; dashboard metrics moved to aggregates; 5 more `as never` casts removed |
| US-04 | [#6](https://github.com/elirc/3buildagentteaching/pull/6) | 10 integration tests on a real Postgres, a route+data smoke test, and a 3-job GitHub Actions pipeline |
| US-05 | [#8](https://github.com/elirc/3buildagentteaching/pull/8) | `/my-work` grading queue ordered by urgency (wait time weighted by student risk), plus a needs-attention panel |
| US-06 | [#9](https://github.com/elirc/3buildagentteaching/pull/9) | Criterion-by-criterion rubric grading with derived totals and partial saves; late-unscored grade-average fix |
| US-07 | [#11](https://github.com/elirc/3buildagentteaching/pull/11) | Whole-section attendance register in one transaction; session-aware absence streaks; local-midnight date parsing |
| US-08 | [#12](https://github.com/elirc/3buildagentteaching/pull/12) | `/family` guardian portal with query-level scoping; the Guardian permission branch; `notification:readOwn` |
| — | [#14](https://github.com/elirc/3buildagentteaching/pull/14) | Smoke checks can run as a specific user, closing the verification gap US-05 and US-08 both shipped with |
| US-09 | [#15](https://github.com/elirc/3buildagentteaching/pull/15) | `/my-courses` student portal; `canSubmitAssignment` and `determineSubmissionStatus` finally enforced |
| — | [#16](https://github.com/elirc/3buildagentteaching/pull/16) | Staff record pages refused to students and guardians |
| US-10 | [#19](https://github.com/elirc/3buildagentteaching/pull/19) | Waitlist promotion with write-time capacity re-check, bulk enrolment with per-student outcomes, capacity-reduction guard |

**Test count: 28 → 103** (79 unit + 24 integration), plus a smoke pass over 28
routes and 14 data assertions — 10 of them role-scoped. CI green on all three
jobs for every merge.

## Not started

US-11 through US-20, exactly as written in `02-user-stories.md`. Nothing in
those stories has been superseded — the file is still the spec.

## How to verify your work now

CI runs on every PR and is the authority. Locally:

```bash
npm run verify            # typecheck + 53 unit tests   (~30s warm)
npm run test:db:up        # throwaway Postgres on :5443
npm run test:integration  # 10 service tests            (~6 min here)
npm run smoke             # boots the app, checks routes and data
```

`npm run smoke` is slow on a loaded laptop — Next compiles each route on first
request, and this box OOM-killed two attempts. It takes **19 seconds** on a CI
runner. If it is struggling locally, push and let CI run it.

## Known partials in shipped work

These were called out in their PRs rather than ticked silently. If you pick one
up, it is a small piece of work, not a rewrite.

- **US-02 criterion 3** — mutating controls are gated on the operational pages
  (`/jobs/[id]` and the nine guarded routes), not across all 39 pages. The
  remaining ones are staff-only views where the route filter already limits the
  audience and `assertCan` still refuses the write. Extending it is mechanical.
- **US-02 criterion 2** — a Student sees Assignments but no grades view, because
  a student-scoped one does not exist until US-09 and `/gradebook` is
  school-wide.
- **US-03 criterion 1** — pagination is applied to `/students` and `/teachers`.
  `/sections`, `/assignments`, `/enrollments`, `/agent-runs`, `/audit-events`
  and `/jobs` still load unbounded. Every helper and component they need is
  already in `packages/shared` and `packages/ui`; wiring one page is perhaps
  twenty minutes.
- **`/jobs` and `/logs`** still contain `params.x as never` in their filter
  clauses. `parseEnumParam` exists now — these are two-line fixes.
- **US-06 criteria 6 and 7** — `runAssignmentFeedbackAgent` still passes the
  hardcoded `rubricFields: ["reasoning", "evidence", "complete", "reflection"]`
  instead of the assignment's real criteria, and `/rubrics` still creates every
  criterion worth 10 points. Both are small and both were left out to keep the
  grading diff about grading.
- **US-05 smoke coverage** — `/my-work` is in the sweep, but the smoke client
  does not set the `active_user_id` cookie, so only the operator path is
  exercised. The teacher-sees-only-themselves branch is untested; the fix is
  cookie support in `scripts/smoke.mjs`.
- **US-07 criterion 8** — `historicalAverageIssuePoints` is still hardcoded to
  `2` for every target in `agent-run-service.ts`. It is an agent-input concern
  and belongs with US-17/US-19.
- **The roster page has no smoke data assertion.** `section_algebra_a` is seeded
  full with one waitlisted student — an ideal fixture for asserting the "Next"
  badge and the seats-open banner. Obvious next increment.
- **Untested writes** — `recordSectionAttendance` and
  `updateGuardianPreferences` have no integration tests. Their rules are
  unit-tested through the domain layer; the transactional paths are not.
- **No Server Action is driven end to end.** Services have integration tests and
  pages have smoke coverage, but nothing exercises the HTTP boundary between
  them. Doing it properly means reproducing React's action-id protocol or
  adopting a browser harness.
- **Dashboard risk metrics** (`atRiskStudents`, `attendanceConcerns`) are
  computed over at most 50 students rather than the whole school, because they
  depend on `scoreStudentRisk`. The UI labels this when it truncates. The real
  fix is a persisted risk score maintained by a job — US-11 and US-16 territory.

## Things learned the hard way (worth not rediscovering)

**A green test suite says nothing about whether the app starts.** During US-03
verification every route returned 500 while `tsc -b` and 53 unit tests were
green. The cause was environmental — Docker had dropped the Postgres container —
but the gap it exposed is real. **US-04 closed it**: `npm run smoke` and the CI
smoke job now catch exactly this.

**A new test failing usually means the test is wrong, not the code.** Both
suites added in US-04 were red on their first run, and both were my mistakes —
fixtures using actor ids with no `User` row (`AuditEvent.actorUserId` is a real
foreign key), and a smoke client that crashed on its own timeout instead of
reporting. Read the error and work out which side is wrong before "fixing"
working code to satisfy a bad test.

**This machine accumulates orphaned node processes.** Repeated dev servers,
builds and test runs left 28 `node.exe` processes and 0.9 GB free of 15.8 GB,
which is what killed the local smoke runs. If things start timing out for no
reason, check for orphans before debugging your code.

**Verify data, not status codes.** A 200 only proves the page did not throw.
`/students?status=DROP` returning all four students is what proves an invalid
enum is being ignored rather than forwarded to Prisma.

**Watch for enum values that reach the bottom of an `if` chain.** The
late-unscored grade bug (US-06) was not a wrong line — it was a missing branch,
so a case silently contributed nothing. There was no wrong-looking code to spot
in review. Enumerate the states and check each one is handled deliberately.

**"Absent" and "zero" are different values.** A blank rubric criterion means
"not scored yet", and `Number("")` turning it into 0 would have silently awarded
nothing for every criterion a teacher had not reached. Conflating null with a
zero value is one of the most common data-modelling errors there is.

**Match identifiers, not markup, in smoke assertions.** A `/sections/.../attendance`
assertion anchored on `name=\"status_` failed while the page was perfectly
fine — React streams part of the markup inside a JSON payload where quotes are
escaped, so the pattern matched the server-rendered half and missed the streamed
half. The field name is stable; the quoting around it is not.

**When a new feature breaks a test, decide which one is wrong first.** US-08
broke "Admin sees every link". The instinct is to grant Admin access and go
green; the correct answer was that a portal scoped to one family has nothing to
show an administrator, and the test's assumption had simply expired.

**A tested function proves nothing about whether anything calls it.**
`canSubmitAssignment` was implemented, unit-tested and exported from the first
commit — and called by nobody, while `submitAssignment` skipped the check
entirely. Submitting to a Draft assignment silently worked for the life of the
codebase. When you inherit a domain layer, check who calls each rule.

**A negative assertion over a whole HTML document tests the layout too.** Two
"privacy leaks" reported by CI were the dev user switcher, which lists every
user on every page. Reproduce by hand before changing code — the instinct to fix
the reported leak would have meant editing correct code to satisfy a broken test.

**A guard that refuses everyone is an outage, not a guard.** Every access check
needs a positive test alongside the negative ones.

**`gh run view --jq .conclusion` does not gate anything.** It exits 0 whenever
it can fetch the run, so `gh run view ... && gh pr merge ...` merges happily
while printing the word `failure`. PR #20 went in on a red job this way. Use
`gh run watch --exit-status`, whose exit code carries the answer. (That
particular failure was a Docker Hub timeout and the commits passed on re-run —
but the chain would have merged a real breakage identically.)

**Re-check at write time, not render time.** A roster page that says "1 seat
open" is stating something that was true when it rendered. Anything the UI
computed in order to *offer* an action must be recomputed by the code that
*performs* it — the gap between the two can be a lunch break.

**Batch semantics are a product decision.** `bulkEnroll` uses one transaction
per student on purpose, so one withdrawn student does not cost the operator
eleven good ones. Ask of any batch: is this a business transaction, or a UI
convenience? They want opposite implementations.

**Seed data hides paging bugs.** With four students, `total: rows.length` and a
real `count()` are indistinguishable. Any fixture set smaller than one page
leaves pagination untested by construction.

**This machine is slow, and it changes what a sensible gate is.** Measured:

| command | time |
| --- | --- |
| `npm test` | ~14s warm, ~65s cold |
| `npx tsc -b` | ~150s from clean |
| `npm run lint` | **~12m45s** |
| `npm run build` | **~25m** |

That is why `verify` is typecheck + tests, `verify:full` adds lint, and the
build is neither. See `CONTRIBUTING.md` §5.

**Stale `.tsbuildinfo` files break `tsc -b` on a fresh clone.** The inherited
tree carried build info claiming the packages were built, while `dist/` was
gitignored and absent, so TypeScript refused to rebuild and emitted TS6305 for
every cross-package import. Deleting `**/*.tsbuildinfo` and the `dist/` folders
fixes it. A genuinely fresh `git clone` does not have this problem.
