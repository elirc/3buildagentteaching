# Codebase Audit and Review

This document gives an honest, detailed assessment of the `agentic-education-ops` codebase — what is well-engineered, what is over-engineered, and what has correctness or design problems. References are to source files relative to the repo root.

---

## What Went Well

### 1. Clean Layered Architecture

The monorepo layers are well-separated and dependencies flow in only one direction:

```
packages/domain     ← pure functions, no DB, no framework
packages/agents     ← depends on domain, no DB
packages/application ← depends on domain + agents + DB
apps/web            ← depends on application, renders UI
```

This means every domain function is independently testable without starting a database or a Next.js server. The `packages/domain` package has zero dependencies outside of `@agentic-edu/shared`. This is genuinely good architecture.

### 2. Domain Functions Are Pure

`calculateGradeSummary`, `scoreStudentRisk`, `summarizeAttendance`, `calculateTrend`, and `findLongestAbsenceStreak` in `packages/domain/src/` are all pure functions: they take plain data objects and return typed results with no side effects. This makes them easy to unit-test, easy to reason about, and safe to call from agents without worrying about DB state.

### 3. `persistAgentRun` Is Excellent Infrastructure

`packages/application/src/services/agent-run-service.ts` contains a single generic helper `persistAgentRun<TInput, TOutput>` that handles the full lifecycle of an agent execution:

- Creates the `AgentRun` record in a transaction with status `Running`
- Writes an audit event for the start
- Executes the agent synchronously
- On success: updates the run to `Succeeded`, persists the output, creates `AgentRecommendation` rows, and audits the completion
- On failure: updates the run to `Failed`, stores the error message, and audits the failure

Every individual `runXxxAgent` method is then just 5–6 lines that build input and delegate to this helper. This is the right abstraction — the lifecycle concern is solved once and reused everywhere.

### 4. Audit Trail on Every Write

Every service method that mutates data calls `createAuditEvent` inside the same `prisma.$transaction`. This means the audit log is always consistent with the data — if the transaction rolls back, there is no phantom audit entry. The `before`/`after` snapshots are serialized via `JSON.parse(JSON.stringify(value))` to strip non-serializable fields.

### 5. Permissions Are Explicit and Centralized

`packages/domain/src/permissions.ts` defines a single `canPerform(actor, action, resource)` function that answers every authorization question in the system. The `assertCan` wrapper in `packages/application/src/context.ts` throws immediately on denial. No service method performs ad-hoc role checks inline — they all go through this one gate.

### 6. `agentRegistry` Uses `satisfies` for Exhaustiveness

```ts
export const agentRegistry = {
  StudentProgressSummary: studentProgressSummaryAgent,
  // ...
} satisfies Record<AgentType, AgentDefinition<unknown, unknown>>;
```

The `satisfies` keyword gives compile-time verification that every `AgentType` value has a corresponding entry in the registry, while preserving the narrower types of each entry. If a new `AgentType` is added to `shared` without adding it to the registry, TypeScript will error at build time. This is the correct way to handle this pattern.

### 7. Zod Schemas Are the Single Source of Truth for Input Types

Validation schemas in `packages/domain/src/validation.ts` use `z.infer<>` to derive TypeScript types. There is no duplication of type definitions — the schema is both the runtime validator and the compile-time type. The forms in `apps/web/lib/actions.ts` parse directly against these schemas before passing data to services.

### 8. Tests Check Behavioral Invariants, Not Just Shapes

`packages/agents/src/agents.test.ts` tests are written around realistic named scenarios ("Maya-like data", "Nina Patel's heavy grading load"). The assertions check business-level invariants:
- `interventionRecommended === true` for a student on probation with 4 missing assignments
- `recommendedIntervention.contains("active intervention")` when one exists (to prevent duplicate plans)
- `anomalyType === "AbsenceStreak"` for three consecutive absences
- `requiredHumanReview === true` for urgent guardian outreach

This style of test is far more valuable than testing return shapes.

### 9. Log Fingerprinting Is Solid

`packages/observability/src/index.ts:fingerprintLog` normalizes log messages by replacing hex IDs with `{id}` and all numbers with `{n}` before hashing, so `"Student abc123 has 3 absences"` and `"Student def456 has 7 absences"` produce the same fingerprint. This is a production-quality log clustering technique.

