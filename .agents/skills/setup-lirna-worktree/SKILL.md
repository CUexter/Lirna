---
name: setup-lirna-worktree
description: Worktree: prepare an isolated Lirna task checkout. Use when asked to set up a new worktree for parallel work.
---

# Set Up A Worktree

Require a task branch name; ask if none was provided.

1. From the registered primary checkout, run `bun run lifecycle create <task-branch>`.
2. Use the returned `checkoutPath` as the cwd for `bun install`, `bun run lifecycle database start`, `bun run lifecycle database provision`, and `bun run lifecycle diagnose`.
3. Continue the requested work from that checkout.

Setup is complete when diagnosis reports the worktree as registered. Report its
path, branch, ports, and database name.
