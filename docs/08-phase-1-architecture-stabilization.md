# Phase 1: Architecture Stabilization

Phase 1 was about making the existing MVP easier to extend safely. The product surface stayed mostly the same, but the internal architecture changed from "pages and one giant server-action file orchestrate everything" to a cleaner request path:

`page -> server action -> application service -> domain rule/db/audit`

## Why This Phase Matters

The original codebase had good package boundaries for domain logic and agents, but `apps/web/lib/actions.ts` had become a large coordination file. That is common in early Next.js apps: server actions start small, then slowly absorb validation, authorization, database writes, audit logging, agent orchestration, and redirect behavior.

That pattern is fine for a prototype, but it becomes harder to evolve because:

- authorization is easy to forget
- multi-write operations are not consistently transactional
- pages duplicate read-model calculations
- agent persistence is mixed with UI concerns
- tests have fewer stable seams
- future features require editing one central file too often

Phase 1 creates those seams.

## What Changed

### Added `packages/application`

New package:

```text
packages/application
  src/context.ts
  src/errors.ts
  src/audit.ts
  src/services/*
  src/queries/*
```

This package owns application use cases. It is intentionally different from `packages/domain`:

- `domain` decides business rules using pure functions.
- `application` coordinates workflows using domain rules, Prisma, permissions, transactions, audit events, and agents.

This is still a modular monolith. Nothing became a microservice.

## Service Layer

The previous `actions.ts` implementation contained all write workflows. These now live in services:

- `teacherService`
- `studentService`
- `academicService`
- `enrollmentService`
- `assignmentService`
- `attendanceService`
- `supportService`
- `jobService`
- `agentRunService`

Server actions are now mostly adapters. They parse `FormData`, call a service, revalidate routes, and redirect.

Example shape:

```ts
export async function createTeacher(formData: FormData) {
  const actor = await getCurrentActor();
  const teacher = await teacherService.createTeacher(actor, parseTeacher(formData));
  revalidatePath("/teachers");
  redirect(`/teachers/${teacher.id}`);
}
```

The service owns the actual transaction:

```ts
return prisma.$transaction(async (tx) => {
  const teacher = await tx.teacher.create({ data: input });
  await createAuditEvent(tx, { ... });
  return teacher;
});
```

## Permission Model

Added:

```text
packages/domain/src/permissions.ts
```

The permission layer introduces:

- `PermissionAction`
- `PermissionActor`
- `canPerform`
- `explainPermission`

Why in `domain`? Permissions are business policy. They should be testable without Next.js, Prisma, or React.

Current examples:

- Admin can do everything.
- School Manager can manage platform records.
- Teacher can grade and manage assignments scoped to their own teacher ID.
- Student can submit only their own work.
- Advisor can create interventions for assigned students.
- Viewer and Guardian have no write permissions in this phase.

The application layer enforces permissions with:

```ts
assertCan(actor, "submission:grade", { teacherId });
```

## Actor Context

Added:

```ts
getCurrentActor()
```

in:

```text
apps/web/lib/current-user.ts
```

The older `getCurrentUser()` returned only the active simulated user. The new actor context includes role-linked IDs:

- user ID
- role
- teacher ID if the user is a teacher
- student ID if the user is a student
- advised student IDs if the user is an advisor

This makes scoped authorization possible.

## Transactions

Multi-write operations now use Prisma transactions in the service layer.

Examples:

- create teacher + audit event
- update student + audit event
- enroll student + audit event
- grade submission + audit event
- retry job + audit event
- start/complete/fail agent run + audit event

Why this matters: if a write succeeds but audit logging fails, the system should not silently lose the audit record. Transactions make the operation atomic.

## Query / Read Model Helpers

Added query helpers:

- `getDashboardSummary`
- `getAtRiskStudentQueue`
- `getStudentProfile`
- `getTeacherProfile`
- `getSectionGradebook`

These live in:

```text
packages/application/src/queries
```

Why not keep this logic in pages? Pages should compose UI. Read-model helpers can gather Prisma data and run domain calculations once, then return a view-ready model.

This reduces repeated calculations like:

- grade summary
- attendance summary
- student risk
- teacher workload
- class averages

## Error Handling

Added:

```text
packages/application/src/errors.ts
```

It includes:

- `AppError`
- `ActionResult`
- `actionSuccess`
- `actionFailure`

The current UI still mostly relies on standard server-action errors and redirects, but the typed result layer is now available for future interactive forms, toasts, modals, and API routes.

Why add it now? It gives future code a standard way to separate:

- internal error detail
- user-safe error message
- stable error code

## Tests Added

Phase 1 added tests for:

- role permissions
- action result wrapping
- user-safe application errors

Existing tests still cover:

- enrollment rules
- grade calculation
- attendance rules
- assignment/submission rules
- risk scoring
- teacher workload scoring
- job retry rules
- validation
- mock agent heuristics

## How To Read The New Flow

For a write:

1. Start in a page form.
2. Find the server action in `apps/web/lib/actions.ts`.
3. Follow the service call into `packages/application/src/services`.
4. Look for `assertCan`.
5. Look for `prisma.$transaction`.
6. Look for domain rule calls.
7. Look for audit event creation.

For a read:

1. Start in the page.
2. Find the query helper import from `@agentic-edu/application`.
3. Open the matching file in `packages/application/src/queries`.
4. Follow domain calculations into `packages/domain/src`.

## Tradeoffs

This phase intentionally did not introduce:

- real authentication
- middleware-based route guards
- complete route-level RBAC
- repository interfaces
- background workers
- API routes

Those would be reasonable later, but adding them all now would make the learning jump too large. The goal was to create a stronger spine without turning the codebase into ceremony.

## What To Practice

Good exercises after this phase:

- Add one new service method without touching page logic much.
- Add one new permission action and tests.
- Move one remaining heavy page query into `packages/application/src/queries`.
- Convert one form to use `ActionResult` instead of raw redirects/errors.
- Add an audit event to a new workflow.

## Verification

After Phase 1, run:

```bash
npm run typecheck
npm test
npm run lint
npm run build
```

The intended outcome is that the project still behaves the same from a user perspective, but is easier to evolve internally.
