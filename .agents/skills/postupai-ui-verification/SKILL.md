---
name: postupai-ui-verification
description: Verify Postupai user-facing pages and components after visual, responsive, navigation, form, filter, comparison, matching, account, or accessibility changes. Use for frontend implementation, UI review, browser QA, or pull requests that affect rendered routes.
---

# Verify Postupai UI

1. Read the active layer acceptance criteria and identify every affected user journey and route.
2. Start from a clean build and a running local server. Record the exact URL and test state.
3. Verify the changed journey at desktop and mobile widths. Include loading, empty, error, long-content, and unknown-data states when applicable.
4. Exercise controls through the browser: navigation, keyboard focus, forms, drawers, filters, sorting, save actions, compare, and back/forward behavior.
5. Check for horizontal overflow, clipped text, unstable layout, broken images, missing labels, low contrast, and inaccessible focus states.
6. Confirm official-source links and university-logo fallbacks without treating third-party load failures as verified data.
7. Check console/runtime errors and run the relevant automated tests plus the full delivery gates.
8. Record routes, viewport classes, results, and any limitation in the PR and `docs/HANDOFF.md`.

Do not approve a visible change from screenshots alone when the interaction can be exercised in a real browser.