### 10. Database Indexes Are Thoughtful

The Prisma schema indexes every foreign key column used in queries and adds compound indexes where queries filter on two columns (`@@index([entityType, entityId])`, `@@index([agentType, version])`, `@@index([startedAt, endsAt])`). Unique constraints are properly placed on natural keys (`@@unique([studentId, classSectionId])`, `@@unique([assignmentId, studentId])`). The schema would not cause obvious performance issues at moderate data volumes.

### 11. Exponential Backoff in Job Retries

`packages/domain/src/jobs.ts:calculateNextRetryAt` uses `2^attempts` minutes with a 60-minute cap. This is the standard exponential backoff pattern. The logic is in the domain layer (pure function, easily testable) rather than buried in the worker service.

### 12. `confidenceFromSignals` Makes Penalization Readable

```ts
confidenceFromSignals(86, [
  input.gradeSummary.average === null ? 20 : 0,
  input.attendanceSummary.attendanceRate === null ? 15 : 0,
  input.recentSupportNotes.length === 0 ? 4 : 0
])
```

Each penalty is a conditional expression in an array. The intent is clear — "start at 86, reduce by 20 if no grade data, by 15 if no attendance data" — without needing any comments.

---

## Over-Engineering

### 1. `AgentManifest` and `AgentEvaluation` Tables Are Never Used

The Prisma schema contains two fully specified models:

- `AgentManifest` — stores `agentType`, `version`, `inputSchema`, `outputSchema`, `supportedTargets`, `requiredPermissions`, `isActive`
- `AgentEvaluation` — stores `agentType`, `version`, `fixtureName`, `passed`, `score`, `expectedOutput`, `actualOutput`

Neither model is written to or read from anywhere in the codebase. The agents simply execute via `executeAgent(type, input)` with no manifest lookup. The tests run in Vitest and write no rows to `AgentEvaluation`. These are aspirational features — a self-describing agent registry and a test harness that stores results in the DB — that were modeled but never wired up. The models add schema weight, migration overhead, and the false impression that manifest-gated execution is active.

**Recommendation:** Remove both tables until the functionality is actually implemented, or add a clear `// NOT YET IMPLEMENTED` comment in the schema so readers don't wonder why these exist.

### 2. `WorkerLock` Is Redundant with `BackgroundJob.lockedAt`/`lockOwner`

`BackgroundJob` already has `lockedAt: DateTime?` and `lockOwner: String?` columns. There is also a separate `WorkerLock` model that stores `lockedBy`, `lockedAt`, and `expiresAt` as a one-to-one relation.

In `worker-service.ts`, both are maintained simultaneously: the separate `WorkerLock` record is created, the `BackgroundJob.lockedAt` and `lockOwner` columns are also set, and then at the end of the transaction both are cleared. The lock expiry logic in `canAcquireJobLock` operates on `WorkerLock.expiresAt`, but the job model carries its own redundant copy.

Having two overlapping locking mechanisms in the same system creates confusion about which is authoritative. The `BackgroundJob` columns were probably added before the separate table and were never cleaned up.

**Recommendation:** Choose one. The separate `WorkerLock` table gives you expiry semantics and is the cleaner design. If you use it, remove `lockedAt` and `lockOwner` from `BackgroundJob`. If you prefer keeping everything on `BackgroundJob`, remove `WorkerLock`.

### 3. Dual Guardian Storage on `Student`

`Student` has both:
- `guardianName: String` and `guardianEmail: String` — direct denormalized fields
- A `StudentGuardian` junction table pointing to a full `Guardian` model with `firstName`, `lastName`, `email`, `phone`

`buildGuardianCommunicationDraftInput` in `agent-run-service.ts` explicitly falls back:
```ts
guardianName: primaryGuardian ? `${primaryGuardian.firstName} ${primaryGuardian.lastName}` : student.guardianName,
guardianEmail: primaryGuardian?.email ?? student.guardianEmail,
```

This means there are two sources of truth for guardian contact information. A user could update `Student.guardianEmail` without touching the `Guardian` record, or vice versa, and the system would silently use different addresses depending on which path is taken.

