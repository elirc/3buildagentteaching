# fabledocs

Engineering documentation for **Agentic Education Operations** — the modular-monolith
education operations / LMS learning codebase in this repo.

| Doc | What it's for |
| --- | --- |
| [01-app-overview.md](./01-app-overview.md) | How the app works today: layering, data model, the four flows you must understand, conventions, and an honest inventory of what is modelled but not wired up. **Read this first.** |
| [02-user-stories.md](./02-user-stories.md) | 20 detailed user stories for the next phase of work, written to be picked up cold and implemented one at a time. |

## Who these are for

A junior engineer joining this codebase who needs to (a) understand what exists
before changing it, and (b) ship the next set of features without guessing at
conventions or acceptance criteria.

## How this relates to `docs/`

The existing `docs/` folder is the **original author's** material: an architecture
tour (`01`–`05`), an extension wishlist (`06`), a learning plan (`07`), three
phase write-ups describing how the code got here (`08`–`10`), and a genuinely
good self-audit (`11-codebase-audit-and-review.md`).

`fabledocs/` is different in purpose:

- `docs/` explains **why the code is shaped the way it is**.
- `fabledocs/01` explains **what you will actually find when you open it**, including
  the parts that look finished but are not.
- `fabledocs/02` turns the wishlist in `docs/06` into work you can start on Monday.

Read `docs/11-codebase-audit-and-review.md` too — it is accurate, and
`fabledocs/02` maps most of its findings onto a specific story.

## Ground rules for anyone working in this repo

1. **Read `01-app-overview.md` §9 (Modelled but not wired) before filing a bug.**
   Several things that look broken are simply not built yet, and most are already
   covered by a story.
2. **Dependencies flow one way**: `shared → domain → agents → application → apps/web`.
   Nothing in `domain` or `agents` may import Prisma, React, or `next`. If you are
   tempted, the logic is in the wrong package.
3. **Decisions live in `packages/domain`** as pure functions returning a
   `{ allowed | valid, reason }` shape. Services enforce the decision; they do not
   re-derive it.
4. **Every write goes through an application service**, inside a
   `prisma.$transaction`, and writes an `AuditEvent` in the same transaction.
   Pages and server actions never call `prisma.*.create/update` directly.
5. **Authorization is `assertCan(actor, action, resource)`** at the top of the
   service method. No ad-hoc `if (role === "Admin")` checks anywhere else.
6. **Input is parsed by a Zod schema in `packages/domain/src/validation.ts`**
   at the server-action boundary — never deeper, and never with `as never`.
7. **Agents are deterministic and offline.** No LLM calls, no `Math.random()`, and
   no `new Date()` inside agent logic. Same input must always give the same output.
