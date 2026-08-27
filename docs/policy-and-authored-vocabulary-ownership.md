# Policy and authored-vocabulary ownership

Status: Source-policy current-state report and authored-vocabulary change record,
2026-08-27.

## Purpose

This report examines two related ownership concerns:

1. Source handling policy has persistence constraints but no single domain module
   that owns its vocabulary and decisions.
2. Annotation and Citation vocabularies are enforced in several places, but some
   values are copied rather than derived from one semantic owner.

It describes current code and identifies ownership risks. It does not establish a
new interface or supersede the domain rules in [`CONTEXT.md`](../CONTEXT.md).
Code remains authoritative for current behavior under
[ADR 0009](adr/0009-code-authority-and-documentation-roles.md).

## Authored-vocabulary implementation outcome

The Annotation and Citation recommendations in this report were implemented on
2026-08-27:

- `packages/api/src/authored-targets/authored-target.ts` now owns the shared
  Reading-Derivative target shape, offset basis, transport schemas, canonical
  anchor derivation, and semantic validation.
- The Annotation contract owns colors, kinds, and the body/kind invariant. The
  web color inventory imports the contract's ordered colors rather than copying
  them.
- The Citation-resolution contract owns methods, actions, evidence states, and
  inference-metadata validation. Its transport schemas derive their enums from
  those constants.
- Citation targets are derived from publisher anchor identity, not from the first
  occurrence of matching label text.
- `authoredTextChecks` owns the shared PostgreSQL target constraints. PostgreSQL
  retains independent copies of domain vocabularies, and
  `vocabulary-ownership.test.ts` proves parity with their semantic owners.

The Annotation and Citation analysis below is retained as the before-state and
rationale for these seams. The Source handling policy findings remain current.

## Ownership criteria

An invariant has one clear owner when one module determines its meaning and other
seams either consume that definition or enforce a mechanically checked
representation of it. Multiple enforcement sites are not automatically multiple
owners. For example, an input schema and a PostgreSQL check may both protect one
invariant while the domain module remains its semantic owner.

Ownership is unclear when:

- callers use unbounded strings for a bounded domain vocabulary;
- two modules independently enumerate the same values;
- a policy decision exists as a private helper near one caller even though its
  meaning applies to more than that caller;
- transport and persistence validation can accept different value sets;
- one domain's contract incidentally supplies another domain's vocabulary.

## Source handling policy

### Domain invariants

`CONTEXT.md` distinguishes two independent policy dimensions:

- **Rights basis** explains why a Source state may be retained and processed.
- **Sensitivity level** controls eligible external processing for an exact
  content-bearing revision or Source state.

It also establishes rules beyond simple enumeration:

- the most restrictive applicable rule wins unless Nathan explicitly tightens
  it;
- a derived artifact defaults to the most restrictive Sensitivity level among
  its inputs;
- transformed wording may be explicitly reclassified, while retained quotes and
  evidence remain governed by their Source state;
- third-party personal data defaults to restricted cloud;
- local-only content must not leave Nathan-controlled infrastructure.

These are policy decisions, not merely database column constraints.

### Current definitions and enforcement

#### PostgreSQL vocabulary

`packages/db/src/schema/source-schema-helpers.ts` contains the only complete
executable enumeration of the persisted vocabularies. `policyChecks` permits:

- Rights basis: `owned`, `lawfully-acquired`, `publicly-accessible`,
  `explicitly-licensed`, `reference-only`, and `inaccessible`.
- Sensitivity level: `ordinary-cloud`, `restricted-cloud`, and `local-only`.

The helper applies those checks to Source states and SEP Admission previews. This
is strong persistence enforcement and has good locality inside the database
module.

PostgreSQL therefore owns the question "may these bytes be persisted in these
columns?" It does not own the broader questions "what does this policy mean?" or
"which processing endpoint is eligible?"

#### SEP-specific assignment

The SEP adapter currently assigns exactly `publicly-accessible` and
`ordinary-cloud`:

- `SepAdmissionPreview.policy` uses those literals in
  `packages/api/src/sep-admission/sep-admission-contract.ts`.
- `sepAdmissionPreviewSchema` repeats those literals in
  `packages/api/src/orpc/routers/sep-admission-schemas.ts`.
- preview and state builders persist those values.

This is a narrow adapter rule rather than a complete Source handling policy. Its
literal types make the SEP behavior clear, but they cannot be reused to validate
other Sources or future policy choices.

#### Domain projections and transport

