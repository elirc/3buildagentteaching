# Agentic Education Operations

Agentic Education Operations is a TypeScript modular-monolith learning project that emulates the start of a realistic internal education operations and LMS platform.

It includes teacher, student, course, section, term, guardian, enrollment, assignment, rubric, submission, gradebook, attendance, intervention, approval, notification, logs, jobs, audit, and deterministic mock-agent workflows. No Tailwind, no real LLM APIs, and no external API keys are used.

## Stack

- Next.js App Router in `apps/web`
- TypeScript, React, Node.js runtime where needed
- PostgreSQL + Prisma in `packages/db`
- Zod validation and domain rules in `packages/domain`
- Local deterministic mock agents in `packages/agents`
- Structured logging and audit helpers in `packages/observability`
- CSS variables and reusable UI components in `packages/ui`
- Shared enums and utilities in `packages/shared`

## Setup

1. Copy environment variables for Prisma commands and the Next.js app:

```bash
cp .env.example .env
cp apps/web/.env.local.example apps/web/.env.local
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
Copy-Item apps/web/.env.local.example apps/web/.env.local
```

2. Start PostgreSQL:

```bash
docker compose up -d
```

3. Install dependencies:

```bash
npm install
```

4. Generate Prisma Client and create the schema:

```bash
npm run db:generate
npm run db:push
```

5. Seed demo data:

```bash
npm run db:seed
```

6. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Useful Commands

```bash
npm run dev
npm run build
npm run typecheck
npm test
npm run db:generate
npm run db:push
npm run db:migrate
npm run db:seed
npm run db:studio
```

## Demo Users

Use the switcher in the top bar or `/settings`.

- `admin@northstar.example` - Admin
- `manager@northstar.example` - School Manager
- `nina.patel@northstar.example` - Teacher
- `maya.johnson@student.example` - Student
- `advisor@northstar.example` - Advisor
- `denise.johnson@guardian.example` - Parent/Guardian
- `viewer@northstar.example` - Viewer

## Key Pages

- `/` dashboard
- `/teachers`, `/teachers/new`, `/teachers/[id]`
- `/students`, `/students/new`, `/students/[id]`
- `/courses`, `/sections`, `/sections/[id]/roster`
- `/terms`
- `/enrollments`
- `/assignments`, `/assignments/[id]`, `/rubrics`, `/submissions/[id]`
- `/gradebook`
- `/attendance`
- `/at-risk`
- `/interventions`, `/approvals`
- `/guardians`, `/notifications`
- `/jobs`, `/jobs/[id]`, `/worker-jobs`
- `/logs`, `/logs/[id]`
- `/agent-runs`, `/agent-runs/[id]`, `/agent-ops`, `/agent-recommendations`
- `/audit-events`
- `/settings`

## Seed Scenario

The seed data tells a coherent operating story:

- Maya Johnson is enrolled in Algebra I, Biology, and English Literature.
- Maya is improving in Biology but declining in Algebra.
- Maya has missing Algebra work and a sudden absence pattern.
- The Algebra teacher has a grading backlog and workload pressure.
- A malformed attendance summary job failed.
- Maya has a normalized guardian contact, a queued guardian digest notification, and an approved Algebra intervention approval.
- The Budget Model Project has a rubric and structured criterion scores.
- Mock agents have prior runs for Maya risk, progress, guardian draft, grading consistency, student success review, and teacher workload.
- Agent recommendations and evaluation records show how human approval and regression tracking work.

## Recommended Learning Path

1. Read `docs/01-architecture-overview.md`.
2. Trace Maya from `/students/student_maya` to `packages/db/prisma/schema.prisma`.
3. Read `packages/domain/src/*.ts` and run `npm test`.
4. Read `packages/agents/src/*.ts`, then run an agent from the UI.
5. Study server actions in `apps/web/lib/actions.ts`.
6. Read `docs/08-phase-1-architecture-stabilization.md` to understand the application-service refactor.
7. Read `docs/09-phase-2-domain-expansion.md` to understand terms, guardians, rubrics, notifications, and approvals.
8. Read `docs/10-phase-3-agentic-operations.md` to understand manifests, recommendations, evaluations, and worker simulation.
9. Explore logs, jobs, audit events, and agent run detail pages.

## Known Limitations

- Auth is simulated with a development user switcher.
- RBAC is intentionally lightweight; use it as a place to extend.
- No real notification delivery, LLM calls, continuously running background workers, or external APIs.
- Prisma is configured for PostgreSQL; a running database is required for the web app.
- UI is intentionally utilitarian and learning-focused.
