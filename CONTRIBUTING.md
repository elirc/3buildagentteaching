# Contributing

This repo is a teaching codebase. The git history is part of the material — it is
meant to be *read*, not just to exist. Everything below is the workflow every
change follows, including the ones already merged. Open any merged PR and you
should be able to reconstruct why each line changed.

---

## 1. One story, one branch, one PR

Work is tracked as user stories in [`fabledocs/02-user-stories.md`](./fabledocs/02-user-stories.md).
Each story gets exactly one branch and one pull request.

```bash
git switch main
git pull
git switch -c feat/us-06-rubric-grading
```

**Branch naming:** `<type>/us-<nn>-<short-slug>`

| Type | When |
| --- | --- |
| `feat/` | new user-facing capability |
| `fix/` | a defect in shipped behaviour |
| `refactor/` | behaviour unchanged, structure improved |
| `chore/` | tooling, CI, dependencies, config |
| `docs/` | documentation only |

Never commit directly to `main`. The one exception is the initial import commit,
which has no PR because there was nothing to compare it against.

---

## 2. Commits: one idea each, in dependency order

A commit is not a save point. It is a unit of review. If you cannot describe a
commit in one line without the word "and", it should probably be two commits.

The house style is to commit **bottom-up through the layers**, because that is the
order a reviewer can actually follow:

```
1. test(domain):  a failing test that describes the rule      <- optional but encouraged
2. feat(domain):  the pure rule that makes it pass
3. feat(app):     the service that enforces the rule
4. feat(web):     the UI that calls the service
5. test(app):     integration coverage for the new path
6. docs:          update the story doc / README if behaviour changed
```

A reviewer reading commit 2 in isolation should see a complete, tested, pure
function. That is the whole point: **every commit compiles and every commit
passes the tests.** If you need to break that rule, say so in the commit body.

### Message format

Conventional Commits, with a scope that names the package or app:

```
<type>(<scope>): <imperative summary, <= 72 chars>

<why this change exists — not what the diff shows, the diff shows that>
<any trade-off or rejected alternative worth recording>

Refs: US-06
```

Scopes in this repo: `domain`, `agents`, `application`, `db`, `web`, `ui`,
`shared`, `observability`, `ci`, `docs`.

**Good:**

```
fix(domain): count late-unscored work in the grade denominator

calculateGradeSummary added pointsPossible to the denominator for Missing
submissions but not for Late ones with no score, so a late assignment that was
never graded silently vanished from the average instead of lowering it.

This changes seeded averages — Maya Johnson drops from 71% to 64%. That is the
correct number; the old one was flattering her by ignoring the English poetry
submission entirely.

Refs: US-06
```

**Bad:** `fix grades`, `wip`, `address feedback`, `changes per review`.

Write commit messages with `-F`, not `-m`, so the body survives the shell:

```bash
git commit -F .git/COMMIT_TEMPLATE
```

---

## 3. Pull requests

Open the PR as soon as the first commit is pushed — a draft PR is a good place to
think out loud.

```bash
git push -u origin feat/us-06-rubric-grading
gh pr create --fill-first --draft
```

### The PR body must answer four questions

1. **What changed** — one paragraph a non-author can understand.
2. **Why this design** — the decision you made and the alternative you rejected.
   This is the single most valuable part of the PR for anyone reading later.
3. **How to review it** — the order to read the commits, and the one file that
   matters most.
4. **How it was verified** — the commands you ran and what you saw, plus anything
   you deliberately did *not* test.

Use the template in [`.github/pull_request_template.md`](./.github/pull_request_template.md);
it is filled in automatically.

### Reviewing

Every PR in this repo carries a review from the author walking through the
non-obvious decisions. That is unusual in industry — normally a second person
does it — but here the review comments *are* the teaching material. When you
open a PR, leave a review comment on the two or three lines a newcomer would
misread, and explain the reasoning that is not visible in the diff.

Comment on the **why**, not the **what**. `// increments the counter` is noise.
`// possiblePoints is intentionally incremented for Missing work so unsubmitted
assignments drag the average down` is a comment worth having.

### Merging

Merge with a **merge commit**, not a squash:

```bash
gh pr merge --merge --delete-branch
```

Squashing would collapse the layered commits into one blob and destroy exactly
the structure this repo exists to demonstrate. In a production repo with noisy
history, squash is often the right call. Here it is not.

CI must be green before merge. There is no exception for "it's just a docs
change" — if CI is red, either the change is broken or CI is, and both are worth
finding out about.

---

## 4. Definition of done

Copied from the story doc, because it applies to every change:

1. Input parsed by a Zod schema in `packages/domain/src/validation.ts` at the
   server-action boundary. **No `as never` casts.**
2. New business rules are **pure functions in `packages/domain`** returning
   `{ allowed | valid, reason }`, with unit tests. Services enforce; they do not decide.
3. Writes go through an application service, inside `prisma.$transaction`, with a
   `createAuditEvent` in the same transaction.
4. Authorization is a single `assertCan(actor, action, resource)` at the top of the
   service method.
5. `packages/domain` and `packages/agents` gain **no** import of Prisma, React, or `next`.
6. Agents stay deterministic: no `Math.random()`, no `new Date()` inside agent logic.
7. `npm run verify` is green and no `any` was added to get there.
8. If the schema changed: `npm run db:generate && npm run db:push`, and the seed
   still runs clean from scratch.

---

## 5. Local setup

```bash
cp .env.example .env                              # PowerShell: Copy-Item
cp apps/web/.env.local.example apps/web/.env.local
docker compose up -d
npm install
npm run db:generate && npm run db:push && npm run db:seed
npm run dev
```

If port 5432 is already taken on your machine, set `POSTGRES_PORT` in `.env` to
something free and update the port inside `DATABASE_URL` to match. The compose
file reads `${POSTGRES_PORT:-5432}` for exactly this reason.

### Verification

```bash
npm run verify            # typecheck + unit tests. Run this before every push.
npm run verify:full       # adds lint. This is what CI runs.
npm run test:integration  # services against a real Postgres (needs the test DB up)
npm run test:e2e          # Playwright smoke over the seeded app
npm run agents:eval       # golden-fixture regression check for the agents
```

**Why `lint` is not in `verify`.** `eslint.config.mjs` extends
`next/typescript`, which turns on type-aware rules. Those rules re-typecheck the
whole project inside ESLint, and on a cold cache that measured **12m 45s** on the
reference Windows machine — against roughly 65s for the unit tests. A gate that
slow stops being run, and a gate nobody runs is worse than no gate.

So the split is deliberate: `verify` is the fast loop you actually run before
every push, and `verify:full` (with lint) runs in CI where a slow job costs
nobody's attention. If you are touching JSX or hooks, run `npm run lint` yourself
before pushing rather than waiting for CI to tell you.

---

## 6. Where to start

Read [`fabledocs/01-app-overview.md`](./fabledocs/01-app-overview.md) first — it
explains the layering rule that every one of the conventions above exists to
protect. Then pick the lowest-numbered open story.
