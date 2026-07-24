# Codebase Reading Guide

This guide is for a junior-to-mid engineer learning to read a larger codebase without getting lost.

## Recommended Reading Order

1. `README.md`
2. `packages/db/prisma/schema.prisma`
3. `packages/shared/src/index.ts`
4. `packages/domain/src/grades.ts`
5. `packages/domain/src/enrollment.ts`
6. `packages/domain/src/risk.ts`
7. `packages/agents/src/types.ts`
8. `packages/agents/src/registry.ts`
9. `apps/web/lib/actions.ts`
10. `apps/web/app/page.tsx`

## Most Important Files

- `packages/db/prisma/schema.prisma`: the system map.
- `packages/db/prisma/seed.ts`: the demo story.
- `packages/domain/src/*.ts`: business rules and calculations.
- `packages/agents/src/*.ts`: deterministic agent behavior.
- `apps/web/lib/actions.ts`: workflows, writes, audit events, and agent persistence.
- `apps/web/app/**/page.tsx`: route-specific UI composition.

## Trace A Student From UI To Database

Start at `apps/web/app/students/[id]/page.tsx`. Notice it loads student enrollments, submissions, attendance, support notes, interventions, and agent runs. Then open `schema.prisma` and find the `Student` model. Follow relations to `Enrollment`, `Submission`, `AttendanceRecord`, `SupportNote`, and `InterventionPlan`.

## Trace Teacher Workload

Start at `apps/web/app/teachers/[id]/page.tsx`. It gathers active sections, students, active assignments, and ungraded submissions. Then read `packages/domain/src/workload.ts`. Finally read `packages/agents/src/teacher-workload-agent.ts` to see how the same signals become an agent output.

## Trace Assignment Submission And Grading

Start at `apps/web/app/assignments/[id]/page.tsx`, then `apps/web/app/submissions/[id]/page.tsx`. The grading action is `gradeSubmission` in `apps/web/lib/actions.ts`. The score validation rule is in `packages/domain/src/assignments.ts`.

## Trace Enrollment

Start at `/enrollments` or `apps/web/app/sections/[id]/roster/page.tsx`. The write path is `enrollStudent` in `actions.ts`. The business rules are in `packages/domain/src/enrollment.ts`.

## Trace An Agent Run

Start with a button on a student, teacher, submission, attendance, or job page. The server action builds an input snapshot, calls `executeAgent`, persists `AgentRun`, and writes audit events. Then inspect `/agent-runs/[id]`.

## Trace A Failed Job Investigation

Open `/jobs/job_attendance_malformed`. Run the failed-job investigation agent. Then read `packages/agents/src/failed-job-agent.ts` and the persisted run at `/agent-runs`.

## What To Study First

First: schema and seed data.

Second: domain tests and domain rules.

Third: server actions and agent implementations.

After that, use the UI to connect the mental model to working flows.
