# Phase 3: Agentic Operations

Phase 3 turns the local mock-agent system into a more realistic agent operations platform. The agents are still deterministic and local. No LLM APIs, API keys, LangChain, or external providers are used.

The main design goal was to teach how production agent systems need operational scaffolding around the model-like function: manifests, versions, persisted recommendations, human approval, evaluations, worker execution, retries, locks, and idempotency.

## What Was Added

- Agent manifests and version metadata
- Agent input and output schema version fields on `AgentRun`
- Persisted `AgentRecommendation` records
- `AgentEvaluation` records for golden-output style checks
- Background job idempotency keys, retry scheduling, lock metadata, and worker locks
- Local worker simulation service
- Guardian Communication Draft Agent
- Grading Consistency Agent
- Student Success Review Agent
- New UI pages: `/agent-ops`, `/agent-recommendations`, `/worker-jobs`

## Why Agent Manifests

An agent registry in code is enough for a toy app, but enterprise systems need to answer operational questions:

- Which version of an agent produced this output?
- What targets does this agent support?
- What permissions are required?
- What input and output contract did the run expect?
- Is this agent currently active?

`AgentManifest` answers those questions without invoking any external model.

The code registry still lives in `packages/agents/src/registry.ts`. The database manifest is an operational catalog. This split mirrors real systems where code owns execution and data owns observability/configuration.

## Agent Run Versioning

`AgentRun` now includes:

- `agentVersion`
- `inputSchemaVersion`
- `outputSchemaVersion`

The execution service defaults these to `1.0.0` when creating a run. This makes each persisted output easier to reason about later. If a heuristic changes in a future phase, old outputs can still be interpreted in context.

## New Agents

### Guardian Communication Draft Agent

File:

`packages/agents/src/guardian-communication-agent.ts`

Purpose:

Draft guardian outreach for grade concerns, attendance concerns, intervention updates, or positive progress.

Important behavior:

- Always requires human review.
- Does not send messages.
- Selects a deterministic tone: `Supportive`, `Urgent`, or `Celebratory`.
- Adds warnings when support-note context may be sensitive.

Why:

Guardian communication is high-trust and privacy-sensitive. This is a good learning example for separating draft generation from delivery and approval.

### Grading Consistency Agent

File:

`packages/agents/src/grading-consistency-agent.ts`

Purpose:

Detect basic grading consistency problems on one assignment.

Signals:

- score outliers
- missing teacher feedback
- missing rubric criterion scores

Output:

- consistency score
- outlier student ids
- feedback coverage summary
- rubric coverage summary
- recommended teacher actions

Why:

This agent teaches how structured data can support quality review without needing an LLM.

### Student Success Review Agent

File:

`packages/agents/src/student-success-review-agent.ts`

Purpose:

Act as a small local orchestrator that combines outputs from:

- Student Progress Summary Agent
- At-Risk Student Detection Agent
- Attendance Anomaly Agent

Important behavior:

- Produces a reviewable student success plan.
- Includes subagent summaries.
- Flags whether human approval is needed.
- Does not mutate intervention records directly.

Why:

This introduces orchestration without building a complex recursive agent framework too early.

## Recommendation Workflow

Agent recommendations are now persisted in `AgentRecommendation`.

When an agent run completes, `packages/application/src/services/agent-run-service.ts` maps agent recommendations into database records with:

- owner role
- action
- priority
- status
- rationale

Recommendations begin as `Proposed`.

The decision service lives in:

`packages/application/src/services/agent-operations-service.ts`

Supported transitions:

- `Proposed` to `Approved`
- `Proposed` to `Rejected`
- `Approved` to `Completed`

This prevents agents from silently changing operational state.

## Agent Evaluations

`AgentEvaluation` stores golden-output style records.

The seed data includes:

- a passing guardian draft fixture
- a passing grading consistency fixture
- a failing student success review confidence fixture

These records are not a replacement for unit tests. They model the kind of evaluation history an agent platform would show to staff or developers.

Unit tests live in:

`packages/agents/src/agents.test.ts`

## Worker Simulation

File:

`packages/application/src/services/worker-service.ts`

The worker service simulates processing one runnable job at a time.

It models:

- queued and retrying jobs
- idempotency keys
- worker locks
- lock expiration
- deterministic failure categories
- retry scheduling
- dead-letter behavior

The worker does not run in the background. The UI button on `/worker-jobs` executes one local worker step. This keeps the project easy to understand and avoids introducing a queue server.

## Background Job Schema Changes

`BackgroundJob` now includes:

- `idempotencyKey`
- `scheduledFor`
- `nextRunAt`
- `lockedAt`
- `lockOwner`
- `ignoredAt`
- `workerLock`

`WorkerLock` includes:

- `jobId`
- `lockedBy`
- `lockedAt`
- `expiresAt`

Domain rules for locking and retry timing live in:

`packages/domain/src/jobs.ts`

## UI Routes

`/agent-ops`

Shows manifests, evaluation results, recent agent runs, and operational agent metrics.

`/agent-recommendations`

Shows proposed, approved, rejected, and completed recommendations. Users with permission can approve, reject, or complete recommendations.

`/worker-jobs`

Shows runnable jobs, idempotency keys, next run times, and lock state. Includes a "Run next job" action.

Student detail pages now expose:

- Guardian Communication Draft Agent
- Student Success Review Agent

Assignment detail pages now expose:

- Grading Consistency Agent

## Permission Updates

`packages/domain/src/permissions.ts` now includes:

- `agentManifest:manage`
- `agentRecommendation:decide`
- `job:runWorker`
- `notification:manage`
- `intervention:approve`
- `rubric:manage`
- `guardian:manage`
- `term:manage`

The permissions remain intentionally lightweight. They are enough to teach RBAC boundaries while staying approachable.

## Seed Data

The seed includes:

- agent manifests for current and new agents
- successful agent runs for guardian draft, grading consistency, and student success review
- proposed and approved agent recommendations
- agent evaluation records
- queued worker jobs with idempotency keys
- retrying and failed jobs with realistic error reasons

## Tests

Phase 3 added tests for:

- guardian draft review gating
- grading consistency outlier detection
- student success review orchestration
- worker lock eligibility
- retry scheduling

Run:

```bash
npm test
```

## Important Design Choices

Agent outputs are deterministic. The system does not pretend to call an LLM.

Agent recommendations are persisted separately from agent runs because recommendations have their own lifecycle. A run is historical evidence; a recommendation is an operational task.

Worker execution is manual and local because this is a learning platform. A real queue would add more infrastructure than learning value at this stage.

Agent manifests are data records, not dynamic plugins. Code execution remains explicit through the registry.

## How A Real LLM Adapter Could Fit Later

A future adapter could implement the same `AgentDefinition<TInput, TOutput>` interface used by local agents.

To preserve safety, it should keep:

- persisted input snapshots
- persisted output snapshots
- confidence scores or calibrated uncertainty
- trace/debug output
- human approval for operational mutations
- evaluations before rollout
- deterministic fallback behavior for tests

The current architecture makes that possible without requiring it now.

## Next Extension Ideas

Good Phase 4 candidates:

- Agent orchestration dashboard with dependency graphs
- Regression risk agent for code changes
- Test gap analyzer agent
- Security/privacy review agent
- Guardian communication approval and send simulation
- Agent evaluation fixture editor
- Worker run history table
- Term-aware student success postmortem agent
