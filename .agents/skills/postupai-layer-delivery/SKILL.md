---
name: postupai-layer-delivery
description: Deliver one numbered Postupai project layer through implementation, verification, handoff, review, and merge. Use for any task tied to a layer branch, GitHub issue, pull request, handoff, release gate, or decision about starting the next layer.
---

# Deliver a Postupai layer

1. Read `AGENTS.md`, `docs/EXECUTION_PLAN.md`, and `docs/HANDOFF.md` completely.
2. Confirm that the branch matches the active layer and that the previous layer is merged into `main`.
3. Restate the layer outcome, acceptance criteria, and explicit exclusions. Do not mix later-layer work into the branch.
4. Inspect affected architecture and tests before editing. Read the repository's Next.js guide before Next.js changes.
5. Implement the smallest cohesive change that advances the active layer. Preserve existing unrelated work.
6. Add tests and documentation as behavior or decisions change.
7. Run all commands listed in the root `AGENTS.md`. For UI work, also use `$postupai-ui-verification`; for admissions data, use `$postupai-data-integrity`.
8. Review the complete diff for secrets, scope creep, generated artifacts, migrations, and user-visible regressions.
9. Update `docs/HANDOFF.md` with outcomes, evidence, limitations, and reviewer focus.
10. Prepare one PR for the layer. Keep the next layer blocked until approval and merge.

If a required gate fails, fix it within the current layer or record a genuine blocker. Never declare the layer complete based only on partial tests.
