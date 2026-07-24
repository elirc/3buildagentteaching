# Phase 2: Domain Expansion

Phase 2 deepens the education operations domain without changing the overall architecture. The goal was to make the app feel less like a flat CRUD system and more like an internal platform that can support term calendars, guardian communication, structured grading, notification workflows, and human review of interventions.

## What Was Added

- Academic terms and grading periods
- Normalized guardians and student-guardian links
- Assignment rubrics and rubric criterion scores
- Notification center records
- Intervention approval workflow
- New domain rules and tests for term dates, rubric scoring, approval transitions, and notification reads
- New UI pages: `/terms`, `/guardians`, `/rubrics`, `/notifications`, `/approvals`

## Why These Models

`AcademicTerm` and `GradingPeriod` give the platform real academic time boundaries. The original `ClassSection.term` string was useful for a first MVP, but strings do not let the system validate date ranges, group reports, or connect grading windows to assignments. The string field was kept for readability and backwards compatibility, while `academicTermId` was added as the normalized relationship.

`Guardian` and `StudentGuardian` normalize parent/guardian data. The original `guardianName` and `guardianEmail` fields remain on `Student` because they are simple and useful for early CRUD forms. The new normalized tables support multiple guardians, relationship type, primary contact, digest opt-in, and emergency contact semantics.

`Rubric`, `RubricCriterion`, and `SubmissionCriterionScore` make grading more realistic. They also prepare the codebase for future grading consistency and feedback agents. Rubric scoring is domain logic, not UI logic.

`Notification` records make communication observable without sending real emails. This keeps the project local and deterministic while still modeling delivery status, channels, recipients, and metadata.

`InterventionApproval` introduces a human approval gate. Agent recommendations can suggest an intervention, but user action is still required before operational records are changed.

## Schema Changes

The Prisma schema now includes:

- `AcademicTerm`
- `GradingPeriod`
- `Guardian`
- `StudentGuardian`
- `Rubric`
- `RubricCriterion`
- `SubmissionCriterionScore`
- `Notification`
- `InterventionApproval`

Existing models were extended:

- `ClassSection.academicTermId`
- `Assignment.gradingPeriodId`
- `Assignment.rubric`
- `AttendanceRecord.academicTermId`
- `Student.guardians`
- `Teacher.rubricsCreated`
- `InterventionPlan.approvals`

The migration strategy is additive. Existing rows can continue working because the new foreign keys are optional where old data may not have normalized records yet.

## Domain Rules

New rules live in `packages/domain/src`:

- `academic-calendar.ts`
  - Term end date must be after start date.
  - Grading periods must fit inside their term.
  - Grading period weight must be positive.

- `rubrics.ts`
  - Criterion scores cannot exceed criterion points.
  - Missing rubric criteria are explicitly reported.
  - Rubric scoring returns total score, total possible, percentage, missing criteria, and invalid scores.

- `approvals.ts`
  - Approval decisions move from `Requested` to a terminal status.
  - Approved, rejected, and cancelled approvals are immutable for auditability.

- `notifications.ts`
  - Notifications require a recipient.
  - Read transitions preserve failed notifications.

These rules are tested in `packages/domain/src/domain.test.ts`.

## Application Services

Phase 2 service logic lives in:

`packages/application/src/services/academic-operations-service.ts`

This service owns:

- creating academic terms
- creating grading periods
- creating guardians
- linking guardians to students
- creating rubrics with criteria
- creating notifications
- marking notifications read
- requesting intervention approval
- approving or rejecting intervention approval

The service performs permission checks with `assertCan`, applies domain rules, writes through Prisma, and emits audit events. This keeps React pages thin.

## Query Layer

`packages/application/src/queries/academic-ops-query.ts` gathers read models for the Phase 2 pages.

The query returns:

- terms with grading periods and sections
- guardians with linked students
- rubrics with assignment and criteria
- recent notifications
- intervention approvals
- summary metrics

This prevents UI pages from duplicating aggregation logic.

## UI Routes

`/terms`

Creates academic terms and grading periods. Shows term status, date range, grading periods, and attached sections.

`/guardians`

Creates guardians and links them to students. Shows relationship, primary contact, digest preference, and student links.

`/rubrics`

Creates rubrics and shows rubric criteria. If a rubric is attached to an assignment, the page can run the grading consistency agent introduced in Phase 3.

`/notifications`

Shows notification status, recipient, type, channel, and mark-read behavior.

`/approvals`

Shows intervention approval queue. Pending approvals can be approved or rejected.

Student detail pages now show normalized guardians. Assignment detail pages now show rubric criteria.

## Audit Behavior

Phase 2 actions generate audit events for:

- academic term creation
- grading period creation
- guardian creation
- student-guardian linking
- rubric creation
- notification creation and read
- intervention approval requested, approved, or rejected

This is intentionally noisy in a useful way. In real enterprise systems, audit trails are part of the product contract.

## Seed Data

The seed now includes:

- `Fall 2026` and `Spring 2027`
- Fall grading periods
- normalized guardians for Maya, Liam, Sophia, and Noah
- a Budget Model Project rubric
- rubric scores for project submissions
- a queued guardian digest notification
- an approved intervention approval for Maya

The old denormalized guardian fields remain on students so a junior engineer can compare simple and normalized modeling approaches.

## Tests

Phase 2 added tests for:

- academic term validation
- grading period date boundaries
- rubric score summary
- incomplete rubric review detection
- approval transitions
- notification read behavior

Run them with:

```bash
npm test
```

## Tradeoffs

The new term and guardian relationships are optional because the existing MVP data model already had records without them. A stricter production migration might backfill all old rows and then make some fields required.

Notifications are stored but not delivered. That is deliberate: the project avoids external APIs while still modeling real communication workflows.

Rubric score records are intentionally simple. A production system might add criterion-level descriptors, proficiency bands, calibration reviews, and moderation workflows.

## How To Extend This Phase

Good next exercises:

- Add term-aware gradebook filtering.
- Add guardian-facing limited student dashboard.
- Add notification delivery simulation with retryable jobs.
- Add approval comments and reviewer assignment.
- Add rubric edit screens and criterion ordering.
