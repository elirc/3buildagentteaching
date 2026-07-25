# User stories — next phase

20 stories, ordered so that earlier ones unblock later ones. Each is written to
be picked up cold: it says what to build, how you will know it is done, which
files to open, and what to test.

**Read [01-app-overview.md](./01-app-overview.md) first.** These stories assume
you know the layering rule, the `assertCan` pattern, the `persistAgentRun`
lifecycle, and the list in §9 of what is modelled but not wired.

## How to read a story

- **Size** — S (≤ half a day), M (1–2 days), L (3–5 days). Rough, not a promise.
- **Acceptance criteria** are numbered and testable. If you cannot write a test
  for one, it is badly written — push back.
- **Files to touch** is a starting map, not an exhaustive list.

## Definition of done (applies to every story)

1. Input parsed by a Zod schema in `packages/domain/src/validation.ts` at the
   server-action boundary. **No `as never` casts** — that is what US-01 removes.
2. New business rules are **pure functions in `packages/domain`** returning
   `{ allowed | valid, reason }`, with unit tests. Services enforce; they do not decide.
3. Writes go through an application service, inside `prisma.$transaction`, with a
   `createAuditEvent` in the same transaction.
4. Authorization is a single `assertCan(actor, action, resource)` at the top of the
   service method. New capabilities get a new `PermissionAction` string.
5. `packages/domain` and `packages/agents` gain **no** import of Prisma, React, or `next`.
6. Agents stay deterministic: no `Math.random()`, no `new Date()` inside agent logic.
7. `npm test`, `npm run typecheck`, and `npm run lint` are green, and no `any` was
   added to get there.
8. If you changed the schema: `npm run db:generate && npm run db:push`, and the
   seed still runs clean from scratch.

## Board

Status is tracked in [03-progress.md](./03-progress.md) — check it before
starting, because three of these have already shipped and two left partials.

