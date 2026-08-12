# Lirna

Lirna is Nathan's first-party personal environment for researching questions,
working with sources, developing durable knowledge, and practicing recall.

## Language

### Knowledge

**Owned note**:
A durable, atomic Markdown note centered on one independently reviewable claim, with a revision whose substance Nathan has explicitly reviewed and accepted. Ownership applies to the accepted revision, not to related sources, annotations, research threads, or drafts; Owned notes remain compatible with direct editing in Obsidian and Neovim.
_Avoid_: final note, AI note

**Draft**:
A provisional proposal for exactly one new atomic Owned note or one revision of an existing Owned note. A Draft may be revised, split, rejected, superseded, or explicitly accepted; acceptance creates an Owned-note revision without erasing the Draft's provenance.
_Avoid_: generated note, output

**Acceptance**:
Nathan's explicit review outcome for one complete Draft revision. Acceptance creates an Owned-note revision through Lirna's review flow; a later substantive change requires another Acceptance, while a direct human-authored edit through Nathan's trusted Vault tools counts as an accepted revision.
_Avoid_: approval, ownership status

**Vault**:
The filesystem collection containing canonical Owned notes, other Nathan-managed Markdown files, and their file-native relationships, currently at `~/vaults`.
_Avoid_: database, second brain

### Research and reading

**Research thread**:
A durable conversation for one continuing inquiry that preserves questions, sourced answers, citations, selected context, and any drafts it produces. A materially different inquiry forks into a related Research thread rather than silently replacing the original inquiry; an ended inquiry may later be resumed.
_Avoid_: chat log, run, door record

**Reference**:
A durable record of publication evidence used to ground a Research-thread answer without admitting the publication for study. A Reference preserves the observed evidence needed for Citation inspection but creates no reading or source-note commitment; Nathan may explicitly add the referenced publication as a Source.
_Avoid_: Source, search result

**Source**:
A citable publication or edition Nathan explicitly admits for study, including web pages, books, audio, video, and existing Markdown. A Source may have multiple immutable Source states and equivalent format-specific Renditions; an Owned note used as evidence remains the same object rather than becoming a duplicate Source.
_Avoid_: input, attachment

**Source state**:
An immutable observed revision or capture of a Source. Citations and annotations target the Source state that preserves the evidence they depend on.
_Avoid_: latest version, file version

**Rendition**:
A format-specific expression of the same Source edition, such as equivalent PDF and EPUB files. Materially different content belongs to a related Source rather than another Rendition.
_Avoid_: duplicate, derivative

**Derivative**:
A replaceable machine-readable representation produced from one Source state, such as extracted text, OCR, or a transcript. A Derivative preserves how it was produced and supports retrieval and relocation without replacing the Source as authoritative evidence.
_Avoid_: Source, transcription source

**Annotation**:
A durable authored record with one or more anchored targets on a Source or Owned note and an optional body; a bodyless Annotation is a highlight. An Annotation may remain useful without becoming a Draft or Owned note.
_Avoid_: clipping, temporary selection

**Citation**:
A durable relationship from a specific passage or claim to exact evidence in a Reference, Source state, or Owned-note revision, including its locator and evidential role. Formatted citation text is a rendering of the Citation rather than its identity.
_Avoid_: footnote, citation string

**Evidence relation**:
The Citation's claim-level account of whether evidence supports, qualifies, conflicts with, or provides background for a claim.
_Avoid_: confidence score, citation presence

**Provenance**:
The attributable origin and transformation history of a claim or knowledge artifact. Provenance distinguishes published sources, personal observations, personal testimony, Nathan's original reasoning, and reasoning contributed by another person; only source-dependent claims necessarily require Citations.
_Avoid_: citation requirement, origin label

**Claim kind**:
The machine-readable epistemic framing of an Owned note's claim: assertion, interpretation, or working hypothesis. The title and prose must express the same framing rather than relying on metadata alone.
_Avoid_: owned-claim, confidence

**Source handling policy**:
The rules governing a Source state's local retention and external processing, determined independently by its sensitivity and rights basis. The most restrictive applicable rule wins unless Nathan explicitly tightens it for that Source state.
_Avoid_: privacy level, copyright status

**Sensitivity level**:
An external-processing classification for an exact content-bearing revision or Source state: ordinary cloud permits eligible configured endpoints, restricted cloud requires stronger provider protections, and local only prohibits processing outside Nathan-controlled infrastructure. A derived artifact defaults to the most restrictive Sensitivity level among its inputs and may be explicitly tightened; Nathan may explicitly reclassify transformed wording, but retained quotes and evidence remain governed by their Source state's Sensitivity level. Third-party personal data is restricted cloud by default; especially sensitive material may be local only.
_Avoid_: public, private

**Rights basis**:
Nathan's declaration of why Lirna may retain and process a Source state, distinguishing Nathan-created or owned, lawfully acquired for personal use, publicly accessible, explicitly licensed, and reference-only or inaccessible material. Rights basis is independent of sensitivity.
_Avoid_: ownership, permission

### Learning

