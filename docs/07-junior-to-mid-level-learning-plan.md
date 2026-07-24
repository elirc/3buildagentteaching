# Junior-To-Mid-Level Learning Plan

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

- Add a Guardian Communication Draft Agent.
- Add a Lesson Plan Review Agent with deterministic rubric matching.
- Add agent golden-output tests.
- Add an approval flag before creating interventions.

## Architecture Review Exercises

- Identify logic that should stay out of React.
- Identify where RBAC is too light.
- Propose a background worker.
- Propose multi-tenant school support.

## Data Modeling Exercises

- Add terms/academic years.
- Add rubrics.
- Add guardian-to-student relationships.
- Add many schools or districts.
- Add notification delivery records.

## Interview Talking Points

- Modular monolith boundaries
- Domain logic independent of UI
- Deterministic mock agents as safe learning tools
- Persisted agent traceability
- Audit logs and operational debugging
- Tradeoffs of simulated auth
- How to evolve toward stronger RBAC and background workers
