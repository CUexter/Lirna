---
name: work-spec
description: Herdr spec work through routed OpenCode tabs. Use to work, resume, execute, or resolve a parent issue or ticket graph.
---

# Work Spec

You **main orchestrator**. You own graph, routing, worker life, final proof.
Fresh OpenCode workers own ticket code.

## 1. Resume First

Load `herdr`. Trust live CLI, not memory. Every run maybe resume.

Read parent/spec, comments, decisions, children, criteria, native blockers.
Inspect branch, commits, status, Herdr tabs/agents, tracker states. Classify each
ticket: verified complete, in progress, ready, blocked. Match live tabs and
commits before making tabs. Reuse live worker. Trust completion only after Git,
tracker, and acceptance proof agree.

Read unresolved tickets' `## Model routing` blocks. If no executable tickets,
load `to-tickets`; approve and publish first.

**Done:** Full graph known. Old work classified. Missing fact named as blocker.

## 2. Claim Main Tab

Confirm caller inside Herdr. Rename current tab:
`<spec reference> <short title> | main orchestrator`. Rename current pane:
`main orchestrator`. Keep focus here.

Worker topology fixed: current workspace, current repo, one new tab per new
worker, `--no-focus`. Pane count and worktree count stay same.

**Done:** Tab and pane show main orchestrator role.

## 3. Route Graph

Use persisted model, effort, confidence, evidence, escalation. Assignment stays
until escalation fires. Missing, incomplete, or escalated block: load
`ticket-model-routing`; route and persist before dispatch.

Worker kind: OpenCode. Model argument: `openai/<canonical-model>`. Put effort in
prompt. Model unavailable: report and pause. No quiet substitution.

**Done:** Every unresolved ticket has one persisted model and effort.

## 4. Work Frontier

**Frontier** = open tickets with all GitHub blockers closed. Closed blocker is
enough proof. Recompute after state change. Blocked ticket never starts.

Multiple frontier tickets: pick one unlocking most work; tie goes to lower
integration risk. Reuse its live tab or create its labeled tab. Dispatch
immediately. Create tabs only for selected work.

Shared worktree gets one writer for edits, tests, staging, commit.

**Done:** One frontier ticket selected. One writer owns worktree.

## 5. Dispatch Ticket

Capture branch, HEAD, `git status --short` baseline. Prompt writer with ticket,
effort, closed blockers, baseline. Tell worker load `implement`, do only ticket,
preserve baseline changes, stage only owned paths.

Worker completion contract:

- Verify, review, make repository-valid commit.
- Push commit.
- Comment summary of change and verification.
- Close ticket as completed.
- Remove own generated leftovers; restore baseline status.
- Report SHA, tests, push, comment, issue state, final status.

Concrete blocker stops turn. Wait for settled worker. On `blocked`, `unknown`, or
failed wait, inspect state and transcript. Corrections use same tab. Fresh ticket
gets fresh tab.

**Done:** Full completion report or concrete blocker received.

## 6. Prove Handoff

Main orchestrator checks:

- Commit exists on expected branch and remote.
- Ticket closed as completed.
- Closing comment names change and verification.
- Acceptance checks passed.
- Worktree matches baseline plus only approved changes.
- Worker left no generated or unstaged debris.

Failed check goes back to same worker for repair. Dependents stay blocked. Passed
check makes ticket verified closed; mark tab done, recompute frontier, repeat.

## 7. Close Run

After all tickets verified, run spec integration checks. Compare result with
parent criteria. Parent stays unchanged unless parent workflow says otherwise.

Report tickets, models, efforts, tabs, commits, states, serialization choices,
integration results, unmet criteria, residual risk.

**Done:** Every ticket accounted for. Integration green. Shared worktree back to
initial baseline.
