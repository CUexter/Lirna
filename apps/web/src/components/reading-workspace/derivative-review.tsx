import { Badge } from "@lirna/ui/components/badge";
import { Button } from "@lirna/ui/components/button";

import type { InquiryOutputs } from "@/clients/inquiry";
import { ServerErrorMessage } from "@/components/server-error-message";
import { useDerivativeUpdate } from "@/hooks/use-derivative-update";

type Workspace = InquiryOutputs["sources"]["readingWorkspace"];
type State = NonNullable<Workspace["state"]>;
type Candidate = InquiryOutputs["sources"]["derivatives"]["generate"];
type ComparisonValue =
  InquiryOutputs["sources"]["derivatives"]["previewActivation"];
type ValidationValue = Candidate["validation"];

export function DerivativeReview({
  sourceId,
  state,
}: {
  sourceId: string;
  state: State;
}) {
  const update = useDerivativeUpdate(sourceId, state.id);
  const current = state.derivatives.find(
    (derivative) => derivative.currentActivation,
  );
  return (
    <section
      aria-labelledby="derivative-review-title"
      className="border bg-background p-4"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-serif text-xl" id="derivative-review-title">
            Reading Derivative versions
          </h3>
          <p className="mt-1 break-all text-muted-foreground text-sm">
            Current version: {current?.id ?? "No active Reading Derivative"}
          </p>
        </div>
        <Button disabled={update.generatePending} onClick={update.generate}>
          {update.generatePending
            ? "Generating candidate..."
            : "Generate candidate"}
        </Button>
      </div>

      {update.generateError ? (
        <ServerErrorMessage error={update.generateError} />
      ) : null}
      {update.activateError ? (
        <ServerErrorMessage error={update.activateError} />
      ) : null}
      {update.candidate ? (
        <CandidateReview
          activate={update.activate}
          candidate={update.candidate}
          pending={update.activatePending}
        />
      ) : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {state.derivatives.map((derivative) => (
          <div className="min-w-0 rounded-md border p-3" key={derivative.id}>
            <div className="flex flex-wrap items-center gap-2">
              <strong className="break-all text-sm">
                Version {generationVersion(derivative.generation)}
              </strong>
              <Badge
                variant={derivative.currentActivation ? "default" : "outline"}
              >
                {derivative.currentActivation
                  ? "Current"
                  : derivative.valid
                    ? "Valid"
                    : "Invalid"}
              </Badge>
            </div>
            <p className="mt-1 break-all text-muted-foreground text-xs">
              {derivative.id}
            </p>
            <p className="mt-2 text-xs">
              {derivative.activationHistory.length} append-only activation
              event(s)
            </p>
            {!derivative.currentActivation && derivative.comparison ? (
              <PersistedReview
                comparison={derivative.comparison}
                validation={derivative.validation}
              />
            ) : null}
            {!derivative.currentActivation && derivative.valid ? (
              <Button
                className="mt-3"
                disabled={update.activatePending}
                onClick={() =>
                  previewRollback(
                    derivative.id,
                    update.previewActivation,
                    update.activate,
                  )
                }
                size="sm"
                variant="outline"
              >
                Roll back to this version
              </Button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}

function CandidateReview({
  activate,
  candidate,
  pending,
}: {
  activate: Activation;
  candidate: Candidate;
  pending: boolean;
}) {
  const blocked = !candidate.valid;
  return (
    <div aria-live="polite" className="mt-5 rounded-md border-2 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="font-medium">
          Candidate version {candidate.generation.version}
        </h4>
        <Badge variant={blocked ? "destructive" : "secondary"}>
          {blocked ? "Activation blocked" : "Validated"}
        </Badge>
      </div>
      <p className="mt-1 text-muted-foreground text-xs">
        {candidate.generation.parser.id} {candidate.generation.parser.version} ·{" "}
        {candidate.generation.renderer.id}{" "}
        {candidate.generation.renderer.version} ·{" "}
        {candidate.generation.inputResourceHashes.length} immutable inputs
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Validation validation={candidate.validation} />
        <Comparison comparison={candidate.comparison} />
      </div>

      <RelocationReview relocations={candidate.comparison.relocations} />

      <Button
        className="mt-4"
        disabled={blocked || pending}
        onClick={() =>
          confirmActivation(candidate.id, false, candidate.comparison, activate)
        }
      >
        {blocked
          ? "Resolve validation failures to activate"
          : pending
            ? "Activating..."
            : "Activate candidate"}
      </Button>
    </div>
  );
}

function Validation({ validation }: { validation: ValidationValue }) {
  return (
    <div>
      <h5 className="font-medium text-sm">Complete validation</h5>
      <ul className="mt-2 space-y-1 text-xs">
        {validation.checks.map((check) => (
          <li key={check.subject}>
            {check.status === "passed" ? "Passed" : "Failed"}: {check.subject}
            {check.messages.length ? ` - ${check.messages.join(" ")}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Comparison({ comparison }: { comparison: ComparisonValue }) {
  return (
    <div>
      <h5 className="font-medium text-sm">
        Semantic and diagnostic comparison
      </h5>
      <ul className="mt-2 space-y-1 text-xs">
        <li>
          Semantically changed components:{" "}
          {comparison.semantic.changedComponents.length}
        </li>
        {comparison.structure.map((change) => (
          <li key={change.subject}>
            {change.subject}: {change.before} to {change.after} (
            {structureChanged(change) ? "changed" : "unchanged"})
          </li>
        ))}
        <li>Diagnostics added: {comparison.diagnostics.added.length}</li>
        <li>Diagnostics removed: {comparison.diagnostics.removed.length}</li>
        {relocationCounts(comparison.relocations).map(
          ([classification, count]) => (
            <li key={classification}>
              {classification}: {count}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

function relocationCounts(relocations: ComparisonValue["relocations"]) {
  const counts = new Map<string, number>();
  for (const outcome of relocations)
    counts.set(
      outcome.classification,
      (counts.get(outcome.classification) ?? 0) + 1,
    );
  return [...counts.entries()];
}

function structureChanged(change: ComparisonValue["structure"][number]) {
  return (
    change.before !== change.after || change.beforeSha256 !== change.afterSha256
  );
}

function PersistedReview({
  comparison,
  validation,
}: {
  comparison: ComparisonValue;
  validation: ValidationValue;
}) {
  return (
    <div className="mt-3 border-t pt-3">
      <div className="grid gap-3 lg:grid-cols-2">
        <Validation validation={validation} />
        <Comparison comparison={comparison} />
      </div>
      <RelocationReview relocations={comparison.relocations} />
    </div>
  );
}

function RelocationReview({
  relocations,
}: {
  relocations: ComparisonValue["relocations"];
}) {
  if (!relocations.length) return null;
  const needsAttention = relocations.some(
    ({ classification }) =>
      classification === "ambiguous" || classification === "unresolved",
  );
  return (
    <div
      className={`mt-4 border-l-4 p-3 text-sm ${
        needsAttention
          ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30"
          : "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
      }`}
    >
      <strong>
        {needsAttention
          ? "Authored records requiring review"
          : "Authored record relocation targets"}
      </strong>
      {relocations.map((outcome) => (
        <p
          className="mt-1 break-words"
          key={`${outcome.recordType}:${outcome.recordId}`}
        >
          {relocationDescription(outcome)} {outcome.reason}
        </p>
      ))}
      {needsAttention ? (
        <p className="mt-2 font-medium">
          Ambiguous and unresolved records remain attached to their original
          immutable evidence.
        </p>
      ) : null}
    </div>
  );
}

function relocationDescription(
  outcome: ComparisonValue["relocations"][number],
) {
  const target = outcome.target
    ? ` Target: ${outcome.target.componentIdentity}${
        outcome.target.normalizedStartOffset === undefined
          ? ""
          : ` at ${outcome.target.normalizedStartOffset}-${outcome.target.normalizedEndOffset}`
      }.`
    : "";
  return `${outcome.recordType} ${outcome.recordId}: ${outcome.classification}.${target}`;
}

function generationVersion(generation: unknown) {
  return typeof generation === "object" && generation && "version" in generation
    ? String(generation.version)
    : "historical";
}

function confirmActivation(
  derivativeId: string,
  rollback: boolean,
  consequences: ComparisonValue,
  activate: Activation,
) {
  const action = rollback ? "roll back to" : "activate";
  if (
    !window.confirm(
      `Explicitly ${action} Reading Derivative ${derivativeId}?\n\n${consequenceSummary(consequences)}\n\nSource evidence and authored records will not be changed.`,
    )
  )
    return;
  activate(
    derivativeId,
    rollback
      ? "Explicit rollback to a prior valid Reading Derivative"
      : "Explicit activation after candidate validation and consequence review",
    consequences,
  );
}

function consequenceSummary(consequences: ComparisonValue) {
  const relocationText = relocationCounts(consequences.relocations)
    .map(([classification, count]) => `${classification}: ${count}`)
    .join(", ");
  return [
    `Changed components: ${consequences.semantic.changedComponents.length}`,
    `Structural changes: ${consequences.structure.filter(structureChanged).length}`,
    `Diagnostics added/removed: ${consequences.diagnostics.added.length}/${consequences.diagnostics.removed.length}`,
    `Authored-record relocations: ${relocationText || "none"}`,
    ...consequences.relocations.map(relocationDescription),
  ].join("\n");
}

type Activation = (
  derivativeId: string,
  reason: string,
  expectedConsequences: ComparisonValue,
) => void;

async function previewRollback(
  derivativeId: string,
  preview: (derivativeId: string) => Promise<ComparisonValue>,
  activate: Activation,
) {
  const consequences = await preview(derivativeId);
  confirmActivation(derivativeId, true, consequences, activate);
}
