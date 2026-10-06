# Extension Projects

Use these as future engineering exercises.

> **Status (2026-10-06):** this wishlist predates the 20-story backlog
> (`fabledocs/02-user-stories.md`), which shipped much of it — see
> `fabledocs/03-progress.md` for the PR-by-PR record. Items below are
> marked **[shipped: US-xx]** so you extend them instead of rebuilding them.

## Agent Extensions

- Lesson plan review agent — still open
- Curriculum gap analysis agent — still open
- Guardian communication draft workflow — **[shipped: `guardian-communication-agent.ts`; US-14 removed its guardian fallback]**
- Grading consistency analyzer — **[shipped: `grading-consistency-agent.ts`]**
- Student success coach dashboard — partially covered by `student-success-review-agent.ts`
- Privacy/security review agent — still open
- Agent orchestration dashboard — **[shipped: `/agent-ops` control surface, US-17/US-19]**
- Recursive system audit agent — still open (sub-agent runs exist via US-18 `parentRunId`)
- Automatic test gap analyzer — still open
- Academic term postmortem agent — **[shipped: `term-postmortem-agent.ts`, US-20]**

## Workflow Extensions

- Intervention approval workflow — still open
- Human approval queue for agent recommendations — still open
- Real-time attendance alerts — still open
- Notification system — **[shipped: per-user inbox + queue-driven events, US-12]**
- Guardian digest scheduling — still open (guardian portal exists, US-08)
- Report generation jobs — **[shipped: snapshots + CSV with formula-injection defusal, US-16]**
- Teacher workload rebalance queue — still open (workload agent exists)

## Architecture Extensions

- Multi-tenant school/district support — still open
- Stronger RBAC policies — largely shipped (US-02 route guards, `assertCan` everywhere)
- Route-level permission middleware — still open as middleware; guards are per-service today
- Background worker process — **[shipped: typed job registry + idempotent enqueue, US-11]**
- Feature flags — still open
- Import/export jobs — CSV export shipped (US-16); import still open
- Data-quality dashboard — still open

## Testing Extensions

- Playwright smoke tests — still open
- Prisma integration tests with a test database — **[shipped: US-04, 10 tests + CI]**
- Agent golden-output regression tests — **[shipped: 28 fixtures + `npm run agents:eval` gating CI, US-19]**
- Accessibility checks — still open
- Load-test seed generation — still open

## Suggested First Extension

The old suggestion here (a Guardian Communication Draft Agent) has shipped.
The best current first extension is a **Lesson Plan Review Agent**, because
every pattern it needs now has a worked example to copy:

- deterministic rubric matching — copy the shape of
  `packages/agents/src/grading-consistency-agent.ts`
- clock injection and no randomness — the rules US-19 enforces with its
  determinism scan
- a manifest row so the gate lets it run (US-17 seeds nine; yours is the tenth)
- golden fixtures wired into `npm run agents:eval` (US-19)

**Check**: the new agent appears on `/agent-ops`, runs only when its manifest
is active, its fixtures pass in CI, and running it twice on the same input
produces byte-identical output.
