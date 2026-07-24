# Agentic Education Operations, explained

Everything in this document was read out of the source. Where a claim is
non-obvious, the file and line are cited so you can check it yourself.

**Contents**

1. [What the product is](#1-what-the-product-is)
2. [Repository layout](#2-repository-layout)
3. [The stack, and where each piece is configured](#3-the-stack-and-where-each-piece-is-configured)
4. [The layering rule — the single most important idea here](#4-the-layering-rule--the-single-most-important-idea-here)
5. [The data model](#5-the-data-model)
6. [The four flows you must understand](#6-the-four-flows-you-must-understand)
7. [Who is the user? Permissions and the simulated actor](#7-who-is-the-user-permissions-and-the-simulated-actor)
8. [The agent framework](#8-the-agent-framework)
9. [Modelled but not wired — read before filing a bug](#9-modelled-but-not-wired--read-before-filing-a-bug)
10. [Conventions you are expected to follow](#10-conventions-you-are-expected-to-follow)
11. [The seed scenario](#11-the-seed-scenario)
12. [Running it](#12-running-it)
13. [Where to start reading](#13-where-to-start-reading)

---

## 1. What the product is

Northstar Academy's **internal operations console**. Not a student-facing LMS —
a back-office tool for the people who run a school: administrators, school
managers, teachers, and advisors.

It does three things:

1. **System of record.** Teachers, students, guardians, courses, terms, sections,
   enrollments, assignments, rubrics, submissions, grades, and attendance.
2. **Operational surface.** Structured logs, background jobs with retry/dead-letter
   controls, a worker simulator, and an audit trail of every write.
3. **Agentic layer.** Nine "agents" that read the operational data and produce
   structured findings, recommendations, and drafts — every one of which is a
   **deterministic pure function**, not an LLM call.

The third point is the whole reason the codebase exists. It is a teaching
codebase for *how you build an application that agents operate inside*: how you
snapshot their inputs, persist their reasoning, version them, route their output
to a human, and require approval before anything reaches a family. The agents
being fake is deliberate — it makes every one of those questions testable.

There is no auth, no email delivery, no LLM provider, and no always-on worker
process. Those are all left as seams.

---

## 2. Repository layout

npm workspaces monorepo, one deployable app.

```
apps/
  web/                     Next.js 15 App Router — the only runnable app
    app/                   39 page routes, all React Server Components
    components/            agent-panel, dev-user-switcher, status-badge
    lib/actions.ts         40 Server Actions — the entire write surface
    lib/current-user.ts    resolves the simulated actor from a cookie
packages/
  shared/                  enums, role labels, tiny formatters. Zero deps.
  domain/                  pure business rules + Zod schemas. No Prisma, no React.
  agents/                  9 deterministic agents + registry. Depends on domain only.
  db/                      Prisma schema, client singleton, seed
  application/             services (writes) + queries (reads). The only Prisma callers.
  observability/           log fingerprinting, anomaly scoring, audit metadata helpers
  ui/                      generic React primitives (Button, Card, DataTable, Stat…)
docs/                      the original author's architecture notes and self-audit
fabledocs/                 you are here
```

Package names are `@agentic-edu/<dir>`. There is no build step between packages —
`apps/web` imports TypeScript source directly (`packages/db/package.json` exports
`./src/index.ts`), and Next transpiles it. That is why `npm run typecheck`
(`tsc -b` over the project references in `tsconfig.json`) is your real
compile gate.

### Why `packages/domain` and `packages/agents` have no database access

This is the load-bearing constraint of the whole design. Because
`calculateGradeSummary`, `scoreStudentRisk`, `summarizeAttendance`,
`decideEnrollment`, `retryJob`, and every agent are pure functions over plain
objects, the entire business-rule surface is unit-testable with no Postgres, no
Next server, and no fixtures beyond object literals. `packages/domain/src/domain.test.ts`
and `packages/agents/src/agents.test.ts` run in milliseconds and assert on
behaviour, not shapes.

Keep it that way. The moment a domain function needs a `prisma` import, the
design has been broken and every test above it gets slower.

---

## 3. The stack, and where each piece is configured

| Concern | Choice | Where |
| --- | --- | --- |
| UI / server | Next.js 15 App Router, React 19 | `apps/web` |
| Rendering | 100% React Server Components. `export const dynamic = "force-dynamic"` | `apps/web/app/layout.tsx:10` |
| Mutations | Server Actions (`"use server"`), plain `<form action={...}>`, no client JS | `apps/web/lib/actions.ts` |
| DB | PostgreSQL 16 in Docker, host port `${POSTGRES_PORT:-5432}` | `docker-compose.yml` |
| ORM | Prisma 6, `prisma db push` (no migrations directory) | `packages/db/prisma/schema.prisma` |
| Validation | Zod 3, `z.infer` for types | `packages/domain/src/validation.ts` |
| Tests | Vitest 3, run from the repo root over all packages | `npm test` |
| Styling | Hand-written CSS with custom properties. **No Tailwind.** | `packages/ui/src/styles.css`, `apps/web/app/globals.css` |

Two env files, both containing the same `DATABASE_URL`: `.env` (for the Prisma
CLI) and `apps/web/.env.local` (for the app). Copy both from their `.example`
twins.

`packages/db/src/index.ts` is the usual dev-mode Prisma singleton pinned to
`globalThis` so hot reload does not open a new connection pool per edit. It also
re-exports all of `@prisma/client`, which is why application code imports
`Prisma` types from `@agentic-edu/db` rather than from `@prisma/client` directly.

---

## 4. The layering rule — the single most important idea here

```
@agentic-edu/shared        enums + primitives            (no deps)
        ↓
@agentic-edu/domain        pure rules + Zod schemas      (no Prisma, no React)
        ↓
@agentic-edu/agents        deterministic analysis        (domain only)
        ↓
@agentic-edu/application   services + queries            (the ONLY Prisma callers)
        ↓
apps/web                   pages + server actions        (composes, never decides)
```

**What belongs where, concretely:**

- *"Can this student enroll in a full section?"* → `domain/src/enrollment.ts`.
  Returns `{ allowed, status, reason }`. Knows nothing about Prisma.
- *"Enroll them, then."* → `application/src/services/enrollment-service.ts`.
  Loads rows, calls `decideEnrollment`, throws `AppError` if refused, writes the
  row and the audit event in one transaction.
- *"Show the enroll form."* → `apps/web/app/enrollments/page.tsx` +
  `enrollStudent` in `actions.ts`. Parses `FormData`, calls the service,
  `revalidatePath`, `redirect`.

The one deliberate exception: **read-only pages may call `prisma` directly.**
Several do — `apps/web/app/attendance/page.tsx:10`,
`apps/web/app/submissions/[id]/page.tsx:12`, `apps/web/app/logs/page.tsx:17`.
Reads that are reused, or that need domain calculations, are pulled into
`packages/application/src/queries/*`. Writes have no such exception, ever.

---

## 5. The data model

`packages/db/prisma/schema.prisma`, 772 lines: 28 models, 28 enums, cuid primary
keys, `createdAt`/`updatedAt` on essentially everything, and — unusually for a
project this size — **thoughtful indexing**: every FK used in a filter has an
index, and compound indexes exist where queries filter on two columns
(`@@index([entityType, entityId])`, `@@index([agentType, version])`).

### Identity

- **`User`** — the login-ish record. `role: UserRole` is one of `Admin`,
  `SchoolManager`, `Teacher`, `Student`, `Advisor`, `Guardian`, `Viewer`.
- **`Teacher`**, **`Student`**, **`Guardian`** — the domain profiles, each with an
  optional `userId` back-link. A profile can exist with no `User` (seeded student
  `student_noah` has none).
- A student's advisor is a `User` (`Student.advisorId`), not a profile.

### Academic structure

`Course` → `ClassSection` → `Enrollment` → `Student`, with `ClassSection` also
pointing at a `Teacher` and (optionally) an `AcademicTerm`. `AcademicTerm` owns
`GradingPeriod`s, which weight `Assignment`s.

### Work and assessment

`Assignment` → `Submission` (unique on `[assignmentId, studentId]`) →
optionally `SubmissionCriterionScore` rows against a `Rubric`'s
`RubricCriterion`s. `AttendanceRecord` is unique on
`[studentId, classSectionId, date]`.

### Student support

`SupportNote` (with a `visibility` enum that genuinely gates what agents see —
see `agent-run-service.ts:314`), `InterventionPlan`, and `InterventionApproval`
(a request/review pair whose decisions are immutable once made).

### Operations

- `StructuredLog` — service, level, message, `fingerprint`, entity pointer.
- `BackgroundJob` — type, status, `attempts`/`maxAttempts`, `payload`,
  `idempotencyKey` (unique), `nextRunAt`, plus **two** locking mechanisms
  (`lockedAt`/`lockOwner` columns *and* a separate `WorkerLock` model).
- `AuditEvent` — actor, action string, entity pointer, `before`/`after` JSON.

### The agent tables

- `AgentRun` — the core one. `inputSnapshot`, `output`, `confidenceScore`,
  `trace`, `agentVersion`, `targetType`/`targetId`, who triggered it.
- `AgentRecommendation` — a proposed action with an `ownerRole` and a
  Proposed → Approved/Rejected → Completed lifecycle.
- `AgentManifest` — a self-describing registry entry (version, supported targets,
  required permissions, I/O schemas).
- `AgentEvaluation` — a stored regression-test result.

The last two are **seeded and displayed, but never written or consulted at
runtime** (see §9).

### Two known duplications

1. **Guardians are stored twice.** `Student.guardianName`/`guardianEmail` *and*
   the `Guardian` + `StudentGuardian` tables. `buildGuardianCommunicationDraftInput`
   (`agent-run-service.ts:496`) explicitly falls back from one to the other, so the
   two can silently disagree.
2. **Terms are stored twice.** `ClassSection.term` is a free-text string
   (`"Fall 2026"`) *and* `ClassSection.academicTermId` is an optional FK to a real
   `AcademicTerm`. Nothing keeps them consistent.

Both are covered by stories (US-14, US-15). Do not "fix" them casually — each
needs a data backfill.

---

## 6. The four flows you must understand

### 6.1 A page read

```
GET /students/student_maya
  → apps/web/app/students/[id]/page.tsx        (async RSC)
  → getStudentProfile(id)                       application/src/queries/student-query.ts
      → one big prisma.student.findUnique with 7 includes
      → calculateGradeSummary(...)              pure
      → summarizeAttendance(...)                pure
      → scoreStudentRisk(...)                   pure
      → 6 parallel follow-up queries (latest run per agent type, audits, advisors)
  → renders Stats, Cards, DataTables, and four <AgentPanel>s
```

Note the shape: **fetch rows, then derive everything with pure functions.**
Averages, risk scores, and attendance concern levels are never stored — they are
recomputed on every render. That is why grade logic changes are visible instantly
and why `packages/domain` gets all the tests.

`export const dynamic = "force-dynamic"` in the root layout means no page is
cached; every navigation re-queries. Fine at seed scale, a real problem at
US-03's scale.

### 6.2 A write

```
<form action={gradeSubmission}>                  submissions/[id]/page.tsx:43
  → gradeSubmission(formData)                    actions.ts:151    "use server"
      → getCurrentActor()                        current-user.ts:20  (cookie → actor)
      → assignmentService.gradeSubmission(actor, {...})
          → assertCan(actor, "submission:grade", { teacherId })   throws AppError FORBIDDEN
          → prisma.$transaction:
              findUniqueOrThrow the submission + assignment
              validateScore(score, pointsPossible)   pure → throws AppError VALIDATION_ERROR
              update the submission
              createAuditEvent(tx, { before, after })     same transaction
  → revalidatePath("/submissions/:id")
```

Four things are always true of a write in this codebase:

1. The actor is resolved from the cookie, never trusted from the form.
2. Authorization is a single `assertCan` call at the top of the service method.
3. The domain rule is a pure function returning a reason string.
4. The audit event is written **inside the same transaction** as the change, so
   the log can never disagree with the data.

One thing is never true: **error handling.** No server action has a `try`/`catch`.
An `AppError` thrown by `assertCan` becomes a Next.js error page with no usable
message. The `ActionResult`/`actionSuccess`/`actionFailure` helpers that exist
for exactly this (`application/src/errors.ts:19-37`) are called by nothing but
their own unit test. That is US-01.

### 6.3 An agent run

Every one of the nine agents goes through the same generic helper,
`persistAgentRun<TInput, TOutput>` (`application/src/services/agent-run-service.ts:43`),
and it is the best-engineered thing in the repo:

```
runAtRiskAgent(actor, studentId)
  → assertCan(actor, "agent:run", { studentId })
  → buildAtRiskInput(studentId)                  queries + domain calcs → a plain object
  → persistAgentRun:
      tx1: create AgentRun { status: Running, inputSnapshot, agentVersion } + audit "agent.started"
      executeAgent("AtRiskStudentDetection", input)      synchronous, pure
      tx2 (success): update to Succeeded { output, confidenceScore, trace }
                     + audit "agent.completed"
                     + createMany AgentRecommendation rows from result.recommendations
      tx2 (failure): update to Failed { errorMessage } + audit "agent.failed"; rethrow
```

The per-agent methods are then 5–6 lines each. The input snapshot is persisted
*before* execution, so any run can be replayed and explained after the fact —
which is the entire point of the exercise.

### 6.4 A worker tick

There is no worker process. There is a button: **Worker Jobs → "Run next job"**,
which calls `workerService.runNextJob` (`application/src/services/worker-service.ts:30`).
One click processes exactly one job:

```
find the oldest Queued|Retrying job whose nextRunAt has passed
  → canAcquireJobLock(...)             pure; refuses if an unexpired WorkerLock exists
  → create WorkerLock (5-minute expiry) + set status Running
  → simulateJobFailure(job)            pure-ish: inspects the payload for "{bad-json",
                                       "null", "permission", or a timeout signature
  → Succeeded, or Failed with calculateNextRetryAt (2^attempts minutes, capped at 60),
    or DeadLettered once attempts hit maxAttempts
  → delete the lock + audit "job.workerRan"
```

The failure simulation is deliberately deterministic: seeded job
`job_attendance_malformed` has `payload.range = "{bad-json"` and therefore fails
the same way every single time. That is what makes the Failed Job Investigation
agent demonstrable.

**Nothing in the application ever enqueues a job.** Search for
`backgroundJob.create` — the only hit is the seed. The queue is a fixed set of
eight rows that drains and never refills. That is US-11.

---

## 7. Who is the user? Permissions and the simulated actor

There is no authentication. `apps/web/components/dev-user-switcher.tsx` writes an
`active_user_id` cookie; `getCurrentActor()` (`apps/web/lib/current-user.ts:20`)
turns it into:

```ts
{ id, role, teacherId, studentId, advisedStudentIds }
```

falling back to the first `Admin` if the cookie is missing. That object is the
`ActorContext` threaded through every service call.

Authorization is one pure function — `canPerform(actor, action, resource)` in
`packages/domain/src/permissions.ts:79` — over a closed union of 29
`PermissionAction` strings. `assertCan` (`application/src/context.ts:6`) wraps it
and throws. The rules today:

| Role | What they can do |
| --- | --- |
| `Admin` | everything (first line of `canPerform`) |
| `SchoolManager` | everything on an explicit allow-list |
| `Teacher` | assignments / grading / attendance / rubrics **scoped to their own `teacherId`**, plus support notes and agent runs |
| `Advisor` | support notes, interventions, approvals, notifications, recommendation decisions — **only for students they advise** |
| `Student` | create their own submissions, nothing else |
| `Guardian` | **nothing** — falls through to `return false` |
| `Viewer` | **nothing** — falls through to `return false` |

Two consequences worth internalising before you touch anything:

- **`Guardian` is a role with a profile table, a digest opt-in flag, notification
  rows addressed to it, and zero permissions.** A guardian cannot even mark their
  own notification read (`markNotificationRead` requires `notification:manage`).
  That is US-08.
- **No page checks the role.** Grep `apps/web/app` for `getCurrentActor` — the only
  hits are `settings/page.tsx` and the switcher. Every button renders for
  everyone; the permission check happens server-side and then explodes into an
  error page. Switch to the Viewer and click anything to see it. That is US-02
  (and US-01 underneath it).

---

## 8. The agent framework

### The contract

`packages/agents/src/types.ts:38`:

```ts
interface AgentDefinition<TInput, TOutput> {
  type: AgentType;
  name: string;
  description: string;
  targetTypes: AgentTargetType[];
  run(input: TInput): AgentRunResult<TOutput>;   // synchronous. no promises.
}

interface AgentRunResult<TOutput> {
  output: TOutput;
  confidenceScore: number;          // 0-100
  findings: AgentFinding[];         // severity + title + evidence
  recommendations: AgentRecommendation[];  // owner role + action + priority
  limitations: string[];            // what this analysis cannot see
  trace: AgentTraceStep[];          // the reasoning steps, persisted
}
```

`run` is synchronous and pure. Given the same input object it must return the
same result — which is what lets `agents.test.ts` assert on exact behaviour.

### The registry

`packages/agents/src/registry.ts:13` uses `satisfies Record<AgentType, ...>`, so
adding a value to the `AgentType` union in `packages/shared` without adding the
implementation is a **compile error**. Copy that pattern when you extend it.

### The nine agents

| Agent | Target | What it produces |
| --- | --- | --- |
| `StudentProgressSummary` | Student | narrative summary, strengths/concerns, next actions |
| `AtRiskStudentDetection` | Student | risk score + level, evidence, intervention + follow-up date |
| `AssignmentFeedback` | Submission | student-facing draft + teacher grading notes |
| `AttendanceAnomaly` | Student \| ClassSection | anomaly type (`AbsenceStreak`, `TardyCluster`…) + suspected cause |
| `TeacherWorkloadInsight` | Teacher | workload score, overload indicators, admin action |
| `FailedJobInvestigation` | Job | root cause + `Retry`/`DeadLetter`/`FixPayloadThenRetry`/`Escalate` |
| `GuardianCommunicationDraft` | Student | subject + body + tone + `requiredHumanReview` |
| `GradingConsistency` | Assignment | consistency score, outlier students, coverage gaps |
| `StudentSuccessReview` | Student | orchestrator — combines three other agents into a plan |

### How "confidence" works

There is no probability here. `confidenceFromSignals(base, penalties)`
(`agents/src/helpers.ts:4`) starts from a hand-picked base and subtracts a fixed
penalty for each **missing input signal**:

```ts
confidenceFromSignals(82, [
  gradeSummary.gradedCount === 0 ? 25 : 0,
  input.attendanceRecords.length === 0 ? 20 : 0,
  input.supportNotes.length === 0 ? 5 : 0
])
```

Confidence therefore means *"how much of the evidence I wanted did I actually
get"*. That is a legitimate and readable pattern — keep it when you add agents.

### The orchestrator, and its observability hole

`StudentSuccessReview` runs three other agents. But it runs them by calling
`executeAgent(...)` **inline** inside `buildStudentSuccessReviewInput`
(`agent-run-service.ts:562-564`), which means those three executions produce **no
`AgentRun` rows**. Ask "why did the success review recommend this?" and the
sub-agent reasoning is gone. That is US-18.

---

## 9. Modelled but not wired — read before filing a bug

This codebase has an unusually high ratio of *designed* to *connected*. None of
the following is a bug; all of it is a seam left open on purpose. Knowing the
list will save you an afternoon.

| Thing | Status |
| --- | --- |
| `AgentManifest` table | Seeded (4 rows), displayed on `/agent-ops`. **Never read before running an agent.** `agentOperationsService.upsertManifest` exists but no action calls it. |
| `AgentEvaluation` table | Seeded (3 rows), displayed on `/agent-ops`. **Never written by the test suite.** |
| `StructuredLog` writes | `createStructuredLog`/`fingerprintLog` in `packages/observability` are called by **nothing outside that package**. `/logs` shows 9 seeded rows, forever. |
| `BackgroundJob` creation | Nothing enqueues. Only the seed's 8 rows exist. |
| `Notification` creation | `academicOperationsService.createNotification` exists; no server action calls it. Only `markNotificationRead` is exposed. |
| `SubmissionCriterionScore` writes | Rubrics can be created; **criterion scores cannot**. The grading UI is one score box (`submissions/[id]/page.tsx:46`). Only the seed has criterion scores. |
| `calculateRubricScore` / `getRubricScorePreview` | Implemented and unit-tested. No page calls them. |
| `canSubmitAssignment`, `determineSubmissionStatus` | Implemented and tested. `assignmentService.submitAssignment:90` recomputes late/on-time inline instead, and never checks whether the assignment is `Draft` or `Closed`. |
| `canDeliverNotification`, `isDateWithinRange`, `rubricRequiresTeacherReview` | Pure, tested, uncalled. |
| `ActionResult` / `actionSuccess` / `actionFailure` | The error-handling primitives. Used only by their own test. |
| `WorkerLock` vs `BackgroundJob.lockedAt`/`lockOwner` | Two parallel locking mechanisms, both maintained by `worker-service.ts`. `canAcquireJobLock` only consults `WorkerLock`. |
| `Student.guardianName`/`guardianEmail` | Duplicates the `Guardian` table. Both are read, with a fallback. |
| `ClassSection.term` | Duplicates `ClassSection.academicTermId`. |
| Prisma migrations | `packages/db/prisma/migrations` is gitignored and absent. The workflow is `db:push`, not `db:migrate`. |

### Traps that have already been documented

`docs/11-codebase-audit-and-review.md` is an honest self-audit by the original
author and it is correct. The findings you are most likely to trip over:

- **A `Late` submission with no score vanishes from the grade average.**
  `grades.ts:38-63` adds `pointsPossible` to the denominator for `Missing` but not
  for `Late`-and-unscored. Maya's late English poetry submission is invisible to
  her average.
- **`Critical`-risk students are routed to `Advisor`, not `Admin`**
  (`at-risk-agent.ts`), so the most severe cases never reach an admin's inbox.
- **`highRiskStudentCount` counts only `"High"`, excluding `"Critical"`**
  (`agent-run-service.ts:451`), so the workload agent under-reports the worst cases.
- **`nextFollowUpDate()` calls `new Date()` internally** (`helpers.ts:24`), so
  agents are not fully deterministic across days.
- **`historicalAverageIssuePoints: 2` is hardcoded** for every student
  (`agent-run-service.ts:388, 401`).
- **`as never` casts in `actions.ts`** (statuses, relationships) bypass validation
  entirely — a bad form value goes straight to Prisma.
- **`buildStudentSuccessReviewInput` fetches the same student four times**
  (concurrently, but still four round-trips).

Each of these maps to a story in `02-user-stories.md`.

---

## 10. Conventions you are expected to follow

**Naming.** Services are objects with async methods:
`export const teacherService = { async createTeacher(actor, input) {...} }`.
Queries are free functions: `export async function getStudentProfile(id)`.
Domain rules are verbs returning decisions: `decideEnrollment`, `canTransitionApproval`,
`validateScore`, `retryJob`.

**Decision objects.** Domain rules never throw. They return
`{ allowed: false, reason: "Section is at capacity." }` or
`{ valid: false, reason: "..." }`. The service throws, using the reason as the
user-facing message:

```ts
const decision = decideEnrollment({...});
if (!decision.allowed || !decision.status) {
  throw new AppError("CONFLICT", decision.reason ?? "Enrollment is not allowed.", input);
}
```

**Errors.** `AppError(code, userMessage, metadata)` with `code` one of
`FORBIDDEN | VALIDATION_ERROR | NOT_FOUND | CONFLICT | INTERNAL_ERROR`. The
`userMessage` is safe to show a user; `metadata` is not (it can hold IDs and
internals) and must never be rendered.

**Audit actions** are dotted, entity-first, past tense: `assignment.published`,
`submission.graded`, `job.workerRan`, `agentRecommendation.approved`. Pass
`before` and `after`; both are serialized through
`JSON.parse(JSON.stringify(value))` in `audit.ts:33` to strip non-JSON values.

**Transactions.** Every write is `prisma.$transaction(async (tx) => {...})` and
every `createAuditEvent` receives that same `tx`. Never audit outside the
transaction that made the change.

**Enums.** Declared twice on purpose: as Prisma enums in `schema.prisma`, and as
string-literal unions in `packages/shared/src/index.ts`. `domain` and `agents`
import the shared union so they never depend on generated Prisma types. When you
add an enum value you must edit **both**, then `npm run db:generate && npm run db:push`.

**UI.** Primitives (`Button`, `Card`, `CardHeader`, `DataTable`, `Field`,
`PageHeader`, `Stat`, `Badge`, `JsonBlock`, `EmptyState`) come from
`@agentic-edu/ui`. Domain-aware components (`AgentPanel`, `StatusBadge`) live in
`apps/web/components`. Style with the existing CSS custom properties and utility
classes (`stack`, `split`, `metric-row`, `grid grid-2`, `muted`) — do not add a
CSS framework.

**Tests.** Behaviour, not shape, with named realistic fixtures. Follow the
existing style:

```ts
it("at-risk agent avoids duplicate plan language when active intervention exists", ...)
```

28 test cases across three files today: `domain.test.ts` (18), `agents.test.ts` (8),
`application.test.ts` (2). There are **no database tests and no UI tests**.

---

## 11. The seed scenario

`packages/db/prisma/seed.ts` wipes everything and rebuilds a single coherent
story at **Northstar Academy**. IDs are human-readable (`student_maya`,
`teacher_algebra`, `section_algebra_a`) so you can navigate straight to
`/students/student_maya`. All dates are relative to a hardcoded
`2026-05-21T12:00:00.000Z`.

**The cast:** 13 users, 3 teachers, 4 students, 4 guardians, 4 courses,
2 terms + 2 grading periods, 3 sections, 8 enrollments, 7 assignments, 1 rubric
with 4 criteria, 13 submissions, 11 attendance records, 3 support notes,
1 intervention plan + 1 approved approval, 3 notifications, 9 logs, 8 jobs,
4 manifests, 6 agent runs, 3 recommendations, 3 evaluations, 9 audit events.

**The story — every fixture exists to make some feature demonstrable:**

- **Maya Johnson** (`student_maya`, grade 9, status `Probation`) is the protagonist.
  She is enrolled in Algebra, Biology, and English.
- She is **improving in Biology** (30/40 then 23/25) and **declining in Algebra**
  (13/20 then 16/30), so `calculateTrend` has something real to detect.
- She has **two Missing Algebra assignments** and a **five-day absence streak** in
  Algebra — enough to push `scoreStudentRisk` to High and trigger
  `AbsenceStreak` in the anomaly agent.
- Her English poetry submission is **`Late` with no score** — the fixture that
  exposes the grade-average bug in §9.
- **Nina Patel** (`teacher_algebra`) has ungraded submissions and a high-risk
  student, so the workload agent reports `Heavy`.
- **`section_algebra_a` has `capacity: 3` and 3 enrolled students**, so
  `student_noah` sits `Waitlisted` — the capacity rule is live, not theoretical.
- **`job_attendance_malformed`** carries `payload.range = "{bad-json"` and
  therefore fails deterministically forever. Three other jobs are Failed,
  Retrying, and DeadLettered respectively.
- Maya has an **Active intervention plan** with an **Approved** approval, a
  **Queued guardian digest** notification, and a **Proposed** recommendation
  awaiting an advisor.
- One seeded `AgentEvaluation` **fails** (`missing-attendance-confidence`), so
  `/agent-ops` shows a red regression out of the box.

When you change grade or risk logic, re-run the seed and check Maya's page —
if her numbers do not move, your change did not do what you thought.

---

## 12. Running it

```bash
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local   # PowerShell: Copy-Item
docker compose up -d          # Postgres 16 on :5432
npm install                   # node_modules is NOT checked in and is currently absent
npm run db:generate
npm run db:push               # no migrations directory; push is the workflow
npm run db:seed
npm run dev                   # http://localhost:3000
```

Verification loop, in the order you should run it:

```bash
npm test          # vitest, no DB needed, fast
npm run typecheck # tsc -b across all project references — the real compile gate
npm run lint      # eslint in apps/web only
npm run build     # next build
```

Also useful: `npm run db:studio` for a table browser, and `npm run test:watch`
while working in `packages/domain`.

**Repo state as of this writing:** no `node_modules`, no `prisma/migrations`, and
**no git commits** — this directory sits inside a stray repository rooted at the
Windows home directory, so `git status` here walks your entire user profile.
Initialise a real repo here before you start committing.

---

## 13. Where to start reading

In this order — it takes about an hour and it is worth it:

1. `packages/shared/src/index.ts` — every enum in the system, in 124 lines.
2. `packages/domain/src/grades.ts`, `risk.ts`, `attendance.ts` — the actual
   business rules, ~260 lines total. Then `domain.test.ts` to see them asserted.
3. `packages/domain/src/permissions.ts` — the entire authorization model.
4. `packages/db/prisma/schema.prisma` — skim the enums, read `Student`,
   `Submission`, `BackgroundJob`, `AgentRun` closely.
5. `packages/application/src/services/assignment-service.ts` — the cleanest
   example of the service pattern.
6. `packages/agents/src/types.ts` then `student-progress-agent.ts` — one whole
   agent, end to end.
7. `packages/application/src/services/agent-run-service.ts:43` (`persistAgentRun`)
   — the best code in the repo.
8. `apps/web/lib/actions.ts` — the entire write surface of the product, 40
   actions in 490 lines.
9. `apps/web/app/students/[id]/page.tsx` — how a page composes all of it.

Then open `/students/student_maya` and click every button on it.

When you are ready to build, go to [02-user-stories.md](./02-user-stories.md).