**Learning path**:
A durable, goal-led, multi-session teaching process that organizes an editable route of Lessons and uses Quizzes to adapt teaching from Nathan's demonstrated performance. A Learning path links existing Sources, References, Research threads, Drafts, Owned notes, and Study aids without copying their identity or lifecycle state.
_Avoid_: course, curriculum container

**Learning goal**:
The explicit mission that gives a Learning path its purpose, including the understanding or capability Nathan wants, why it matters, its practical context, and its success conditions. Refinements preserve history; a materially different mission belongs to a related Learning path.
_Avoid_: topic, completion badge

**Learning target**:
A narrow understanding or capability within a Learning goal that can guide one or more Lessons and scope Quiz evidence. Exploring a Learning target, completing a Lesson, and demonstrating understanding are distinct states.
_Avoid_: module, mastery objective

**Lesson**:
A short, durable, source-grounded teaching episode centered on one Learning target. A Lesson cycles through concise teaching, elicitation, grounded feedback, repair or deepening, and a next step; revisions preserve what Nathan was taught rather than silently replacing it.
_Avoid_: content page, lecture

**Quiz**:
A contextual assessment of understanding that creates a feedback loop for teaching and learning. A Quiz may span a Lesson's elicitation, feedback, repair, and retries, while only clearly signposted committed answers become assessment evidence; Quiz items do not automatically become scheduled repetition items.
_Avoid_: flashcard session, test

**Repetition item**:
A durable, application-owned recall prompt that Nathan explicitly promotes from a Quiz candidate. A Repetition item has stable identity, accepted content revisions, exact grounding and promotion provenance, while its scheduling state and review evidence remain distinct; ordinary repetition performance maintains accessible recall but does not establish Demonstrated understanding.
_Avoid_: Quiz item, due card, Vault card note

**Demonstrated understanding**:
A scoped, dated judgment that Nathan has shown understanding through quiz evidence. It describes demonstrated performance rather than permanent mastery.
_Avoid_: mastery, learned

**Study aid**:
A durable, revisable, source-grounded reference artifact that compresses material for learning, such as a glossary, cheat sheet, sequence, or conceptual guide. A Study aid is neither an authoritative Source nor an atomic Owned note; insights from it enter the Vault only through the normal Draft and Acceptance flow.
_Avoid_: owned note, generated source

**Review**:
Nathan's deliberate examination of provisional knowledge or learning material. The object being reviewed must be named: draft review, quiz review, or spaced-repetition review.
_Avoid_: approval (unless acceptance is specifically meant)

**Visualization**:
A first-party visual representation used to explore relationships, navigate knowledge, or explain material through generated diagrams or animations.
_Avoid_: decorative graph, mirror

### Workflow execution

**Typed workflow**:
A versioned, declarative process that coordinates leased steps to produce validated artifacts. A workflow has stable identity across its versioned definition; a materially different process is a new version rather than a silent replacement.
_Avoid_: job, pipeline, run

**Workflow run**:
One durable enactment of a typed workflow. A run resumes from the last committed checkpoint after worker loss rather than restarting; identity (id) is stable across interruption.
_Avoid_: execution, task instance

**Checkpoint**:
The durable record of one step's committed artifact. A checkpoint is immutable once committed; resume begins at the run's last checkpoint. Checkpoints are a workflow-execution concern, distinct from the Citations and evidence that an artifact may carry.
_Avoid_: save point, log entry

**Lease**:
A bounded, exclusive grant to attempt one step of one run. A lease expires after its declared budget; an expired or lost lease cannot commit, so worker loss never duplicates committed work. Each new lease is a new attempt.
_Avoid_: lock, ticket

**Attempt**:
One numbered lease of one step of one run. A step may have several attempts when leases expire or workers are lost; exactly one committed attempt is the checkpoint.
_Avoid_: retry, try

**Human gate**:
A declared step in a typed workflow that requires Nathan's explicit decision before the run may advance. A gate is durable and inspectable; approve advances the run and reject fails it. A gate is a Review and does not create Acceptance.
_Avoid_: approval step, sign-off

**Step budget**:
The per-step limits on leasing: how long one lease may run and how many attempts may be raised. Budgets are durable and inspectable through the recorded attempts.
_Avoid_: deadline, quota

### Access

**Offline working set**:
An explicitly selected, policy-eligible collection of Lirna objects and bounded dependencies retained on one Client installation for named offline activities. Its readiness states which activities are supported and when the collection last synchronized; opportunistic cached material is not part of the guarantee.
_Avoid_: offline cache, download

**Client installation**:
A separately enrolled and revocable Lirna access identity for one browser profile and its installed PWA, or for one desktop host. A Client installation belongs to Nathan but is distinct from the physical machine, its private-network peer, and any synchronization peer.
_Avoid_: device, machine account

**Service identity**:
A separately provisioned, narrowly authorized Lirna access identity for a non-human process such as a background or inference worker. A Service identity is limited to named duties and does not represent Nathan or inherit a Client installation's access.
_Avoid_: device, shared service account