**Recommendation:** Pick one model. If guardians are first-class records (they have their own login, receive digests, etc.), use the `Guardian`/`StudentGuardian` tables exclusively and remove `Student.guardianName`/`guardianEmail`. If they are just contact metadata on students, remove the full `Guardian` model. A migration and seed update would be needed either way.

### 4. `buildStudentSuccessReviewInput` Fetches the Same Student Four Times

```ts
const [progressInput, riskInput, attendanceInput, student] = await Promise.all([
  buildStudentProgressInput(studentId, role),    // fetches student
  buildAtRiskInput(studentId),                    // fetches student again
  buildAttendanceAnomalyInput("Student", studentId), // fetches student a third time
  prisma.student.findUniqueOrThrow(...)           // fourth fetch
]);
```

Each of the three `buildXxxInput` functions does its own `prisma.student.findUniqueOrThrow` with different `include` shapes. The `Promise.all` runs them concurrently (which is good), but the database still handles four separate queries for the same student record and its relations. With Prisma you cannot currently merge these into one call with different includes, but the `buildXxxInput` helpers could be refactored to accept an already-fetched student rather than fetching it themselves.

### 5. `packages/ui` Underdelivers on Its Promise

The monorepo has a dedicated `packages/ui` package that suggests a shared component library. In practice, the components it exports (`Button`, `Card`, `Badge`, `DataTable`, `Field`, `PageHeader`, etc.) are used in `apps/web`, but the application-specific components (`agent-panel.tsx`, `dev-user-switcher.tsx`, `status-badge.tsx`) live in `apps/web/components` anyway, outside the package.

This isn't a bug, but the package boundary creates an expectation that isn't fully met. A reader setting up a second app (e.g., a mobile API consumer) would look to `packages/ui` and find only generic primitives, with all the meaningful domain-aware components missing. Either move the domain components into the package or document that `packages/ui` is intentionally primitive-only.

---

## Bugs and Correctness Issues

### 6. Late-and-Unscored Submissions Disappear from Grade Average

In `packages/domain/src/grades.ts:calculateGradeSummary`:

```ts
for (const score of scores) {
  if (score.status === "Missing") {
    missingCount += 1;
    possiblePoints += score.pointsPossible;  // adds to denominator
    continue;
  }
  if (score.status === "Late") {
    lateCount += 1;
    // falls through — no possiblePoints increment here unless score exists
  }
  if (typeof score.score === "number") {
    earnedPoints += score.score;
    possiblePoints += score.pointsPossible;
    gradedCount += 1;
  }
}
```

A submission that is `Late` with `score === null` increments `lateCount` but adds nothing to `possiblePoints`. It effectively vanishes from the average calculation. This is inconsistent with `Missing` assignments, which do add to `possiblePoints` (lowering the average). A late-but-unsubmitted assignment should likely hurt the average the same way a missing one does.

### 7. `Critical` Risk Level Doesn't Escalate Recommendation Owner

In `packages/agents/src/at-risk-agent.ts`:

```ts
recommendation(
  result.level === "Low" ? "Teacher" : "Advisor",
  recommendedIntervention,
  result.level === "Critical" || result.level === "High" ? "high" : "medium"
)
```

A `Critical` student and a `High` student both get `owner: "Advisor"`. The `escalationRecommendation` field on the output does say "Escalate to school manager and advisor within two school days" for Critical, but the persisted `AgentRecommendation.ownerRole` is still `"Advisor"` — so the recommendation inbox for an admin or school manager would never surface a Critical student's recommendation. The escalation language is only in a text field, not in the actionable ownership field.

**Recommendation:** Change the ternary to:
```ts
result.level === "Low" ? "Teacher" : result.level === "Critical" ? "Admin" : "Advisor"
```

### 8. `highRiskStudentCount` Misses `Critical` Students

In `buildTeacherWorkloadInput`:

```ts
return scoreStudentRisk(...).level === "High"
```

Only `"High"` students are counted. `"Critical"` students are excluded, which means the workload agent will underreport severe situations on a teacher's dashboard.

**Recommendation:** Change the comparison to `=== "High" || level === "Critical"`.