Most projections widen policy values to `string`. Examples include the active
Reading Derivative policy, admitted Source-state projection, Citation mention
evidence, and the corresponding oRPC output schemas. In particular,
`sepAdmittedStateSchema` and `citationMentionEvidenceSchema` use `z.string()` for
both policy fields.

Consequences:

- TypeScript callers cannot exhaustively handle the known policy states.
- Transport validation would accept a policy value that PostgreSQL rejects.
- A misspelled or newly introduced value may travel through projections until a
  later persistence operation fails or a policy branch treats it as unknown.
- Adding a policy value requires repository-wide knowledge because there is no
  domain definition that identifies all exhaustive consumers.

#### External-inference eligibility

`packages/api/src/citation-resolutions/citation-mention-evidence.ts` privately
defines Citation inference eligibility as:

```text
sensitivity is ordinary-cloud
and rights basis is neither reference-only nor inaccessible
```

The result is projected as a Boolean and enforced by the Citation-resolution
router before inference. This is fail-closed for that route's current inputs, but
the policy meaning is local to Citation candidate inference.

The helper does not represent:

- restricted-cloud endpoint eligibility;
- local executor eligibility;
- provider-specific protections;
- explicit tightening or reclassification;
- policy combination across several inputs;
- the distinction between processing retained evidence and transformed wording.

If another inference or workflow caller implements its own condition, there is no
owner that guarantees equivalent decisions.

### Ownership assessment

| Concern | Current owner | Assessment |
| --- | --- | --- |
| Persisted policy value set | `policyChecks` in the database schema | Clear and strongly enforced. |
| SEP preview default policy | SEP Admission module | Clear but intentionally narrow. |
| Domain-level policy vocabulary | no TypeScript domain owner | Missing; most interfaces use `string`. |
| External Citation inference eligibility | private Citation helper | Locally clear, globally misplaced if reused as Source handling policy. |
| Most-restrictive combination rule | no executable owner | Domain rule only. |
| Derived-artifact policy inheritance | no executable owner | Domain rule only. |
| Reclassification and retained-evidence rule | no executable owner | Domain rule only. |

### Risk scenarios

1. A new `restricted-cloud` endpoint is added. Citation inference currently
   rejects it because eligibility only admits `ordinary-cloud`; another feature
   may independently permit it without sharing endpoint requirements.
2. A new Rights basis is added to PostgreSQL but an application branch still
   treats only `reference-only` and `inaccessible` as restrictive.
3. An API projection emits a misspelled Sensitivity level. Its Zod schema accepts
   the string, and a downstream negative-list policy may accidentally permit it.
4. A Derivative combines evidence from several Source states. No current module
   computes the most restrictive Sensitivity level from those inputs.
5. A caller sees `inferenceEligible: true` but cannot inspect which policy rule or
   endpoint capability produced that decision.

### Recommended ownership shape

One Source handling policy module should semantically own:

- the Rights-basis and Sensitivity-level value sets and TypeScript types;
- runtime parsing for those values;
- ordering or combination of Sensitivity levels;
- named decisions such as whether a specific processing class is eligible;
- explicit result reasons suitable for disclosure and diagnosis.

Adapters should assign policy through that interface. Citation inference and
future executors should ask it for a decision rather than recreate conditions.
Transport schemas should derive their enums from its constants.

PostgreSQL checks should remain as independent boundary enforcement. SQL cannot
directly import TypeScript values, so the duplicated SQL representation is
acceptable if an integration test proves that the domain parser and database
constraints accept exactly the same vocabulary.

This module should not absorb Source Admission, Citation resolution, endpoint
routing, or database writes. It should own policy meaning and decisions while
those modules continue to own their workflows and transactions.

## Annotation and Citation vocabularies (before-state)

### Annotation vocabulary

`packages/api/src/annotations/annotation-contract.ts` is the strongest current
semantic owner. It exports:

- colors: `yellow`, `green`, `blue`, `pink`;
- kinds: `highlight`, `note`;
- offset basis: `normalized-derivative-text-v1`;
- operation inputs, records, and the domain-facing operations interface.

The Annotation oRPC router correctly derives Zod enums and literals from those
constants. This is clear ownership rather than duplication.

PostgreSQL independently repeats the accepted colors, kinds, and offset basis in
`packages/db/src/schema/annotations.ts`. It also enforces positive ordered
offsets and nonempty exact text. This is appropriate defense at the persistence
seam, provided agreement with the contract is tested.

