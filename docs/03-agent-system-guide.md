# Agent System Guide

The agent system is fully local, deterministic, and mocked. It does not call OpenAI, Anthropic, LangChain, or any external API.

## Architecture

Key files:

- `packages/agents/src/types.ts`
- `packages/agents/src/registry.ts`
- `packages/agents/src/*-agent.ts`
- `apps/web/lib/actions.ts`
- `packages/db/prisma/schema.prisma` model `AgentRun`

Each agent implements:

- `type`
- `name`
- `description`
- `targetTypes`
- `run(input)`

The run result includes:

- structured output
- confidence score
- findings
- recommendations
- limitations
- trace/debug steps

## Persisted Runs

Server actions create an `AgentRun` with `Running` status, execute the deterministic agent, then update it to `Succeeded` or `Failed`. Input snapshots, outputs, confidence, and traces are persisted so engineers can debug what happened.

## Deterministic Heuristics

The agents emulate LLM-like analysis by combining:

- domain summaries
- score thresholds
- evidence lists
- recommendation templates
- confidence penalties for missing data
- trace records that explain decisions

This teaches agent architecture without adding API keys, nondeterminism, cost, or privacy risk.

## Initial Agents

- Student Progress Summary Agent
- At-Risk Student Detection Agent
- Assignment Feedback Agent
- Attendance Anomaly Agent
- Teacher Workload Insight Agent
- Failed Job Investigation Agent

## Add A New Agent

1. Define input/output types in `types.ts`.
2. Create `new-agent.ts`.
3. Implement `AgentDefinition<TInput, TOutput>`.
4. Add it to `agentRegistry`.
5. Add an action that builds an input snapshot.
6. Persist the run through the shared run lifecycle.
7. Add a page or panel.
8. Add tests.

## Future Subagents

A future orchestrator could call multiple agents, store child run IDs in trace metadata, require human approval before writes, and compare outputs against regression tests. The current registry is intentionally simple so this can be added later without rewriting every agent.

## Limitations

- No semantic understanding.
- No generated free-form reasoning.
- Template output can sound repetitive.
- Confidence scores are heuristic.
- Data quality strongly affects output quality.