### 9. `as never` Casts Bypass Type Safety in Server Actions

Several Server Actions use `as never` to avoid proper typing:

```ts
// actions.ts
stringValue(formData, "status") as never   // updateInterventionStatus
stringValue(formData, "status") as never   // createAcademicTerm
stringValue(formData, "relationship") as never  // linkGuardianToStudent
```

The `as never` cast silences the TypeScript compiler without validating the runtime value. If a form submits an invalid status string, it will pass through to the database and either create a Prisma error (with a confusing stack trace) or silently store bad data depending on how Prisma handles enum mismatches.

The correct fix is already in the codebase for other fields — use a Zod `z.enum(...)` parse:
```ts
z.enum(["Draft", "Active", "Completed", "Cancelled"]).parse(stringValue(formData, "status"))
```

### 10. Server Actions Let All Exceptions Propagate to Next.js

None of the ~30 Server Actions in `apps/web/lib/actions.ts` wrap their logic in a try/catch. If `assertCan` throws a `FORBIDDEN` `AppError`, or if a Prisma unique constraint violation occurs, the exception surfaces as a generic Next.js error page rather than a usable message.

The `ActionResult<T>`, `actionSuccess`, and `actionFailure` utilities in `packages/application/src/errors.ts` exist for exactly this purpose — but they are never called. The infrastructure is there; it just isn't wired to the actions.

---

## Design Issues

### 11. Guardian and Viewer Roles Have No Permissions

`canPerform` in `packages/domain/src/permissions.ts` has explicit branches for `Admin`, `SchoolManager`, `Teacher`, `Advisor`, and `Student`. `Guardian` and `Viewer` fall through to `return false`.

For `Viewer` this is probably intentional — a read-only observer who can access the UI but cannot mutate anything. For `Guardian` it is ambiguous. Guardians have profile records, can be linked to multiple students, have a `receivesDigest` flag, and there is a `NotificationType.AgentRecommendation` that would logically be delivered to them. But they cannot do anything in the system as currently coded.

If Guardians are intentionally read-only, a comment saying so would prevent confusion. If they should be able to mark notifications read or confirm communication preferences, those cases are missing.

### 12. `ClassSection.term` Duplicates `AcademicTerm`

`ClassSection` has both a `term: String` free-text field (e.g., `"Fall 2026"`) and an optional `academicTermId` foreign key pointing to a full `AcademicTerm` record. Both represent the same concept. The seed data and the section creation form both require a `term` string even when an `academicTermId` is also provided.

This creates a consistency risk — a section could have `term = "Spring 2026"` but `academicTermId` pointing to an `AcademicTerm` named `"Fall 2026"`. Queries that filter sections by term will use whichever field the developer remembered to use.

**Recommendation:** Either make `academicTermId` non-optional and derive the display term from the relation, or remove it entirely and keep `term` as a free-text label. The current setup is the worst of both: the relation exists but is optional, so code can't rely on it always being there.

### 13. Sub-Agent Runs Inside `buildStudentSuccessReviewInput` Are Not Persisted

When `runStudentSuccessReviewAgent` runs, it calls `buildStudentSuccessReviewInput`, which internally calls:

```ts
const progress = executeAgent<StudentProgressInput, StudentProgressOutput>("StudentProgressSummary", progressInput).output;
const risk = executeAgent<AtRiskInput, AtRiskOutput>("AtRiskStudentDetection", riskInput).output;
const attendance = executeAgent<AttendanceAnomalyInput, AttendanceAnomalyOutput>("AttendanceAnomaly", attendanceInput).output;
```

These three sub-agent executions run but produce no `AgentRun` rows. From an observability perspective, if a stakeholder asks "why did the success review recommend this intervention?", there is no trace of the sub-agent runs that fed into it — only the outer `StudentSuccessReview` run's output snapshot. This makes debugging opaque.

The cleanest fix would be to run the three sub-agents via `runStudentProgressAgent`, `runAtRiskAgent`, and `runAttendanceAnomalyAgent` and then read their persisted outputs rather than executing them inline.

### 14. `findLongestAbsenceStreak` Does Not Respect School Days