| # | Story | Size | Depends on | Status |
| --- | --- | --- | --- | --- |
| US-01 | Server actions that fail gracefully | M | — | ✅ shipped (#2) |
| US-02 | Role-aware navigation and action gating | M | US-01 | ✅ shipped (#3), partials |
| US-03 | Search, filtering, and pagination on list pages | M | — | ✅ shipped (#4), partials |
| US-04 | Test and CI foundation | L | — |
| US-05 | Teacher workbench: the grading queue | M | US-02 |
| US-06 | Rubric-based grading with criterion scores | L | US-05 |
| US-07 | Section-roster attendance entry | M | US-02 |
| US-08 | Guardian portal | M | US-02 |
| US-09 | Student portal: submit work and track grades | M | US-02 |
| US-10 | Roster management and waitlist promotion | M | — |
| US-11 | Job producers, handlers, and a scheduler | L | US-01 |
| US-12 | Notification and recommendation inbox | L | US-11 |
| US-13 | Runtime structured logging | M | — |
| US-14 | Guardian record consolidation | M | US-08 |
| US-15 | Term and section calendar consolidation | M | — |
| US-16 | Weekly risk report generation and CSV export | M | US-11 |
| US-17 | Manifest-gated agent execution and versioning | M | — |
| US-18 | Sub-agent run persistence and the trace tree | M | US-17 |
| US-19 | Agent evaluation harness | L | US-17 |
| US-20 | New agent end to end: Term Postmortem | L | US-17, US-19 |

### Suggested order for one engineer

US-01 → US-02 → US-05 → US-11 → US-12 → then pick an epic and finish it.
US-03, US-04, and US-13 can be dropped in whenever the main thread is blocked.

---

# Epic A — Foundations

These four make everything after them cheaper. Do US-01 first; almost every
other story adds a form, and right now a rejected form crashes the page.

## US-01 — Server actions that fail gracefully

**Size** M · **Depends on** — · **Priority** highest

**As a** user of any role
**I want** to see a clear message when an action is refused or invalid
**so that** I can correct it, instead of hitting a Next.js error screen with no
explanation.

### Context

None of the 40 Server Actions in `apps/web/lib/actions.ts` has a `try`/`catch`.
When `assertCan` throws `AppError("FORBIDDEN", ...)`, or `validateScore` throws
`VALIDATION_ERROR`, or a Prisma unique constraint fires, the exception propagates
to the framework and the user gets a generic error page. Switch to the Viewer
account and press any button to see it.

The infrastructure already exists and is unused: `ActionResult<T>`,
`actionSuccess`, `actionFailure` in `packages/application/src/errors.ts:19-37`,
tested in `application.test.ts` and called from nowhere else.

Separately, three actions launder unvalidated strings into Prisma with
`as never` — `updateInterventionStatus` (`actions.ts:225`), `createAcademicTerm`
(`actions.ts:293`), `linkGuardianToStudent` (`actions.ts:329`), plus
`decideInterventionApproval` (`actions.ts:372`) and `decideAgentRecommendation`
(`actions.ts:407`). A bad `<select>` value reaches the database driver.

### Acceptance criteria

1. Every exported Server Action returns `Promise<ActionResult<T>>` and contains no
   uncaught throw. Actions that currently `redirect()` on success still redirect —
   `redirect` throws a control-flow signal, so it must be called **outside** the
   `try` block or explicitly re-thrown.
2. A shared wrapper does the work once, rather than 40 copies of `try`/`catch`:
   ```ts
   // apps/web/lib/action-result.ts
   export async function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>>
   ```
   It returns `actionFailure(error)` for `AppError`, maps `ZodError` to
   `{ code: "VALIDATION_ERROR", message: <first issue's message> }`, and maps
   anything else to a generic `INTERNAL_ERROR` message. **`error.metadata` is never
   returned to the client** — it can contain IDs and internals.
3. Every form that can fail renders the failure next to the form, using
   `useActionState` (React 19) in a small client component. An error banner shows
   `result.error.message` and the form keeps the user's input.
4. `assertCan` failures show the message from `explainPermission` verbatim —
   e.g. *"Your current role is not allowed to perform submission:grade."*
5. All five `as never` casts are replaced by `z.enum([...])` parses. An invalid
   value produces a `VALIDATION_ERROR` result, not a Prisma error.
6. Scores outside `0..pointsPossible` show *"Score cannot exceed points possible."*
   inline on the grading form (the domain rule already produces that string).
7. Successful actions still `revalidatePath` exactly as they do now.

### Files to touch

- `apps/web/lib/action-result.ts` *(new)* — `runAction`, plus the `ZodError` mapping.
- `apps/web/components/form-error.tsx` *(new)* — `"use client"`, renders
  `ActionResult["error"]`; a `<SubmitButton>` with `useFormStatus` for pending state.
- `apps/web/lib/actions.ts` — wrap all actions; delete every `as never`.
- `packages/domain/src/validation.ts` — export the missing enum schemas
  (`interventionStatusSchema`, `academicTermStatusSchema`, `guardianRelationshipSchema`,
  `approvalDecisionSchema`, `recommendationDecisionSchema`).
- Every page with a mutating form: start with `submissions/[id]`, `students/[id]`,
  `attendance`, `enrollments`, `approvals`, `jobs/[id]`.

### Tests

- Unit (`application.test.ts`): `runAction` maps `AppError` → matching code;
  `ZodError` → `VALIDATION_ERROR`; unknown error → `INTERNAL_ERROR` with a generic
  message and **no** metadata leakage.
- Unit: each new enum schema rejects `"NotAStatus"`.

### Out of scope

Toast notifications, optimistic UI, client-side validation mirroring.

---

## US-02 — Role-aware navigation and action gating

**Size** M · **Depends on** US-01

**As a** teacher, advisor, guardian, or viewer
**I want** the UI to show me only what I can actually do
**so that** I am not clicking buttons that exist purely to reject me.

### Context

No page in `apps/web/app` reads the current actor's role — grep for
`getCurrentActor`; outside `actions.ts` the only hits are `settings/page.tsx` and
the switcher component. The sidebar in `layout.tsx:12-36` renders all 23 links for
everyone, and every "Run agent" / "Retry job" / "Save grade" button renders for
every role. `canPerform` is enforced server-side only, so the UI is a field of
tripwires.

This is a UI story. **The server-side `assertCan` calls stay exactly where they
are** — hiding a button is not authorization.

### Acceptance criteria

1. A server helper exposes capabilities to pages:
   ```ts
   // apps/web/lib/capabilities.ts
   export async function getActorCapabilities(): Promise<{
     actor: ActorContext;
     can: (action: PermissionAction, resource?: PermissionResource) => boolean;
   }>
   ```
   It calls `getCurrentActor()` once and closes over `canPerform` — no new
   permission logic, no duplicated rules.
2. The sidebar filters its links by role. Minimum: a `Student` sees Dashboard,
   their assignments, and their grades; a `Guardian` sees only their students
   (US-08); a `Viewer` sees read-only pages and never Jobs, Worker Jobs, or
   Agent Ops.
3. Every mutating control is either hidden or `disabled` when `can(...)` is false.
   Disabled controls carry a `title` explaining why. Prefer disabled over hidden
   where the control's absence would be confusing.
4. The nav array moves out of `layout.tsx` into a typed module:
   `{ label, href, requires?: PermissionAction, roles?: UserRole[] }[]`.
5. Direct navigation to a page a role cannot read renders an `EmptyState`
   ("You do not have access to this view") — not a crash and not an empty table.
6. The topbar shows the active user's name and role badge next to the switcher, so
   it is obvious who you are acting as.
7. **Regression guard:** removing a UI control does not remove its `assertCan`.
   A test asserts that `assignmentService.gradeSubmission` still throws for a Viewer.

### Files to touch

- `apps/web/lib/capabilities.ts` *(new)*
- `apps/web/lib/navigation.ts` *(new)* — the typed nav model
- `apps/web/app/layout.tsx` — consume it
- Every page with a mutating control (~15 files)
- `packages/ui/src/index.tsx` — `Button` already spreads props, so `disabled` and
  `title` work; add a `tooltip` prop only if you actually need it

### Tests

- Unit: `getActorCapabilities` returns `can("submission:grade") === false` for a
  Viewer actor and `true` for an Admin.
- Unit (`domain.test.ts`): extend `role permissions` with explicit
  Guardian/Viewer cases so the current "everything is false" behaviour is pinned
  before US-08 changes it.

### Out of scope

Route middleware, real sessions, per-record row filtering in list queries
(that is US-08 and US-09 for their respective roles).

---

## US-03 — Search, filtering, and pagination on list pages

**Size** M · **Depends on** —

**As an** administrator at a school with more than four students
**I want** to search and page through the lists
**so that** the app is usable beyond the seed data.

### Context

Every list page loads everything. `/students` fetches all students, `/attendance`
takes 80 records and recomputes summaries in JS, and `getDashboardSummary`
(`dashboard-query.ts:5`) loads **every student with all submissions, all
attendance, all interventions and all support notes**, plus every teacher with
every section, enrollment, assignment and submission — then does the counting in
JavaScript. With `dynamic = "force-dynamic"` in the root layout, that happens on
every single navigation.

At seed scale it is instant. At 500 students it is a spinner. `/logs`
(`logs/page.tsx:7`) already shows the URL-search-param pattern to copy.

### Acceptance criteria

1. `/students`, `/teachers`, `/sections`, `/assignments`, `/enrollments`,
   `/agent-runs`, `/audit-events`, and `/jobs` accept `?q=`, `?page=`, and at
   least one domain filter each (student: `gradeLevel`, `enrollmentStatus`;
   assignment: `status`, `sectionId`; job: `status`, `type`; agent run:
   `agentType`, `status`).
2. Filter state lives entirely in the URL — a filtered view is shareable and the
   back button works. No client-side state.
3. Page size 25, with a footer showing `Showing X–Y of Z` and prev/next links that
   preserve every other query param.
4. Search is case-insensitive `contains` across the obvious fields (name, email,
   student number, course code/title). Postgres `mode: "insensitive"`.
5. Counts come from `prisma.*.count()` with the same `where` — never
   `results.length` after fetching everything.
6. `getDashboardSummary` is rewritten to use `groupBy`/`count`/`aggregate` for its
   eight metric numbers instead of loading full object graphs. The at-risk list
   and workload alerts are capped at the top 10 by score.
7. A reusable `<Pagination>` and `<FilterBar>` land in `packages/ui`, and every
   list page uses them.

### Files to touch

- `packages/ui/src/index.tsx` + `styles.css` — `Pagination`, `FilterBar`
- `packages/application/src/queries/*` — add a shared
  `type ListParams = { q?: string; page?: number; pageSize?: number }` and return
  `{ rows, total, page, pageSize }`
- `packages/application/src/queries/dashboard-query.ts` — the aggregate rewrite
- The eight list pages

### Tests

- Unit: a pure `buildPagination(total, page, pageSize)` helper in `packages/shared`
  — clamps out-of-range pages, computes offsets, handles `total === 0`.
- Unit: a pure `parseListParams(searchParams)` — rejects `page=0`, `page=-1`,
  `page=abc`, and caps `pageSize`.

### Out of scope

Full-text search, cursor pagination, sortable column headers.

---

## US-04 — Test and CI foundation

**Size** L · **Depends on** —

**As an** engineer changing grade or permission logic
**I want** database-level and end-to-end tests
**so that** I find out I broke enrollment capacity before a reviewer does.

### Context

28 test cases exist, all pure-function: `domain.test.ts` (18), `agents.test.ts` (8),
`application.test.ts` (2). **Zero** exercise Prisma, a service, a Server Action, or
a page. Every bug listed in §9 of the overview — the audit trail, transaction
boundaries, the enrollment race, permission enforcement — lives in exactly the
layer with no coverage.

### Acceptance criteria

1. `npm run verify` runs `typecheck && lint && test` and is the single command a
   reviewer is told to run.
2. An integration suite runs services against a **real** Postgres:
   `docker-compose.test.yml` on port 5433, `.env.test` with its own
   `DATABASE_URL`, and `vitest.integration.config.ts` with a global setup that
   pushes the schema and truncates all tables between tests.
3. Integration coverage for at least these, because each one is a rule that only
   exists at the DB boundary:
   - `enrollmentService.enrollStudent` waitlists at capacity and rejects a
     duplicate active enrollment (unique constraint + `decideEnrollment` together);
   - `assignmentService.gradeSubmission` writes exactly one `AuditEvent` with
     correct `before`/`after`;
   - a service that throws leaves **no** partial rows (roll back the transaction
     deliberately and assert);
   - `assertCan` denial for a Viewer on three different services;
   - `workerService.runNextJob` transitions
     Queued → Running → Failed → (retry) → DeadLettered across repeated calls, and
     refuses a job holding an unexpired `WorkerLock`.
4. A Playwright smoke suite (`npm run test:e2e`) against a seeded DB: load every
   route in the sidebar and assert HTTP 200 + no console error; then one full
   journey — switch to the Algebra teacher, open Maya's submission, save a grade,
   assert the new score renders and an audit row appears.
5. A GitHub Actions workflow runs `verify` plus the integration suite (with a
   `postgres:16-alpine` service container) on push.
6. `fabledocs/README.md` documents how to run each layer.

### Files to touch

- `vitest.config.ts`, `vitest.integration.config.ts`, `docker-compose.test.yml`,
  `.env.test.example`
- `packages/application/src/__tests__/*.integration.test.ts` *(new)*
- `tests/e2e/*.spec.ts` *(new)*, `playwright.config.ts`
- `.github/workflows/verify.yml` *(new)*
- root `package.json` scripts: `verify`, `test:integration`, `test:e2e`

### Out of scope

Coverage thresholds, visual regression, load testing.

---

# Epic B — The teaching loop

The features a real school would use daily. Every one of these turns an
already-modelled-but-unreachable capability into something a user can press.

## US-05 — Teacher workbench: the grading queue

**Size** M · **Depends on** US-02

**As a** teacher
**I want** one page listing everything waiting on me, ordered by urgency
**so that** I do not have to walk section by section to find ungraded work.

### Context

`/teachers/[id]` shows a profile and a workload agent panel. There is no view of
"what do I need to do today". A teacher currently reaches ungraded work by going
to `/assignments`, opening an assignment, and finding submissions one at a time.

The signals already exist: `scoreTeacherWorkload` (`domain/src/workload.ts:18`)
computes backlog pressure, and `getSectionGradebook` already joins submissions to
sections. Nothing surfaces them as a work queue.

### Acceptance criteria

1. New route `/my-work`, scoped to the acting user. A `Teacher` sees their own
   sections; an `Admin`/`SchoolManager` picks a teacher from a dropdown; other
   roles get the "no access" `EmptyState` from US-02.
2. Four counters at the top: ungraded submissions, assignments due this week,
   students at High/Critical risk in my sections, failed jobs related to my
   sections.
3. **Grading queue** table — one row per ungraded submission — with columns
   student, assignment, section, submitted date, days waiting. Sorted by days
   waiting descending. Each row links to `/submissions/[id]`.
4. Rows for students at High or Critical risk carry a badge, because grading their
   work first is the point of the ordering.
5. **Needs attention** panel: assignments still `Draft` past their due date;
   assignments `Published` with zero submissions; students in my sections with
   ≥ 3 missing assignments.
6. The workload score and level from `scoreTeacherWorkload` render with the
   indicator list, and the Teacher Workload agent can be run from this page.
7. `getTeacherWorkbench(teacherId)` lives in `packages/application/src/queries/`
   and issues **at most 4 queries** — no per-assignment loop. Assert the query
   count in the integration test if US-04 has landed.

### Files to touch

- `packages/application/src/queries/teacher-workbench-query.ts` *(new)*
- `packages/domain/src/workload.ts` — add a pure
  `rankGradingQueue(items): GradingQueueItem[]` (urgency = days waiting + risk
  weighting) so ordering is testable
- `apps/web/app/my-work/page.tsx` *(new)*
- `apps/web/lib/navigation.ts` — add the link, gated to Teacher/Admin/SchoolManager

### Tests

- Unit: `rankGradingQueue` puts a 5-day-old submission from a Critical-risk
  student above a 9-day-old one from a Low-risk student, and is stable for ties.
- Integration: the query returns only sections belonging to the requested teacher.

### Out of scope

Bulk grading from the queue (US-06), notifications (US-12).

---

## US-06 — Rubric-based grading with criterion scores

**Size** L · **Depends on** US-05

**As a** teacher
**I want** to grade against my rubric's criteria and have the total computed
**so that** scoring is consistent and students see *why* they got the mark.

### Context

The whole rubric machinery exists and is unreachable. `Rubric` and
`RubricCriterion` can be created from `/rubrics`. `SubmissionCriterionScore` is a
table with a unique constraint on `[submissionId, criterionId]`.
`calculateRubricScore` and `rubricRequiresTeacherReview`
(`domain/src/rubrics.ts`) are implemented and unit-tested.
`getRubricScorePreview` (`academic-ops-query.ts:48`) wires them to the database.

**Nothing writes a criterion score.** The only criterion scores in the system are
seeded. The grading UI (`submissions/[id]/page.tsx:43-49`) is one number box and a
textarea. `runAssignmentFeedbackAgent` even hardcodes
`rubricFields: ["reasoning", "evidence", "complete", "reflection"]`
(`agent-run-service.ts:189`) rather than reading the actual rubric.

This story also fixes the grade-average bug, because both change what a student's
average means and they should ship together.

### Acceptance criteria

1. When a submission's assignment has a rubric, `/submissions/[id]` renders one
   scored row per criterion — title, description, `points / pointsPossible`, and a
   per-criterion feedback box — instead of the single score field.
2. Saving computes the total via `calculateRubricScore` and writes it to
   `Submission.score`. The teacher **cannot** hand-edit the total when a rubric is
   attached; the total is derived. Assignments with no rubric keep today's form.
3. Per-criterion scores are validated against that criterion's `pointsPossible`,
   with the existing message: *"{title} score must be between 0 and {n}."*
4. Partial saves are allowed. If any criterion is unscored,
   `rubricRequiresTeacherReview` is true, the submission stays `Submitted`
   (not `Graded`), and the page shows *"Scored 2 of 4 criteria"*.
5. All criterion scores plus the submission update happen in **one transaction**
   with **one** `submission.graded` audit event whose `after` includes the
   per-criterion breakdown.
6. `runAssignmentFeedbackAgent` reads the real rubric criteria and passes their
   titles as `rubricFields`. With no rubric, it falls back to today's four
   generic fields.
7. `/rubrics` gains per-criterion point entry (the current form hardcodes 10
   points per criterion via `points_${index}` inputs that the page never renders —
   see `actions.ts:347`), plus description and sort order.
8. **Grade math fix:** `calculateGradeSummary` (`domain/src/grades.ts:38`) adds
   `pointsPossible` to the denominator for a `Late` submission that has no score,
   the same way it already does for `Missing`. Update `domain.test.ts` and note in
   the PR that Maya's average changes as a result — that is the correct outcome.

### Data model

No schema change. `SubmissionCriterionScore` already has everything.

### Files to touch

- `packages/domain/src/grades.ts` — the `Late`-unscored fix
- `packages/domain/src/validation.ts` — `criterionScoreSchema`,
  `rubricCriterionSchema` (title, description, points > 0, sortOrder)
- `packages/application/src/services/assignment-service.ts` —
  `gradeSubmissionWithRubric(actor, { submissionId, scores, feedback })`
- `packages/application/src/services/academic-operations-service.ts` — accept real
  per-criterion points in `createRubric`
- `packages/application/src/services/agent-run-service.ts:174-190` — real `rubricFields`
- `apps/web/app/submissions/[id]/page.tsx`, `apps/web/app/rubrics/page.tsx`,
  `apps/web/lib/actions.ts`

### Tests

- Unit: `calculateGradeSummary` counts a `Late`-unscored item in the denominator;
  a `Missing` item still does; a graded item is unaffected.
- Unit: `calculateRubricScore` with one criterion over its max returns it in
  `invalidScores` and excludes it from the total.
- Integration: saving 4 criterion scores produces 4 rows, one submission update,
  and exactly one audit event; re-saving updates rather than duplicating
  (the unique constraint).

### Out of scope

Rubric templates, reusing a rubric across assignments, student-visible rubric view
(US-09 shows the totals only).

---

## US-07 — Section-roster attendance entry

**Size** M · **Depends on** US-02

**As a** teacher
**I want** to take attendance for a whole class in one screen
**so that** I am not submitting a form once per student per day.

### Context

`/attendance` (`attendance/page.tsx:65-73`) has a single-record form: pick a
student, pick a section, pick a teacher, pick a date, submit. For a 28-student
Biology section that is 28 form submissions, and nothing stops you recording
attendance for a student who is not enrolled in the section you picked.

`AttendanceRecord` is unique on `[studentId, classSectionId, date]` and
`attendanceService.recordAttendance` already upserts on that key, so the write
side is ready for a bulk caller.

### Acceptance criteria

1. New route `/sections/[id]/attendance?date=YYYY-MM-DD` listing every
   `Enrolled` student in that section with Present/Absent/Tardy/Excused radios,
   defaulting to Present, plus an optional per-student note.
2. One submit writes them all in a single transaction, upserting on the unique
   key so re-submitting the same date corrects rather than fails.
3. Existing records for that date pre-select their current status, so the page
   doubles as an edit view.
4. A date stepper (‹ prev day, next day ›) and a warning when the chosen date
   falls outside the section's `AcademicTerm` — use `isDateWithinRange`
   (`domain/src/academic-calendar.ts:49`), which is currently uncalled.
5. Attempting to record attendance for a student **not enrolled** in the section
   is rejected with a `VALIDATION_ERROR`. Add
   `canRecordAttendance({ enrollmentStatus, sectionStatus, date, termRange })` to
   `packages/domain/src/attendance.ts`.
6. A summary strip above the roster: present / absent / tardy / excused counts for
   the day, plus each student's running `concernLevel` from `summarizeAttendance`.
7. **Streak accuracy:** `findLongestAbsenceStreak` (`attendance.ts:46`) counts
   consecutive *records*, so a Friday and the following Monday register as a
   2-day streak. Take an optional list of session dates (the section's scheduled
   days) so a gap with no session does not break — and a genuine weekend does not
   join — a streak.
8. **Baseline fix:** `historicalAverageIssuePoints` is hardcoded to `2` for every
   target (`agent-run-service.ts:388, 401`). Compute it from that student's or
   section's records outside the analysis window instead.

### Files to touch

- `packages/domain/src/attendance.ts` — `canRecordAttendance`, session-aware streaks
- `packages/application/src/services/attendance-service.ts` — `recordSectionAttendance`
- `packages/application/src/queries/` — `getSectionAttendanceSheet(sectionId, date)`
- `packages/application/src/services/agent-run-service.ts` — real baseline
- `apps/web/app/sections/[id]/attendance/page.tsx` *(new)*, `apps/web/lib/actions.ts`
- `apps/web/app/sections/[id]/page.tsx` — link to it

### Tests

- Unit: session-aware streak — `[Fri Absent, Mon Absent]` with `Mon` as the next
  session is a streak of 2; with an intervening Wednesday session marked Present
  it is 1.
- Unit: `canRecordAttendance` rejects a `Dropped` enrollment and a date outside the term.
- Integration: submitting 28 rows twice yields 28 records, updated not duplicated.

### Out of scope

Attendance import, bell schedules, period-level attendance.

---

## US-08 — Guardian portal

**Size** M · **Depends on** US-02

**As a** parent or guardian
**I want** to see my own child's progress and manage my contact preferences
**so that** I am not dependent on someone remembering to email me.

### Context

The `Guardian` role is fully modelled and completely inert. There is a `Guardian`
table with a `userId` link, a `StudentGuardian` join carrying `isPrimary`,
`receivesDigest` and `emergencyContact`, `Notification` rows addressed to guardian
users, and a `GuardianCommunicationDraft` agent that writes to them.

And `canPerform` (`permissions.ts`) has no `Guardian` branch at all — it falls
through to `return false`. Denise Johnson can log in via the switcher and do
literally nothing, including marking her own notification read.

### Acceptance criteria

1. New `PermissionAction` values: `guardian:viewOwnStudents`,
   `guardian:updateOwnPreferences`, `notification:readOwn`.
2. `canPerform` gains a `Guardian` branch allowing exactly those three, and only
   where `resource.studentId` is one of the guardian's linked students. Add
   `guardianStudentIds?: string[]` to `PermissionActor`, populated by
   `getCurrentActor()` (`current-user.ts:20`).
3. `notification:readOwn` lets any role mark a notification **addressed to them**
   as read. `markNotificationRead` checks the recipient before requiring the
   broader `notification:manage`.
4. New route `/family` — the guardian's landing page. Lists their linked students;
   selecting one shows: current course list with grade averages, recent graded
   work, attendance summary, active intervention plans (summary only), and
   delivered notifications about that student.
5. **Guardians never see**: `SupportNote` of any visibility other than `Shared`,
   any `AgentRun` output, `AuditEvent`s, `StructuredLog`s, jobs, or other
   families' students. Enforce this in the query, not the template.
6. A preferences form lets a guardian toggle `receivesDigest` on their own
   `StudentGuardian` links. `isPrimary` and `emergencyContact` remain
   staff-managed.
7. Attempting `/students/[id]` for a student they are not linked to returns the
   "no access" `EmptyState`, not a 500 and not the page.
8. The sidebar for a `Guardian` shows only Family and Notifications.

### Files to touch

- `packages/domain/src/permissions.ts` — the `Guardian` branch and the new actions
- `apps/web/lib/current-user.ts` — populate `guardianStudentIds`
- `packages/application/src/queries/guardian-query.ts` *(new)* —
  `getGuardianDashboard(actor)`, filtering `Shared` support notes only
- `packages/application/src/services/academic-operations-service.ts` —
  `updateGuardianPreferences`, recipient-aware `markNotificationRead`
- `apps/web/app/family/page.tsx` *(new)*, `apps/web/lib/navigation.ts`

### Tests

- Unit (`domain.test.ts`): a Guardian can `guardian:viewOwnStudents` for a linked
  student and cannot for an unlinked one; still cannot `submission:grade` or
  `intervention:create`.
- Integration: `getGuardianDashboard` for Denise returns Maya and only Maya, and
  excludes the `AdvisorOnly` family-communication note (`note_maya_family`).

### Out of scope

Guardian sign-up, real authentication, message replies.

---

## US-09 — Student portal: submit work and track grades

**Size** M · **Depends on** US-02

**As a** student
**I want** to see what is due and submit my work
**so that** the `Student` role does something.

### Context

`Student` is the one non-staff role with a permission — `submission:create`
scoped to their own `studentId` — and `assignmentService.submitAssignment` exists.
But there is **no UI that calls it**: `createSubmission` (`actions.ts:163`) has no
form anywhere in `apps/web/app`. Maya can log in and see the admin console.

Two domain functions written for exactly this are uncalled:
`canSubmitAssignment` (blocks `Draft` and `Closed` assignments) and
`determineSubmissionStatus`. `submitAssignment:90` instead recomputes
late-vs-on-time inline and never checks assignment status — so today a student
could submit to a `Draft` assignment they were never supposed to see.

### Acceptance criteria

1. New route `/my-courses` for a `Student` actor: enrolled sections, per-section
   grade average and performance band, and per-assignment status.
2. New route `/my-courses/[sectionId]/[assignmentId]` showing the assignment
   description, due date, points, rubric criteria (read-only, from US-06), the
   student's current status, and a submit form with content text plus an optional
   attachment URL.
3. `submitAssignment` calls `canSubmitAssignment` and rejects `Draft` and `Closed`
   assignments with the existing reason strings. `Draft` assignments never appear
   in the student's list at all.
4. `submitAssignment` uses `determineSubmissionStatus` rather than its inline
   comparison, and passes an explicit `now` so it is testable.
5. Resubmitting before the due date updates the existing row (the upsert already
   does this) and shows *"Resubmitted — replaces your previous work."*
6. After grading, the student sees score, percentage, teacher feedback, and — when
   a rubric exists — the per-criterion breakdown. They never see
   `teacherFacingGradingNotes` from the feedback agent, other students' scores, or
   the class average.
7. Students cannot reach `/students/[id]` for anyone (including themselves — that
   page is the staff editing view); their view is `/my-courses`.

### Files to touch

- `packages/application/src/services/assignment-service.ts:77-122` — use both
  domain functions
- `packages/application/src/queries/student-portal-query.ts` *(new)*
- `apps/web/app/my-courses/page.tsx`, `apps/web/app/my-courses/[sectionId]/[assignmentId]/page.tsx` *(new)*
- `apps/web/lib/navigation.ts`

### Tests

- Unit: `canSubmitAssignment` blocks `Draft` and `Closed`, allows `Closed` with
  `teacherOverride`.
- Unit: `determineSubmissionStatus` with a fixed `now` returns `Late` after the due
  date and `Submitted` before it.
- Integration: a Student actor cannot submit **for another student** —
  `assertCan` throws `FORBIDDEN`.

### Out of scope

File uploads (URL string only), rich text, group submissions, resubmission after
grading.

---

## US-10 — Roster management and waitlist promotion

**Size** M · **Depends on** —

**As a** school manager
**I want** to manage a section's roster and promote from the waitlist
**so that** a dropped seat is filled instead of sitting empty.

### Context

`decideEnrollment` (`domain/src/enrollment.ts:19`) is a genuinely good rule: it
checks student status, section status, teacher employment, duplicates, and
capacity, and returns `Waitlisted` when the caller opted in. The seed has
`section_algebra_a` at `capacity: 3` with 3 enrolled and `student_noah`
waitlisted, so the rule is visibly live.

But **nothing promotes**. Drop a student and Noah stays waitlisted forever;
there is no ordering to the waitlist and no way to see who is next.

### Acceptance criteria

1. `/sections/[id]/roster` shows two tables — Enrolled and Waitlisted — with seats
   used / capacity, and a "Promote" button on each waitlisted row.
2. Promotion re-runs `decideEnrollment` (capacity may have refilled), flips the
   row to `Enrolled`, and writes an `enrollment.promoted` audit event. It is
   refused with a clear reason if the section is full.
3. Waitlist order is `enrolledAt` ascending. The next-in-line row is visually
   marked.
4. Dropping an enrolled student surfaces *"1 seat open. N students waitlisted."*
   with a direct link to promote the next one. **Do not auto-promote** — that is a
   staffing decision, and the story is more honest about the domain if a human
   presses the button.
5. Bulk enroll: select multiple students and enroll them in one action. Each is
   decided individually; the response reports per-student outcomes rather than
   failing the whole batch on the first refusal.
6. A capacity-change guard: reducing `ClassSection.capacity` below the current
   enrolled count is refused with the count in the message.
7. Add `enrollment:promote` as a `PermissionAction`, granted to Admin and
   SchoolManager.

### Files to touch

- `packages/domain/src/enrollment.ts` — `decideWaitlistPromotion`,
  `canReduceCapacity`
- `packages/application/src/services/enrollment-service.ts` — `promoteFromWaitlist`,
  `bulkEnroll`
- `packages/application/src/queries/` — `getSectionRoster(sectionId)`
- `apps/web/app/sections/[id]/roster/page.tsx`, `apps/web/lib/actions.ts`

### Tests

- Unit: `decideWaitlistPromotion` refuses when at capacity, allows at
  capacity − 1, refuses a `Withdrawn` student.
- Integration: promote → the section has 4 enrolled and 0 waitlisted, with an
  audit event; promoting into a full section throws `CONFLICT` and changes nothing.

### Out of scope

Schedule-conflict detection, prerequisites, cross-section transfer.

---

# Epic C — Operations spine

The operational surface — jobs, notifications, logs — is where this codebase is
most convincingly "a real system" and least actually connected. These stories
close that gap.

## US-11 — Job producers, handlers, and a scheduler

**Size** L · **Depends on** US-01

**As an** operator
**I want** the system to enqueue and process its own background work
**so that** the job queue reflects reality instead of eight frozen seed rows.

### Context

`BackgroundJob` has everything: types, attempts, `maxAttempts`, payload,
`idempotencyKey` (unique), `scheduledFor`, `nextRunAt`, retry backoff via
`calculateNextRetryAt`, and a dead-letter state. `workerService.runNextJob`
processes one job per button press with a real lock and real state transitions.

Search for `backgroundJob.create` — **the only hit is the seed**. Nothing
enqueues. The queue drains and never refills, and `simulateJobFailure`
(`worker-service.ts:7`) is a hardcoded payload sniffer standing in for handlers
that do not exist. `JobType.AgentRun` is queued in the seed and, when the worker
picks it up, runs no agent.

There are also two locks for one job: `BackgroundJob.lockedAt`/`lockOwner` and the
separate `WorkerLock` row, both maintained in the same transaction, with
`canAcquireJobLock` consulting only the latter.

### Acceptance criteria

1. A typed handler registry, mirroring the agent registry's exhaustiveness trick:
   ```ts
   // packages/application/src/jobs/handlers.ts
   export const jobHandlers = {
     GuardianDigest: handleGuardianDigest,
     GradeRecalculation: handleGradeRecalculation,
     AttendanceSummary: handleAttendanceSummary,
     ReportGeneration: handleReportGeneration,
     EnrollmentSync: handleEnrollmentSync,
     EmailNotification: handleEmailNotification,
     AgentRun: handleAgentRun
   } satisfies Record<JobType, JobHandler>;
   ```
   Each handler takes `(tx, payload)`, validates the payload with a **per-type Zod
   schema**, and returns `{ ok: true }` or throws. `simulateJobFailure` is deleted;
   the seeded malformed payloads then fail through real schema validation, which is
   both more honest and keeps the Failed Job Investigation demo working.
2. A single `jobService.enqueue(actor, { type, payload, idempotencyKey, scheduledFor?, relatedIds })`
   is the only way a job is created. Enqueueing an existing `idempotencyKey` that
   is `Queued` or `Running` is a **no-op returning the existing job**, not an error
   and not a duplicate.
3. Real producers, enqueued inside the transaction of the event that caused them:
   - grading a submission → `GradeRecalculation` for the section;
   - approving a guardian-communication recommendation → `GuardianDigest`;
   - creating a notification → `EmailNotification` (US-12);
   - `agentRunService` methods gain an `enqueue: true` option → `AgentRun`.
4. `handleAgentRun` dispatches to the right `agentRunService` method by
   `payload.agentType`, so an agent can run from the queue and produces a normal
   `AgentRun` row.
5. `workerService.runNextJob` calls the handler instead of the simulator. On
   throw: `attempts + 1`, `nextRunAt = calculateNextRetryAt(...)`, status `Failed`,
   → `DeadLettered` once attempts reach `maxAttempts`. Unchanged behaviour, real cause.
6. `runNextBatch(actor, limit = 10)` processes up to N jobs, plus a
   "Run 10 jobs" button on `/worker-jobs`.
7. **One lock, not two.** Keep `WorkerLock` (it has expiry semantics); drop
   `BackgroundJob.lockedAt` and `lockOwner`. A stale lock past `expiresAt` is
   reclaimable — cover it with a test.
8. `/worker-jobs` gains a "Schedule due jobs" action that promotes
   `scheduledFor <= now` rows to runnable, and shows the next scheduled run time.

### Data model

Remove `BackgroundJob.lockedAt` and `BackgroundJob.lockOwner`. Everything else
already exists. Update the seed.

### Files to touch

- `packages/application/src/jobs/handlers.ts`, `jobs/schemas.ts` *(new)*
- `packages/application/src/services/job-service.ts` — `enqueue`
- `packages/application/src/services/worker-service.ts` — the rewrite
- `packages/db/prisma/schema.prisma` + `seed.ts`
- `apps/web/app/worker-jobs/page.tsx`, `apps/web/lib/actions.ts`

### Tests

- Unit: each handler's payload schema — including the seeded
  `{ range: "{bad-json" }` and `{ assignmentId: null }` payloads, which must fail.
- Integration: enqueueing the same `idempotencyKey` twice creates one row;
  a handler throwing three times walks Failed → Failed → DeadLettered with
  increasing `nextRunAt`; a job with an expired `WorkerLock` is reclaimable and one
  with a live lock is not.

### Out of scope

A long-running worker process, cron, multi-process concurrency, queue priorities.

---

## US-12 — Notification and recommendation inbox

**Size** L · **Depends on** US-11

**As any** user
**I want** an inbox of things addressed to me
**so that** agent recommendations and alerts reach a person instead of a table.

### Context

`/notifications` (`notifications/page.tsx`) lists **every notification for every
user** with a "Mark read" button on each. There is no per-user inbox and no unread
badge. `academicOperationsService.createNotification` exists but no Server Action
calls it, so the only notifications are the three seeded rows.
`canDeliverNotification` (`domain/src/notifications.ts:14`) is written, tested,
and uncalled.

Recommendations have a routing bug that makes this worse. In
`at-risk-agent.ts`, `Critical` and `High` both produce `owner: "Advisor"` — so the
most severe cases never land in an admin's queue, even though the output's
`escalationRecommendation` text says to escalate. And in `buildTeacherWorkloadInput`
(`agent-run-service.ts:451`), `highRiskStudentCount` counts only `level === "High"`,
silently excluding `Critical`.

### Acceptance criteria

1. `/notifications` becomes **my** inbox: notifications where `userId` is the actor,
   plus (for Guardians, from US-08) notifications about their linked students.
   Admins get an "All notifications" toggle.
2. An unread count badge in the topbar, from a single `count` query.
3. Marking read uses `notification:readOwn` (US-08). `nextNotificationStatusAfterRead`
   already correctly leaves `Failed` alone — keep that.
4. Notifications are created by real events, via `createNotification` inside the
   causing transaction:
   - a submission is graded → `GradePosted` to the student's user;
   - an assignment is published → `AssignmentDue` to enrolled students;
   - an intervention approval is decided → `InterventionUpdate` to the requester;
   - a job is dead-lettered → `JobFailure` to Admins and SchoolManagers;
   - an agent recommendation is created → `AgentRecommendation` to the users
     holding that `ownerRole`.
5. Delivery goes through the queue: `createNotification` enqueues an
   `EmailNotification` job (US-11). The handler calls `canDeliverNotification`,
   sets `Delivered` or `Failed`, and — since there is no mail provider — writes a
   structured log line (US-13) instead of sending. `Digest`-channel notifications
   are **not** delivered individually; they are picked up by the digest job.
6. **Owner routing fix:** `Critical` risk produces `owner: "Admin"`, `High` →
   `Advisor`, `Low` → `Teacher`. `highRiskStudentCount` counts `High` **and**
   `Critical`. Both are one-line changes with test updates; do them here because
   this is the story where owner routing starts to matter.
7. `/agent-recommendations` filters to the acting user's `ownerRole` by default,
   with an "All" toggle for Admin/SchoolManager. Deciding a recommendation
   notifies the run's creator.
8. `decideRecommendation` currently overwrites `rationale` with whatever it is
   passed, including `null` (`agent-operations-service.ts:74`). Preserve the prior
   rationale when none is supplied.

### Files to touch

- `packages/domain/src/notifications.ts` — `routeNotificationRecipients(type, context)`
  as a pure function
- `packages/agents/src/at-risk-agent.ts` — owner routing
- `packages/application/src/services/agent-run-service.ts:451` — Critical inclusion
- `packages/application/src/services/academic-operations-service.ts` — recipient-aware
  read, notification producers
- `packages/application/src/jobs/handlers.ts` — `handleEmailNotification`
- `apps/web/app/notifications/page.tsx`, `apps/web/app/agent-recommendations/page.tsx`,
  `apps/web/app/layout.tsx` (badge)

### Tests

- Unit: `at-risk-agent` returns `owner: "Admin"` for a Critical fixture and
  `"Advisor"` for High — extend the existing Maya-based case.
- Unit: `canDeliverNotification` refuses a recipient-less notification and one
  already `Delivered`.
- Integration: grading a submission creates exactly one `GradePosted` notification
  and one queued `EmailNotification` job.

### Out of scope

Real email/SMS transport, per-user notification preferences beyond
`receivesDigest`, web push.

---

## US-13 — Runtime structured logging

**Size** M · **Depends on** —

**As an** on-call engineer
**I want** the app to write structured logs as it runs
**so that** `/logs`, the fingerprint grouping, and the Failed Job Investigation
agent operate on real data.

### Context

`packages/observability` is a good little package. `fingerprintLog`
(`observability/src/index.ts:62`) normalises messages by replacing hex IDs with
`{id}` and digits with `{n}` before hashing, so *"Student abc123 has 3 absences"*
and *"Student def456 has 7 absences"* cluster together. That is a real production
technique.

It is called by nothing outside its own package. `/logs` reads the 9 seeded rows,
and `/logs`'s fingerprint grouping and anomaly score are therefore permanently
static. `runFailedJobInvestigationAgent` (`agent-run-service.ts:230`) searches
`StructuredLog` for evidence and finds only seed rows.

### Acceptance criteria

1. `packages/observability` gains a `logger` that **persists**:
   ```ts
   createLogger({ service, requestId, userId }): {
     debug/info/warn/error/fatal(message, { entityType?, entityId?, metadata? })
   }
   ```
   Persistence is injected (a `LogSink` interface) so `packages/observability`
   still imports no Prisma. The Prisma-backed sink lives in `packages/application`.
2. Writes are **fire-and-forget and never break the caller** — a failing log write
   is swallowed after one `console.error`. A log line must never roll back a
   business transaction, so log **outside** the `prisma.$transaction` callback.
3. Every application service logs: `info` on success with the entity id, `warn` on
   a domain refusal (`AppError` with `FORBIDDEN`/`CONFLICT`/`VALIDATION_ERROR`),
   `error` on an unexpected throw. Message text must be **stable** — put the
   variable parts in `metadata`, not the message, or fingerprinting stops working.
4. A per-request `requestId` (`crypto.randomUUID()`) is generated in
   `getCurrentActor()` and threaded through the actor context, so all logs for one
   action share it. `/logs` can filter by `requestId` (the filter bar already has
   the field).
5. Job handlers log start/finish/failure with the job id and type, so the Failed
   Job Investigation agent has genuine evidence to summarise.
6. `createStructuredLog:47` uses `Math.random()` for its id — switch to
   `crypto.randomUUID()`.
7. A `/logs` retention control: an admin-only "Delete logs older than N days"
   action, so a long-lived dev database does not accumulate forever.

### Files to touch

- `packages/observability/src/index.ts` — `createLogger`, `LogSink`, id fix
- `packages/application/src/logging.ts` *(new)* — the Prisma sink + a
  `withServiceLogging` helper wrapping service methods
- Every service in `packages/application/src/services/`
- `apps/web/lib/current-user.ts` — `requestId`
- `apps/web/app/logs/page.tsx` — `requestId` filter, retention action

### Tests

- Unit: `fingerprintLog` gives the same fingerprint for two messages differing only
  in ids/numbers, and different fingerprints for different services.
- Unit: a logger with a throwing sink does not propagate the error.
- Integration: a failed `assertCan` produces exactly one `warn` row with the actor
  id in metadata and no user-facing data in the message.

### Out of scope

Log shipping, OpenTelemetry, sampling, log-based alerting.

---

## US-14 — Guardian record consolidation

**Size** M · **Depends on** US-08

**As an** engineer
**I want** one source of truth for guardian contact details
**so that** the digest goes to the address staff actually updated.

### Context

Guardian contact information is stored twice: `Student.guardianName` /
`Student.guardianEmail` (denormalised strings, edited on the student form at
`students/[id]/page.tsx:151-152`) and the `Guardian` + `StudentGuardian` tables
(edited on `/guardians`).

`buildGuardianCommunicationDraftInput` (`agent-run-service.ts:496-497`) reads the
`Guardian` record and falls back to the `Student` strings. So updating one and not
the other silently changes which address an agent drafts to — with no error and no
warning.

### Acceptance criteria

1. `Guardian` + `StudentGuardian` become the only source of truth.
   `Student.guardianName` and `Student.guardianEmail` are removed from the schema.
2. A one-off backfill script (`packages/db/scripts/backfill-guardians.ts`) runs
   before the drop: for every student with no primary `StudentGuardian`, create or
   match a `Guardian` by email (case-insensitive), link it with
   `isPrimary: true`, `relationship: "Guardian"`, `receivesDigest: true`. The script
   is idempotent and prints a per-student summary.
3. Every student **must** have at least one guardian link. Enforce in
   `studentService.createStudent` — the create form collects guardian name and
   email and creates the link in the same transaction.
4. The student edit form replaces the two guardian text inputs with a guardian
   management panel: list linked guardians, add existing by email, create new,
   set primary, unlink (refused for the last remaining link).
5. `buildGuardianCommunicationDraftInput` loses its fallback and takes the primary
   guardian. If there is none it throws a `VALIDATION_ERROR` naming the student —
   drafting to an unknown address is worse than failing.
6. Exactly one `isPrimary` link per student. Add a partial unique index, or enforce
   it in the service by demoting the previous primary in the same transaction.
7. Seed updated; `npm run db:seed` produces identical guardian relationships with
   no denormalised fields.

### Data model

```prisma
model Student {
  // removed: guardianName, guardianEmail
}
```

### Files to touch

- `packages/db/prisma/schema.prisma`, `seed.ts`,
  `packages/db/scripts/backfill-guardians.ts` *(new)*
- `packages/domain/src/validation.ts` — `studentSchema` loses two fields, gains a
  nested `primaryGuardian` on create
- `packages/application/src/services/student-service.ts`,
  `academic-operations-service.ts`, `agent-run-service.ts:471-514`
- `apps/web/app/students/[id]/page.tsx`, `students/new/page.tsx`, `guardians/page.tsx`

### Tests

- Unit: `studentSchema` rejects a create with no guardian email.
- Integration: creating a student with an existing guardian's email links the
  existing `Guardian` rather than duplicating it; setting a second link primary
  demotes the first.

### Out of scope

Guardian merge/dedupe UI, address history, multi-household modelling.

---

## US-15 — Term and section calendar consolidation

**Size** M · **Depends on** —

**As an** engineer
**I want** `AcademicTerm` to be the only definition of when a section runs
**so that** term filters and calendar rules cannot disagree with the label.

### Context

`ClassSection` carries both `term: String` (free text, e.g. `"Fall 2026"`) and
`academicTermId: String?` (a real FK). Both are required by the section form
(`actions.ts:461-476`), both are set by the seed, and nothing keeps them in sync.
A section can read `"Spring 2027"` while pointing at the Fall 2026 term row.

Meanwhile `GradingPeriod` exists with weights, `Assignment.gradingPeriodId` is
populated by the seed, and **nothing uses the weights** — grade averages are a
flat points-earned / points-possible calculation across everything
(`grades.ts:63`).

### Acceptance criteria

1. `ClassSection.academicTermId` becomes **required**; `ClassSection.term` is
   removed. Every display of a term reads `section.academicTerm.name`.
2. A backfill matches existing `term` strings to `AcademicTerm.name` (which is
   unique) and fails loudly, listing the offenders, if any string has no match —
   silently inventing a term is worse than stopping.
3. The section form replaces the free-text term input with a select of
   `Planned`/`Active` terms.
4. Assignment due dates are validated against their section's term range using
   `isDateWithinRange`. Outside the range is a `VALIDATION_ERROR` naming the term
   and its dates.
5. Assignments select a `GradingPeriod` from the section's term, and periods
   outside the term are not offered. The field stays optional.
6. **Weighted averages:** `calculateGradeSummary` accepts an optional
   `weights: Map<gradingPeriodId, number>`. With weights, each period's percentage
   is computed separately and combined by weight; unweighted behaviour is
   unchanged when the map is absent. The gradebook shows both the weighted final
   and a per-period breakdown.
7. `/terms` shows, per term: sections, grading periods with weights (flagging
   weights that do not sum to 1), and assignment counts per period.

### Data model

```prisma
model ClassSection {
  academicTermId String        // was String?
  academicTerm   AcademicTerm  @relation(...)
  // removed: term String
}
```

### Files to touch

- `packages/db/prisma/schema.prisma`, `seed.ts`, backfill script
- `packages/domain/src/grades.ts` — weighted variant
- `packages/domain/src/academic-calendar.ts` — `validateAssignmentDueDate`,
  `validateGradingPeriodWeights`
- `packages/domain/src/validation.ts` — `classSectionSchema`, `assignmentSchema`
- `packages/application/src/services/academic-service.ts`, `assignment-service.ts`
- `packages/application/src/queries/section-gradebook-query.ts`
- Section, assignment, gradebook, and terms pages

### Tests

- Unit: weighted average across two 50%-weighted periods differs correctly from the
  flat average when the periods have different point totals.
- Unit: `validateAssignmentDueDate` rejects a date after the term ends.
- Unit: weights `[0.5, 0.4]` are flagged as not summing to 1.

### Out of scope

Multi-term sections, year-long courses spanning two terms, GPA calculation.

---

## US-16 — Weekly risk report generation and CSV export

**Size** M · **Depends on** US-11

**As a** school manager
**I want** a weekly at-risk report I can generate, read, and export
**so that** the `ReportGeneration` job type produces something real.

### Context

`JobType.ReportGeneration` exists and the seed has `job_report_timeout` with
`payload: { report: "weekly-risk", sectionId: "section_algebra_a" }` stuck in
`Retrying`. There is no report generator, no report storage, and no export
anywhere in the app. `/at-risk` computes a live queue via `getAtRiskStudentQueue`
but there is no way to snapshot it, share it, or compare it to last week.

### Acceptance criteria

1. `handleReportGeneration` (US-11) generates a weekly risk snapshot for a scope
   (whole school, one section, or one advisor's caseload) and stores it.
2. New `Report` model:
   ```prisma
   model Report {
     id          String   @id @default(cuid())
     type        String   // "weekly-risk"
     scopeType   String   // "School" | "ClassSection" | "Advisor"
     scopeId     String?
     periodStart DateTime
     periodEnd   DateTime
     payload     Json     // the rendered rows + summary
     generatedAt DateTime @default(now())
     jobId       String?
     @@index([type, periodStart])
   }
   ```
3. The snapshot holds, per student: risk score and level, primary risk areas,
   grade average, missing count, absences, active intervention count, and advisor.
   Plus school-level totals by risk band.
4. `/reports` lists generated reports; `/reports/[id]` renders one, including
   **week-over-week deltas** against the previous report of the same type and scope
   (risk score change, new entrants to High/Critical, students who improved out).
5. "Generate now" enqueues a `ReportGeneration` job with an idempotency key of
   `report:weekly-risk:{scopeId}:{isoWeek}` so double-clicking makes one report.
6. CSV export on `/reports/[id]`, `/at-risk`, and `/gradebook`, via a shared
   `toCsv(rows, columns)` in `packages/shared` with proper escaping (quotes,
   commas, newlines, and a leading `'` on values starting with `=`, `+`, `-`, `@`
   to defuse spreadsheet formula injection). Served from a route handler with
   `Content-Disposition: attachment`.
7. Report generation is **pure and testable**: `buildWeeklyRiskReport(input)` in
   `packages/domain` takes already-fetched rows and returns the payload. The
   handler only fetches and persists.

### Files to touch

- `packages/db/prisma/schema.prisma` — `Report`
- `packages/domain/src/reports.ts` *(new)* — `buildWeeklyRiskReport`, `diffReports`
- `packages/shared/src/index.ts` — `toCsv`
- `packages/application/src/jobs/handlers.ts` — `handleReportGeneration`
- `packages/application/src/queries/report-query.ts` *(new)*
- `apps/web/app/reports/page.tsx`, `reports/[id]/page.tsx`,
  `apps/web/app/api/export/[kind]/route.ts` *(new)*

### Tests

- Unit: `toCsv` escapes embedded quotes/commas/newlines and neutralises a leading `=`.
- Unit: `diffReports` identifies a student who moved Medium → High as a new entrant
  and one who left Critical as improved.
- Integration: enqueueing the same week twice yields one report row.

### Out of scope

PDF, scheduled email delivery, charts.

---

# Epic D — Agent platform

The agent layer is the reason this codebase exists, and it is where the gap
between "modelled" and "wired" is widest. These four stories close it.

## US-17 — Manifest-gated agent execution and versioning

**Size** M · **Depends on** —

**As a** platform engineer
**I want** agents to be gated by their manifest
**so that** the registry describes what actually runs, and an agent can be turned
off without a deploy.

### Context

`AgentManifest` is a complete model — `agentType`, `version`, `supportedTargets`,
`requiredPermissions`, `inputSchema`, `outputSchema`, `isActive`, unique on
`[agentType, version]`. Four rows are seeded and `/agent-ops` renders them in a
table headed "Agent Manifests".

Nothing reads it. `executeAgent(type, input)` (`registry.ts:33`) looks the agent up
in an in-memory object and runs it. `persistAgentRun` hardcodes
`agentVersion: input.agentVersion ?? "1.0.0"` and `inputSchemaVersion: "1.0.0"`
(`agent-run-service.ts:56-59`). `isActive: false` would change nothing.
`agentOperationsService.upsertManifest` exists and no Server Action calls it.

### Acceptance criteria

1. Before executing, `persistAgentRun` resolves the active manifest for the agent
   type. No active manifest → `AppError("CONFLICT", "Agent {type} has no active manifest.")`,
   and **no** `AgentRun` row is created.
2. The manifest's `requiredPermissions` are checked with `assertCan` **in addition
   to** the existing `agent:run` check. `GuardianCommunicationDraft` requires
   `agent:run` **and** `notification:manage`, per its seeded manifest — so a
   Teacher can no longer draft guardian messages, which is the intended behaviour.
3. The target type is validated against `supportedTargets`; a mismatch is a
   `VALIDATION_ERROR` naming both.
4. `AgentRun.agentVersion`, `inputSchemaVersion`, and `outputSchemaVersion` come
   from the manifest, not from hardcoded strings.
5. Highest active `version` wins when several exist (semver-aware compare, as a
   pure function in `packages/domain`, unit-tested against
   `1.0.0 / 1.0.10 / 1.2.0 / 2.0.0`).
6. `/agent-ops` becomes a control surface: activate/deactivate a manifest, and
   register a new version. Requires `agentManifest:manage` (Admin/SchoolManager).
   Every change writes an audit event — `upsertManifest` already does.
7. Manifests are **seeded for all nine agents**, not four. The registry's
   `satisfies Record<AgentType, ...>` guarantees the code side is exhaustive; add a
   startup check (or a test) that every registry entry has a matching active
   manifest, so the two cannot drift.
8. Deactivating a manifest disables that agent's run buttons across the UI (via
   US-02's capability helper) rather than letting the click fail.

### Files to touch

- `packages/domain/src/versions.ts` *(new)* — `compareSemver`, `selectActiveVersion`
- `packages/application/src/services/agent-run-service.ts:43-77` — manifest gate
- `packages/application/src/services/agent-operations-service.ts` — activate/deactivate
- `packages/db/prisma/seed.ts` — nine manifests
- `apps/web/app/agent-ops/page.tsx`, `apps/web/lib/actions.ts`

### Tests

- Unit: `selectActiveVersion` prefers `1.0.10` over `1.0.9` and ignores inactive rows.
- Integration: deactivating the `AtRiskStudentDetection` manifest makes
  `runAtRiskAgent` throw `CONFLICT` and create **no** `AgentRun`; a Teacher running
  `GuardianCommunicationDraft` gets `FORBIDDEN`.
- Test: every key of `agentRegistry` has an active seeded manifest.

### Out of scope

Runtime JSON-schema validation of agent I/O against `inputSchema`/`outputSchema`
(store them; enforcing them is a follow-up), per-tenant manifests.

---

## US-18 — Sub-agent run persistence and the trace tree

**Size** M · **Depends on** US-17

**As an** advisor acting on a Student Success Review
**I want** to see the individual agent runs that fed it
**so that** I can judge whether to trust the plan.

### Context

`StudentSuccessReview` is the orchestrator, and its sub-agent calls are invisible.
`buildStudentSuccessReviewInput` (`agent-run-service.ts:549-576`) calls
`executeAgent(...)` **inline** three times — Progress, At-Risk, Attendance — so
none of them produces an `AgentRun` row, no input snapshot, no confidence, no
trace. The outer run's `output.subagentSummaries` is the only residue.

That same function also issues **four** separate `findUniqueOrThrow` calls for the
same student (concurrently, via `Promise.all`, but still four round-trips) because
each `buildXxxInput` helper fetches its own copy.

### Acceptance criteria

1. `AgentRun` gains `parentRunId String?` with a self-relation and an index.
2. `runStudentSuccessReviewAgent` executes its three sub-agents through
   `persistAgentRun`, so each produces a real `AgentRun` row with
   `parentRunId` set to the review's id. The parent then consumes their persisted
   outputs.
3. The parent run is created **first** (status `Running`), so children can point at
   it; if a child fails, the parent is marked `Failed` with a message naming which
   sub-agent failed, and the completed children remain for inspection.
4. `/agent-runs/[id]` renders a run tree: the parent with its children indented,
   each showing agent type, status, confidence, and duration. Child pages link back
   to the parent.
5. `/agent-runs` shows only root runs by default, with a "child runs" count and a
   toggle to show all.
6. **Fetch once:** refactor the `buildXxxInput` helpers to accept an
   already-loaded student aggregate instead of each fetching their own. One query
   with the union of the includes, passed down. Behaviour must not change — the
   existing agent tests are your guard.
7. Confidence propagates: the parent's confidence is penalised when a child's
   confidence is low, so a review built on thin data reports as such. Implement as
   a pure function in `packages/agents/src/helpers.ts` and unit-test it.

### Data model

```prisma
model AgentRun {
  parentRunId String?
  parentRun   AgentRun?  @relation("AgentRunChildren", fields: [parentRunId], references: [id])
  childRuns   AgentRun[] @relation("AgentRunChildren")
  @@index([parentRunId])
}
```

### Files to touch

- `packages/db/prisma/schema.prisma`, `seed.ts` (link the seeded sub-runs to
  `agent_run_success_review` so the tree is visible immediately)
- `packages/application/src/services/agent-run-service.ts:43-77, 289-300, 549-576`
- `packages/agents/src/helpers.ts` — `confidenceFromSubagents`
- `apps/web/app/agent-runs/page.tsx`, `agent-runs/[id]/page.tsx`

### Tests

- Unit: `confidenceFromSubagents(80, [40, 90, 85])` is materially below
  `confidenceFromSubagents(80, [85, 90, 88])`.
- Integration: one success-review call creates 4 `AgentRun` rows, 3 with
  `parentRunId` set; a failing sub-agent leaves the parent `Failed` and the
  successful children intact.

### Out of scope

Arbitrary-depth nesting (one level is enough), agent-to-agent messaging,
concurrent sub-agent execution.

---

## US-19 — Agent evaluation harness

**Size** L · **Depends on** US-17

**As a** platform engineer
**I want** golden-fixture evaluations that record their results
**so that** an agent change that degrades output is caught before it ships.

### Context

`AgentEvaluation` stores `agentType`, `version`, `fixtureName`, `passed`, `score`,
`expectedOutput`, `actualOutput`. Three rows are seeded — one of them **failing**
(`missing-attendance-confidence`) — and `/agent-ops` renders them under
"Agent Evaluation Results" with a "Failed evals" stat.

The table is never written to. `agents.test.ts` has eight good behavioural tests
but they run in Vitest and record nothing, so the dashboard is theatre.

There is also a determinism leak that will make any golden-fixture harness flaky:
`nextFollowUpDate()` (`agents/src/helpers.ts:24`) calls `new Date()` internally, so
`suggestedFollowUpDate` changes with the calendar.

### Acceptance criteria

1. **Determinism first.** `nextFollowUpDate(days = 7, now = new Date())` takes an
   injected clock; every agent that calls it receives `now` through its input type.
   `persistAgentRun` passes `new Date()` once per run, so a single run is
   internally consistent. Add a repo-wide test that no file under
   `packages/agents/src` (excluding tests) contains `new Date(` or `Math.random(`.
2. Fixtures live as JSON in `packages/agents/fixtures/{agentType}/{name}.json`:
   ```json
   {
     "name": "maya-grade-concern",
     "input": { ... },
     "expected": { "requiredHumanReview": true, "tone": "Urgent" },
     "assertions": [
       { "path": "riskLevel", "op": "equals", "value": "High" },
       { "path": "confidenceScore", "op": "lessThan", "value": 75 }
     ]
   }
   ```
   Scoring is the fraction of assertions passed; `passed` requires all of them.
3. `npm run agents:eval` runs every fixture through `executeAgent`, prints a
   table, writes one `AgentEvaluation` row per fixture, and exits non-zero if any
   fixture fails — so CI (US-04) can gate on it.
4. Evaluation logic is pure and reusable:
   `evaluateFixture(fixture, actual): { passed, score, failures }` in
   `packages/agents`. The CLI only does I/O.
5. Minimum three fixtures per agent — 27 total — covering the happy path, the
   sparse-data case (confidence must drop), and the edge case that matters for
   that agent (absence streak, score outlier, exhausted retries…). The seeded
   scenarios are your starting material.
6. `/agent-ops` shows the latest evaluation run per agent+version, a pass rate, and
   a red badge when the active version has failures. Clicking a failed fixture
   shows expected vs actual side by side.
7. Re-running an evaluation does not delete history — regression over time is the
   point. Keep every row and query the latest per `(agentType, version, fixtureName)`.

### Files to touch

- `packages/agents/src/helpers.ts` — clock injection
- `packages/agents/src/evaluation.ts` *(new)* — `evaluateFixture`, path resolution,
  the assertion operators
- `packages/agents/fixtures/**` *(new)*
- `scripts/run-agent-evals.ts` *(new)*; root `package.json` script `agents:eval`
- `packages/application/src/services/agent-operations-service.ts` — `recordEvaluation`
- `apps/web/app/agent-ops/page.tsx`

### Tests

- Unit: `evaluateFixture` scores 0.5 when 1 of 2 assertions passes; each operator
  (`equals`, `contains`, `lessThan`, `greaterThan`, `arrayIncludes`) has a case.
- Unit: the no-`new Date(`/no-`Math.random(` source scan.
- Integration: `agents:eval` writes one row per fixture and exits non-zero on failure.

### Out of scope

LLM-judge scoring, fixture recording from production runs, drift detection.

---

## US-20 — New agent end to end: Term Postmortem

**Size** L · **Depends on** US-17, US-19

**As a** school manager closing out a term
**I want** an agent that reviews the whole term and tells me what to change
**so that** the next term starts from evidence instead of memory.

### Context

This is the capstone: it exercises every layer in one vertical slice — a new
`AgentType`, new domain aggregation, a new agent, a manifest, evaluation fixtures,
recommendations routed to an owner, a background job, and a UI surface.

`AcademicTermStatus` already has `Closed` and `Archived`, and nothing ever
transitions a term into them. Term close-out is genuinely missing from the product.

### Acceptance criteria

1. New `AgentType` value `TermPostmortem` in **both**
   `packages/shared/src/index.ts` and the Prisma enum, plus a registry entry — the
   `satisfies` constraint means TypeScript will not compile until the
   implementation exists.
2. New `AgentTargetType` value `AcademicTerm`.
3. Input (built in `agent-run-service.ts`, aggregated by pure domain functions):
   per-section grade distributions and class averages, completion and missing-work
   rates, attendance concern counts by section, intervention outcomes
   (Completed vs still Active at term end), teacher workload scores, agent-run
   volume and recommendation acceptance rate for the term, and job failure counts.
4. Output:
   ```ts
   interface TermPostmortemOutput {
     executiveSummary: string;
     sectionHighlights: Array<{ sectionId: string; headline: string; average: number | null }>;
     sectionsNeedingReview: Array<{ sectionId: string; reason: string }>;
     interventionEffectiveness: { completed: number; abandoned: number; narrative: string };
     staffingObservations: string[];
     dataQualityIssues: string[];      // ungraded work at term end, missing attendance, dead-lettered jobs
     recommendationsForNextTerm: string[];
     nextTermReadiness: "Ready" | "NeedsWork" | "Blocked";
   }
   ```
5. Deterministic, pure, no `new Date()`, thresholds expressed as named constants at
   the top of the file rather than magic numbers inline.
6. Recommendations route by owner: capacity and staffing → `Admin`; grading backlog
   → `Teacher`; unresolved interventions → `Advisor`. They flow into the US-12
   inbox automatically via `persistAgentRun`.
7. **Term close-out workflow**: `/terms/[id]` gains a "Close term" action that
   requires `term:manage`, refuses while any submission in the term is ungraded
   (listing them), runs the postmortem agent, and only then sets the term to
   `Closed`. Closed terms reject new assignments and attendance records.
8. Manifest seeded and active (US-17), version `1.0.0`, `supportedTargets: ["AcademicTerm"]`,
   `requiredPermissions: ["agent:run", "term:manage"]`.
9. Three evaluation fixtures (US-19): a healthy term, a term with a grading backlog
   and unresolved interventions, and a sparse term where confidence must drop below 60.
10. Enqueueable as an `AgentRun` job (US-11), so closing a large term does not block
    the request.

### Files to touch

- `packages/shared/src/index.ts`, `packages/db/prisma/schema.prisma` — enum values
- `packages/domain/src/term-analysis.ts` *(new)* — the pure aggregations
- `packages/agents/src/term-postmortem-agent.ts` *(new)*, `types.ts`, `registry.ts`
- `packages/agents/fixtures/TermPostmortem/*.json` *(new)*
- `packages/application/src/services/agent-run-service.ts` — `buildTermPostmortemInput`
- `packages/application/src/services/academic-operations-service.ts` — `closeTerm`
- `packages/db/prisma/seed.ts` — manifest + a demo run on Fall 2026
- `apps/web/app/terms/[id]/page.tsx` *(new)*, `apps/web/lib/actions.ts`

### Tests

- Unit (`agents.test.ts`): the seeded Fall 2026 shape yields
  `nextTermReadiness: "NeedsWork"`, flags `section_algebra_a` for review, and lists
  the ungraded submissions under `dataQualityIssues`.
- Unit: an empty term returns `InsufficientData`-style output with confidence < 60
  and does **not** throw.
- Integration: `closeTerm` refuses while ungraded submissions exist; after grading
  them it produces one `AgentRun` and sets the term `Closed`.

### Out of scope

Cross-term trend analysis, term rollover (copying sections into the next term),
final-grade calculation and transcripts.

---

# Appendix — traceability to `docs/11-codebase-audit-and-review.md`

The original author's audit is accurate. Every finding is claimed by a story here,
so nothing gets fixed twice or forgotten. Numbers below are the audit's own issue
numbering, which runs 1–19 continuously from "Over-Engineering" through
"Minor Issues" (the earlier 1–12 list is "What Went Well" — nothing to do there):

| Audit finding | Story |
| --- | --- |
| 1. `AgentManifest` / `AgentEvaluation` never used | US-17, US-19 |
| 2. `WorkerLock` duplicates `BackgroundJob` lock columns | US-11 |
| 3. Dual guardian storage | US-14 |
| 4. `buildStudentSuccessReviewInput` fetches the student four times | US-18 |
| 5. `packages/ui` under-delivers | accepted — document it, do not restructure |
| 6. Late-and-unscored submissions vanish from the average | US-06 |
| 7. `Critical` risk does not escalate the recommendation owner | US-12 |
| 8. `highRiskStudentCount` misses `Critical` | US-12 |
| 9. `as never` casts in Server Actions | US-01 |
| 10. Server Actions let all exceptions propagate | US-01 |
| 11. `Guardian` and `Viewer` have no permissions | US-08, US-02 |
| 12. `ClassSection.term` duplicates `AcademicTerm` | US-15 |
| 13. Sub-agent runs are not persisted | US-18 |
| 14. `findLongestAbsenceStreak` ignores school days | US-07 |
| 15. `actionSuccess` / `actionFailure` unused | US-01 |
| 16. `createStructuredLog` uses `Math.random()` | US-13 |
| 17. `historicalAverageIssuePoints` hardcoded to 2 | US-07 |
| 18. `nextFollowUpDate` is non-deterministic | US-19 |
| 19. `rubricFields` hardcoded in the feedback agent | US-06 |
