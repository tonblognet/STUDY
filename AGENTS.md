# Поступай: project instructions

## Shared source of truth

- Read `docs/EXECUTION_PLAN.md` and `docs/HANDOFF.md` before changing the project.
- Work on exactly one numbered layer at a time. Do not begin the next layer until the current pull request is merged into `main`.
- Create each layer from the latest `origin/main` and name it `codex/layer-NN-short-name`.
- Keep product decisions, acceptance criteria, and handoff evidence in the repository. Chat history is not a source of truth.
- Never copy personal Codex state, credentials, sessions, caches, or `.env` files into the repository.

## Delivery contract

- Before implementation, restate the current layer scope and inspect the affected code and tests.
- For Next.js work, read the relevant guide under `node_modules/next/dist/docs/` before editing.
- Preserve official-source provenance for admissions data. Unknown or unverified values must remain visibly unknown; never invent passing scores, prices, accreditation, military-department status, deadlines, or subject combinations.
- Add or update tests for behavior changes.
- Before handoff, run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm test:integration`, and `pnpm security:audit` in that order. The integration suite starts the production build.
- For visible UI changes, verify the affected flows at desktop and mobile widths and record the routes checked in the pull request.
- Review `git diff --check`, `git diff --stat`, and the staged diff before committing or pushing.
- Update `docs/HANDOFF.md` at every implementer-to-reviewer transfer.

## Project skills

- Use `$postupai-layer-delivery` for any numbered layer or PR handoff.
- Use `$postupai-data-integrity` whenever university, program, admissions, source, or logo data changes.
- Use `$postupai-ui-verification` whenever a user-facing route or component changes.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