The web Reading implementation introduces another complete color list in
`apps/web/src/components/annotations/dom-utils.ts`. The array is typed as
`AnnotationColor[]`, which prevents an invalid color but does not prove that every
contract color appears exactly once. This list determines generated Highlight
names and styles, so omission would be a rendering defect even though all types
pass.

### Citation vocabulary

`packages/api/src/citation-resolutions/citation-resolution-contract.ts` defines
the relevant unions inline:

- method: `manual | inferred`;
- action: `selected | cleared`;
- evidence state: `ambiguous | unresolved`;
- offset basis: `normalized-derivative-text-v1`.

Unlike the Annotation contract, it does not export runtime constants. The oRPC
schema and PostgreSQL schema therefore repeat method and action values by hand.
The database additionally owns important relational constraints:

- selected decisions require a Bibliography target;
- cleared decisions forbid a Bibliography target;
- manual decisions carry no confidence or reasoning;
- inferred selected decisions require bounded confidence and nonempty reasoning.

Those constraints express more than vocabulary and should remain enforced in
PostgreSQL even if enum values gain one semantic owner.

### Shared authored-text anchoring

Annotations and Citation resolutions both use the same authored-text columns and
offset basis. The database recognizes this through
`authoredTextColumns`, but the TypeScript side imports
`annotationOffsetBasis` into the Citation oRPC schema while the Citation contract
repeats the literal directly.

This makes the Annotation contract an accidental owner of a concept shared by
two authored-record domains. The deeper invariant is not "Annotations use this
basis"; it is "authored targets against Reading Derivatives use this basis and
anchor representation."

`validateAnnotationAnchor` provides strong semantic validation of offsets, exact
text, context, and publisher anchors. Citation resolution has related evidence
requirements, but the shared representation does not currently have one named
contract owner.

### Duplication classification

| Duplicate representation | Classification | Reason |
| --- | --- | --- |
| Annotation constants to oRPC Zod enums | Derived enforcement | Good: transport follows the contract. |
| Annotation constants to PostgreSQL checks | Independent boundary enforcement | Necessary, but agreement should be tested. |
| Annotation colors to web `colors` | Unchecked semantic copy | Risk: type checking does not prove completeness or uniqueness. |
| Citation unions to oRPC Zod enums | Handwritten semantic copy | Risk: either side can add a value independently. |
| Citation unions to PostgreSQL checks | Independent boundary enforcement | Necessary, but lacks a parity test. |
| Offset basis across Annotation, Citation, Zod, and SQL | Shared concept with accidental owner | The Annotation module should not define Citation semantics. |
| Offset and target consistency in SQL and operation code | Layered invariant enforcement | Appropriate because runtime context and relational storage prove different facts. |

### Risk scenarios

1. A fifth Annotation color is added to the contract and API. The web color array
   omits it, so records persist but do not receive generated Highlight styles.
2. A Citation method is added to the contract but not the Zod schema, causing the
   domain and transport interfaces to disagree.
3. A Citation action is added to transport validation without a matching SQL
   constraint, so requests pass the network seam and fail at persistence.
4. A new anchoring basis is introduced for Citations. Importing the old basis from
   the Annotation contract hides whether the two domains are intended to evolve
   together.
5. Validation remains duplicated, but tests only exercise ordinary application
   writes and never compare the complete accepted value sets.

### Recommended ownership shape

- Keep Annotation colors and kinds owned by the Annotation contract.
- Export Citation method, action, and evidence-state constants from the Citation
  contract and derive TypeScript unions and Zod enums from them.
- Move the offset-basis value and shared authored-target shape behind a small
  authored-target contract consumed by both domains.
- Treat web color order and styling as presentation policy, but derive or
  exhaustively check its membership against the Annotation color owner.
- Retain PostgreSQL checks for all persisted vocabularies and relational
  invariants.
- Add parity tests where SQL must repeat a TypeScript vocabulary.

The goal is not to remove validation layers. It is to make one module decide what
each value means while transport, UI, and PostgreSQL enforce that decision at
their own seams.

## Priority findings

1. Source policy values should stop crossing domain and transport interfaces as
   unconstrained strings.
2. External-processing eligibility should move from a private Citation helper to
   a Source handling policy decision interface before a second caller appears.
3. Resolved: Citation runtime constants are the semantic source for its Zod enums
   and TypeScript unions.
4. Resolved: the authored-target module owns the shared target basis and
   representation.
5. Resolved for authored vocabularies: PostgreSQL checks remain and parity tests
   prove they match the semantic owners.
6. Resolved: the web Annotation color inventory imports the Annotation owner's
   ordered values.
