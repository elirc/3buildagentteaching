# Junior-To-Mid-Level Learning Plan

> Written before the 20-story backlog shipped. The 14-day plan below still
> works as a reading path, but several exercises in the later sections had
> since been built for real — those now say so and point at the shipped
> version, because reading a real PR and extending it teaches more than
> rebuilding it. The PR-by-PR record is `fabledocs/03-progress.md`.

## 14-Day Study Plan

Day 1: Read the README and architecture overview. Run the app and seed data.

Day 2: Read `schema.prisma`. Draw the entity relationship map.

Day 3: Read `seed.ts`. Explain the Maya scenario in your own words.

Day 4: Study `grades.ts`, `attendance.ts`, and `risk.ts`. Run tests.

Day 5: Modify one grade rule and update tests.

Day 6: Trace enrollment from UI to `decideEnrollment`.

Day 7: Add one validation test and one domain edge-case test.

Day 8: Study `agents/src/types.ts` and `registry.ts`.

Day 9: Run every agent from the UI and inspect `/agent-runs/[id]`.

Day 10: Add a small field to an agent trace and test it.

Day 11: Debug a failed job using `/jobs`, `/logs`, and `/audit-events`.

Day 12: Add a new dashboard card using existing domain logic.

Day 13: Review server actions and list where audit events are written.

Day 14: Present the architecture, risks, and extension plan as if in an interview.

## Small Code Modification Tasks

- Add a new enrollment status filter.
- Add a missing-work column to gradebook.
- Add a new structured log seed event.
- Add one more support note visibility rule test.
- Add a teacher workload threshold test.

## Debugging Exercises

- Why did a job dead-letter?
- Why is Maya high risk?
- Why did a section waitlist a student?
- Why did a submission score fail validation?
- Why did agent confidence drop?

## Agent Extension Exercises

- ~~Add a Guardian Communication Draft Agent~~ — shipped
  (`packages/agents/src/guardian-communication-agent.ts`). Instead: read it,
  then explain why US-14 removed its guardian-name fallback.
- Add a Lesson Plan Review Agent with deterministic rubric matching — still
  the best open exercise; `docs/06-extension-projects.md` now spells out the
  four shipped patterns to copy and the **Check** for done.
- ~~Add agent golden-output tests~~ — shipped (US-19: 28 fixtures,
  `npm run agents:eval` gates CI). Instead: add one fixture for an edge case
  the existing 28 miss, and watch the determinism scan hold you to the
  injected clock.
- Add an approval flag before creating interventions — still open.

## Architecture Review Exercises

- Identify logic that should stay out of React.
- Identify where RBAC is too light — read US-02's route guards and
  `assertCan` first; the easy findings are taken, the subtle ones are not.
- ~~Propose a background worker~~ — shipped (US-11: typed job handler
  registry, idempotent enqueue). Instead: read PR #22 and critique the
  decision to use one lock instead of two.
- Propose multi-tenant school support — still open, and still the best
  design exercise here.

## Data Modeling Exercises

- ~~Add terms/academic years~~ — shipped (US-15: `academicTermId` required,
  due dates validated against the term). Instead: explain what the migration
  had to do with existing sections that had only a string `term`.
- ~~Add rubrics~~ — shipped (US-06: criterion-level grading with derived
  totals). Instead: add one rubric edge-case test (all criteria unscored).
- ~~Add guardian-to-student relationships~~ — shipped (US-14, with an
  idempotent backfill). Read the backfill before writing your own anywhere.
- Add many schools or districts — still open.
- ~~Add notification delivery records~~ — shipped (US-12: per-user inbox,
  queue-driven). Instead: trace one notification from domain event to inbox
  row and name every table it touches.

## Interview Talking Points

- Modular monolith boundaries
- Domain logic independent of UI
- Deterministic mock agents as safe learning tools
- Persisted agent traceability
- Audit logs and operational debugging
- Tradeoffs of simulated auth
- How to evolve toward stronger RBAC and background workers
