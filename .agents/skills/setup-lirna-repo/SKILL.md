---
name: setup-lirna-repo
description: Setup: bootstrap a fresh Lirna checkout for local development. Use when asked to set up or initialize the repository.
---

# Set Up Lirna

Run these steps from the primary Git checkout:

1. Install dependencies with `bun install`.
2. Register the checkout with `bun run lifecycle register`.
3. Start shared PostgreSQL with `bun run lifecycle database start`.
4. Provision this checkout's database with `bun run lifecycle database provision`.
5. Run `bun run lifecycle diagnose` and `bun run lifecycle database diagnose`.

Setup is complete when both diagnoses exit successfully. Report the checkout
path, allocated ports, database name, and any failed step.
