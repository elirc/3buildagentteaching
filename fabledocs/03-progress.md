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

**Test count: 28 → 53.** `npx tsc -b` exit 0. `npm test` green.

## Not started

US-04 through US-20, exactly as written in `02-user-stories.md`. Nothing in
those stories has been superseded — the file is still the spec.

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
- **Dashboard risk metrics** (`atRiskStudents`, `attendanceConcerns`) are
  computed over at most 50 students rather than the whole school, because they
  depend on `scoreStudentRisk`. The UI labels this when it truncates. The real
  fix is a persisted risk score maintained by a job — US-11 and US-16 territory.

## Things learned the hard way (worth not rediscovering)

**A green test suite says nothing about whether the app starts.** During US-03
verification every route returned 500 while `tsc -b` and 53 unit tests were
green. The cause was environmental — Docker had dropped the Postgres container —
but the gap it exposed is real and is exactly what US-04 is for. Until there is
a smoke test, *run the app* before you claim a page works.

**Verify data, not status codes.** A 200 only proves the page did not throw.
`/students?status=DROP` returning all four students is what proves an invalid
enum is being ignored rather than forwarded to Prisma.

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
