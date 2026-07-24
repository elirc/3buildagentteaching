# Architecture Overview

This project is an internal education operations and learning management platform. It models records and workflows for teachers, students, courses, class sections, enrollments, assignments, submissions, grades, attendance, support notes, intervention plans, jobs, structured logs, audit events, and mock agent analysis.

## Major Modules

- `apps/web`: Next.js App Router UI, route handlers through server actions, layout, pages, and application workflows.
- `packages/db`: Prisma schema, Prisma Client singleton, and deterministic seed data.
- `packages/domain`: business rules, validations, calculations, and risk scoring.
- `packages/agents`: deterministic local mock agent framework and initial agent implementations.
- `packages/observability`: structured log helpers, audit metadata helpers, and anomaly scoring utilities.
- `packages/ui`: small reusable UI primitives and CSS-variable design system.
- `packages/shared`: shared enums, labels, role helpers, and formatting utilities.

## Modular Monolith

The app is intentionally one deployable system with clear internal module boundaries. That makes it easier to learn than microservices while still teaching production ideas:

- domain logic is isolated from React
- data access is centralized through Prisma
- agents are replaceable components with stable interfaces
- UI pages compose services rather than owning business rules
- audit, logs, and jobs are first-class operational concepts

## Data Flow

Typical write flow:

1. User submits a form in `apps/web/app/**`.
2. A server action in `apps/web/lib/actions.ts` parses form data.
3. Zod schemas and domain rules validate the request.
4. Prisma writes to PostgreSQL.
5. Audit events are written for important actions.
6. Next.js revalidates affected routes.

## Request Flow

Pages are React Server Components. They query Prisma directly for read-heavy views and call pure domain functions for derived values such as grade summaries, risk scores, attendance summaries, and workload scores.

## Where Logic Lives

- Business logic: `packages/domain/src`
- Agent logic: `packages/agents/src`
- Database schema and seed: `packages/db/prisma`
- Database client: `packages/db/src/index.ts`
- UI primitives: `packages/ui/src`
- Server actions and workflow orchestration: `apps/web/lib/actions.ts`
- Page composition: `apps/web/app`

The important rule: React pages should display and compose; domain packages should decide.
