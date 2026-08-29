---
name: understand-architecture
description: Understand Lirna architecture through one live code flow, adaptive quizzes, and evidence-gated refactor tickets. Use when Nathan asks for a representative flow, cannot find the real logic, questions why code is organized a certain way, or wants to turn comprehension friction into justified architecture work.
---

# Understand Architecture

Build Nathan's design ownership of Lirna from current evidence. The destination
is not implementation recall: Nathan should be able to explain, defend, revise,
or replace the important design decisions as if he governed them. Treat
confusion as diagnostic evidence, not proof that either Nathan or the code is at
fault.

Load and apply these skills rather than duplicating their disciplines:

- `grill-with-docs` for the decision tree, domain language, and durable decisions;
- `codebase-design` for modules, interfaces, seams, depth, and locality;
- `to-tickets` when a confirmed refactor opportunity is ready to publish.

## Start or resume

Use `.architecture-learning/current.md` as local learning state. The directory is
excluded through `.git/info/exclude`, never committed.

If `current.md` exists, resume it automatically unless Nathan explicitly asks to
start another flow. Before trusting it, compare its recorded Git revision and
working-tree notes with the current checkout. Reinspect every changed area.

If no checkpoint exists, anchor the session in either:

1. a concrete confusion, failed change, or user action supplied by Nathan; or
2. a representative flow recommended by the agent.

A representative flow should be meaningful, implemented, bounded enough for one
session, and preferably cross UI, transport, application behavior, persistence,
and tests. Survey only enough architecture to choose and trace that flow.

Read `AGENTS.md`, `CONTEXT.md`, relevant ADRs, and current source before naming
concepts or explaining structure. Use CodeGraph before manual code searches.
Vault material is evidence only and never belongs in a checkpoint or ticket.

## Evidence labels

Label architectural claims while explaining them:

- **Evidence**: established by current code, tests, history, docs, or an ADR.
- **Interpretation**: the best model that explains the evidence.
- **Decision**: an intentional trade-off recorded or confirmed by Nathan.
- **Accident**: structure for which no rationale can be established.
- **Unknown**: evidence is insufficient; investigate or leave it unresolved.

Never invent a respectable rationale for unexplained code. Challenge Nathan's
assumptions and the code's structure with equal rigor.

Classify rationale separately:

- **Historical rationale**: established by ADRs, issues, commits, or Nathan's
  recollection.
- **Present rationale**: the reason Nathan endorses the design now.
- **Inferred rationale**: a hypothesis that explains the code but remains
  unconfirmed.
- **Accident**: structure with no rationale worth preserving.

When historical rationale is unavailable, generate credible alternatives, test
them against current evidence, and ask whether Nathan now adopts or replaces the
design. Never turn a plausible story into historical fact.

## Learning loop

Work in `grill-with-docs` rounds:

1. Trace one flow through current source and tests.
2. Explain each layer by responsibility, not merely by filename or framework.
3. Ask Nathan to challenge the explanation and ask why each seam exists.
4. Test **Retell**, **Predict**, and **Transfer**.
5. Reconstruct the design's problem, forces, invariants, seam, alternatives,
   trade-off, consequences, reversal conditions, and evidence status.
6. Test **Defend** with counterfactual challenges.
7. Correct the model and repeat with a smaller adjacent example where needed.
8. Classify each friction before proposing a change.

During a quiz, withhold recommendations and answers until Nathan completes the
whole round. A polite acknowledgement is not evidence of understanding.

The four demonstrations are:

- **Retell**: Nathan explains the flow in his own words.
- **Predict**: Nathan locates several hypothetical changes or failures.
- **Transfer**: Nathan applies the same model to an adjacent unfamiliar flow.
- **Defend**: Nathan reasons from forces and invariants to defend the current
  design, compare a credible alternative, or explain why it should change.

Use counterfactual questions for Defend: remove a seam, move an invariant, swap
an adapter, add a second implementation, or change a governing constraint. Do
not accept repetition of the agent's wording as design ownership.

Continue teaching when any demonstration fails. Finish only when all four pass
at the agreed depth or Nathan explicitly stops.

## Diagnose friction

Distinguish among:

- stack or framework unfamiliarity;
- stale or absent orientation;
- misleading naming or placement;
- leaked coordination between callers;
- a shallow module interface;
- an invariant with no single owner;
- a personal style preference without demonstrated cost.

Teach a normal stack convention and retest before treating unfamiliarity as a
defect. Consider an improvement only when it reduces a demonstrated burden for
Lirna's intended maintainer, tests, callers, or coding agents.

## Refactor ticket gate

Publish a refactor ticket only when all four are established:

1. **Observed friction**: a concrete navigation, prediction, transfer, change,
   caller, or test failure.
2. **Structural cause**: naming, placement, escaped knowledge, a shallow
   interface, or missing invariant ownership.
3. **Architectural cost**: the cause burdens future changes, callers, tests, or
   agents.
4. **Confirmed direction**: Nathan agrees on the intended improvement and scope.

Prefer one tracer ticket per independently valuable improvement. A ticket states
the observed failure, current escaped knowledge, intended seam, preserved
behavior, evidence, success criteria, and blocking relationships. It should not
freeze an untested implementation design or cache current filenames.

Publish a confirmed ticket immediately through `to-tickets` and record its link
in the checkpoint. Keep an unconfirmed candidate local even when interruption or
compaction is likely. Closing a ticket later is valid when new evidence defeats
its premise.

## Checkpoint

Rewrite `.architecture-learning/current.md` after every completed grilling round
and immediately after publishing or materially revising a ticket. This cadence,
not prediction of compaction timing, provides recovery.

Keep only:

- flow under study;
- Git revision and relevant working-tree changes;
- evidence inspected;
- the model Nathan can currently retell;
- Retell, Predict, Transfer, and Defend results;
- historical, present, and inferred rationale kept visibly distinct;
- open confusions and the next grilling frontier;
- confirmed opportunities and published issue links;
- unconfirmed candidates, clearly labelled.

This is personal learning state, not authoritative architecture documentation.
Do not turn it into a detailed repository map.

When understanding is complete, rename `current.md` to
`YYYY-MM-DD-<filesystem-safe-flow-summary>.md`. Preserve the demonstrated model,
quiz results, issue links, and remaining caveats. Future sessions may use it as
prior evidence but must revalidate it against current code.

## Writes

Do not modify application code during the learning session by default.

- Update `CONTEXT.md` immediately only for genuinely resolved domain language.
- Offer an ADR only when the `domain-modeling` threshold is met.
- Correct a small, unambiguous stale fact directly after Nathan confirms it.
- Publish architecture work only after the refactor ticket gate passes.

Stable process belongs in this skill. Current architecture belongs in live code;
durable rationale belongs in ADRs; work belongs in GitHub issues.
