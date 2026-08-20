---
name: ticket-model-routing
description: Ticket model routing for GPT-5.6 Sol, Terra, and Luna. Use when assigning tickets to models, choosing a model for an issue, or reducing agent cost across a backlog.
---

# Ticket Model Routing

Route each ticket to the cheapest GPT-5.6 model that can complete it reliably.
The **capability floor** is the lowest tier whose expected retries, review, and
failure risk preserve the saving.

## Process

1. Read [`openai-codex-model-research.md`](../../../docs/openai-codex-model-research.md)
   for current model capabilities, prices, and evidence limits. This step is
   complete when the current Sol, Terra, and Luna positioning and cost order are
   known from the source document.

2. Collect the complete ticket set. For a GitHub issue number, run
   `gh issue view <number> --comments`; for a backlog, fetch every ticket in the
   requested scope. Include acceptance criteria, blockers, dependencies, and
   linked decisions. This step is complete when every requested ticket has
   enough evidence to assess scope, ambiguity, consequence, and verification,
   or is explicitly marked underspecified.

3. Establish each ticket's capability floor using the gates below. Judge the
   work the model must actually perform, including repository discovery and
   integration, rather than the title alone. This step is complete when every
   ticket passes one tier's full gate and has one concrete escalation trigger.

4. Look for **downshift** opportunities. Recommend sharpening acceptance
   criteria, resolving a decision first, or splitting a mixed ticket when that
   moves executable work to a cheaper tier. Keep tightly coupled work together
   when splitting would add more coordination cost than it saves. This step is
   complete when every Terra or Sol ticket has been checked for a safe downshift.

5. Persist each GitHub ticket's recommendation in its issue body using the
   routing block below. Replace an existing routing block in place so reruns are
   idempotent, and preserve the rest of the issue body exactly. For non-GitHub
   inputs, report the recommendation without inventing tracker metadata. This
   step is complete when every GitHub ticket has one current routing block.

6. Report the routing table and portfolio summary using the output contract.
   Assignments remain recommendations even when persisted. This step is
   complete when every input ticket appears exactly once and all claims are
   traceable to ticket evidence or the research note.

## Capability gates

### Luna

Assign `gpt-5.6-luna` only when all are true:

- The requested outcome and boundaries are explicit.
- The implementation follows an established repository pattern or is a
  mechanical extraction, classification, transformation, or focused edit.
- The blast radius is local and rollback is straightforward.
- Acceptance is objectively verifiable with specified tests or deterministic
  checks.
- Failure has low consequence and does not threaten security, privacy, data
  integrity, or an irreversible migration.
- No unresolved product, domain, or architecture decision is embedded in the
  work.

### Sol

Assign `gpt-5.6-sol` when any are true:

- The ticket requires product, domain, or architectural judgment before its
  implementation can be known.
- Requirements conflict, remain materially incomplete, or admit several
  high-consequence interpretations.
- The change is cross-cutting, difficult to reverse, or has a large and poorly
  bounded blast radius.
- Correctness depends on security, privacy, data integrity, concurrency, or a
  production migration where subtle failure is costly.
- Diagnosis starts from an unknown root cause with weak reproduction or weak
  observability.
- The work is novel research or needs unusually high polish and independent
  judgment.

### Terra

Assign `gpt-5.6-terra` when the ticket fails Luna's full gate but triggers none
of Sol's gates. This is the default for ordinary production features,
multi-file maintenance, reproducible debugging, test construction, and code
review that require strong reasoning and tool use within known boundaries.

An underspecified ticket is a provisional Sol assignment, not proof that its
implementation is intrinsically difficult. State the missing information that
would permit a downshift.

## Reasoning effort

Recommend the lowest effort consistent with the capability floor:

- `low` for deterministic Luna work with strong verification.
- `medium` for ordinary Luna or Terra work.
- `high` for Terra work near the Sol boundary or consequential Sol work.
- `xhigh` or `max` only when the ticket evidence establishes exceptional
  ambiguity or consequence.

Reasoning effort refines a model assignment; it does not turn Luna or Terra into
Sol.

## Output contract

Return one row per ticket:

| Ticket | Model | Effort | Confidence | Evidence | Escalate when |
| --- | --- | --- | --- | --- | --- |

- **Model:** canonical OpenAI model ID, without assuming a direct OpenAI or
  OpenCode Zen billing route.
- **Confidence:** `high`, `medium`, or `low`, based on ticket completeness and
  repository evidence.
- **Evidence:** the shortest concrete reason that sets the capability floor.
- **Escalate when:** one observable condition that requires the next tier.

For each GitHub ticket, append or replace this exact section in the issue body:

```markdown
## Model routing

- Model: `gpt-5.6-terra`
- Effort: `medium`
- Confidence: `high`
- Evidence: The shortest concrete reason that sets the capability floor.
- Escalate when: One observable condition that requires the next tier.
```

Write the ticket's actual values. Keep the heading and field labels stable so
orchestrators can resume from the issue body without rerunning model selection.

After the table, report:

- Count of tickets per model.
- Safe downshift opportunities and the exact ticket change each requires.
- Cost estimates only when token or message-volume assumptions are available;
  show those assumptions and arithmetic. Otherwise report relative cost order
  without inventing savings.