`packages/domain/src/attendance.ts:findLongestAbsenceStreak` sorts records by date and counts consecutive absences in calendar order. A student absent on a Friday and the following Monday would register a streak of 2, even though Saturday and Sunday separate the absences. A streak that crosses a weekend is not a "consecutive absence streak" in the school-day sense.

This is a minor issue for a teaching codebase, but worth noting because the `AttendanceAnomaly` agent uses streak length to flag `AbsenceStreak` anomalies and recommend follow-up. A false positive streak could trigger unnecessary advisor outreach.

---

## Minor Issues

### 15. `actionSuccess` / `actionFailure` Are Defined but Never Used

`packages/application/src/errors.ts` exports `ActionResult<T>`, `actionSuccess`, and `actionFailure`. These are the right primitives for returning structured results from Server Actions to the UI. None of the Server Actions in `apps/web/lib/actions.ts` use them — they call `redirect()` on success and allow errors to propagate unhandled. The utilities are orphaned.

### 16. `createStructuredLog` Uses a Non-Cryptographic ID

```ts
id: `log_${Date.now()}_${Math.random().toString(16).slice(2)}`
```

`Math.random()` is not cryptographically random and has lower entropy than a UUID. Two log records created within the same millisecond on a fast machine could theoretically collide. `crypto.randomUUID()` is available in Node.js 14.17+ and is the standard choice for this.

### 17. `historicalAverageIssuePoints` Is Hardcoded to `2`

In `buildAttendanceAnomalyInput`, the baseline value passed to the attendance anomaly agent is always `2`:

```ts
historicalAverageIssuePoints: 2
```

The agent compares the current student's issue points against this baseline to determine whether attendance is anomalous. For a student who historically has 0 issue points, `2` overstates the baseline. For a student who regularly has 4, it understates it. Using a per-student calculated historical baseline would make the anomaly detection more accurate.

### 18. `nextFollowUpDate` Is Non-Deterministic

`packages/agents/src/helpers.ts:nextFollowUpDate` calls `new Date()` internally. This means the returned follow-up date varies by when the function is called, making the agents non-deterministic. Two invocations of the same agent with the same input a second apart will produce different `suggestedFollowUpDate` values. Tests that assert on this field must either mock `Date.now()` or avoid asserting on exact values.

A deterministic version would accept a `now: Date` parameter:
```ts
export function nextFollowUpDate(days = 7, now = new Date()): string {
```

### 19. `rubricFields` Are Hardcoded in `runAssignmentFeedbackAgent`

```ts
rubricFields: ["reasoning", "evidence", "complete", "reflection"]
```

These four strings are hardcoded in the service. The submission fetch includes `include: { assignment: true }` but does not include the assignment's rubric criteria. The feedback agent will always check for these four fields regardless of how the teacher actually structured the rubric. For a real grading workflow, this means the agent may flag "missing criteria" that the rubric doesn't actually contain, or miss criteria that are in the rubric.

---

## Summary Table

| Area | Assessment |
|---|---|
| Architecture & layering | Strong — clean dependency direction, pure domain layer |
| Agent design | Good — consistent interface, `persistAgentRun` is well-built |
| Permissions | Good — explicit, centralized, throws on failure |
| Audit trail | Strong — transactional, before/after snapshots |
| DB schema | Good — solid indexing, appropriate use of enums |
| Tests | Good — behavioral assertions, named fixtures |
| `AgentManifest` / `AgentEvaluation` | Over-engineered — modeled but unimplemented |
| `WorkerLock` vs. `BackgroundJob` lock fields | Over-engineered — duplicate locking mechanism |
| Dual guardian storage | Over-engineered — two sources of truth |
| Error handling in Server Actions | Missing — exceptions propagate uncaught |
| `as never` casts | Bug risk — bypasses input validation |
| `Critical` risk owner | Bug — should escalate to `Admin`, not just `Advisor` |
| `highRiskStudentCount` | Bug — excludes `Critical` students |
| Late-unscored grade average | Bug — assignment vanishes from denominator |
| Sub-agent observability | Design gap — inner runs leave no `AgentRun` records |
| `ClassSection.term` vs. `academicTermId` | Design inconsistency — two parallel term fields |
| `Guardian` permissions | Incomplete — role exists but has no allowed actions |
