import { Button } from "@lirna/ui/components/button";
import { Checkbox } from "@lirna/ui/components/checkbox";
import { Label } from "@lirna/ui/components/label";
import { useState } from "react";

import type { LibraryOutputs } from "@/clients/library";
import type { CitationResolution } from "../annotations/dom-utils";

type Evidence = LibraryOutputs["citationResolutions"]["evidence"][number];
type Inference = LibraryOutputs["citationResolutions"]["infer"];

export function CitationResolutionPanel({
  current,
  evidence,
  inference,
  pending,
  onCancel,
  onClear,
  onInfer,
  onSelect,
}: {
  current?: CitationResolution;
  evidence: Evidence;
  inference?: Inference;
  pending: { clear: boolean; infer: boolean; select: boolean };
  onCancel: () => void;
  onClear: () => void;
  onInfer: () => void;
  onSelect: (
    candidate: Evidence["candidates"][number],
    inference?: Extract<Inference, { status: "suggested" }>,
  ) => void;
}) {
  const [consent, setConsent] = useState(false);
  const suggested =
    inference?.status === "suggested"
      ? evidence.candidates.find(
          (candidate) => candidate.id === inference.candidateId,
        )
      : undefined;

  return (
    <section
      aria-labelledby="citation-resolution-heading"
      className="mt-3 space-y-4 rounded-md border border-primary/40 bg-primary/5 p-3"
    >
      <header>
        <p className="text-muted-foreground text-xs uppercase tracking-wide">
          {evidence.state === "ambiguous"
            ? "Ambiguous mention"
            : "Unresolved mention"}
        </p>
        <h3 className="font-serif text-lg" id="citation-resolution-heading">
          Resolve “{evidence.label}”
        </h3>
        <p className="mt-1 text-muted-foreground text-sm">
          {evidence.deterministicReason}
        </p>
      </header>
      <blockquote className="border-l-2 pl-3 font-serif text-sm">
        {evidence.context}
      </blockquote>
      <CandidateChoices
        current={current}
        evidence={evidence}
        onSelect={onSelect}
        pending={pending.select}
      />
      <InferenceControls
        consent={consent}
        evidence={evidence}
        onConsent={setConsent}
        onInfer={onInfer}
        pending={pending.infer}
      />
      <InferenceResult
        inference={inference}
        onSelect={onSelect}
        pending={pending.select}
        suggested={suggested}
      />
      <div className="flex flex-wrap gap-2">
        {current ? (
          <Button
            disabled={pending.clear}
            onClick={onClear}
            size="sm"
            type="button"
            variant="destructive"
          >
            Clear resolution
          </Button>
        ) : null}
        <Button onClick={onCancel} size="sm" type="button" variant="outline">
          Cancel
        </Button>
      </div>
    </section>
  );
}

function CandidateChoices({
  current,
  evidence,
  onSelect,
  pending,
}: {
  current?: CitationResolution;
  evidence: Evidence;
  onSelect: (candidate: Evidence["candidates"][number]) => void;
  pending: boolean;
}) {
  if (!evidence.candidates.length) {
    return (
      <p className="text-muted-foreground text-sm">
        Deterministic matching found no authored candidates. The mention remains
        unresolved.
      </p>
    );
  }
  return (
    <fieldset className="space-y-2">
      <legend className="font-medium text-sm">Bounded candidates</legend>
      {evidence.candidates.map((candidate) => {
        const selected =
          current?.bibliographyComponentIdentity ===
            candidate.bibliographyComponentIdentity &&
          current.bibliographyEntryId === candidate.bibliographyEntryId;
        return (
          <div className="rounded border bg-background p-3" key={candidate.id}>
            <p className="font-medium text-sm">{candidate.label}</p>
            <p className="mt-1 text-sm">{candidate.text}</p>
            <p className="mt-1 text-muted-foreground text-xs">
              {candidate.reason}
            </p>
            <Button
              className="mt-2"
              disabled={selected || pending}
              onClick={() => onSelect(candidate)}
              size="sm"
              type="button"
              variant={selected ? "outline" : "default"}
            >
              {candidateActionLabel(current, selected)}
            </Button>
          </div>
        );
      })}
    </fieldset>
  );
}

function candidateActionLabel(
  current: CitationResolution | undefined,
  selected: boolean,
) {
  if (selected) {
    return current?.method === "inferred"
      ? "Selected after inference"
      : "Manually selected";
  }
  return current
    ? "Correct to this candidate"
    : "Select this candidate manually";
}

function InferenceControls({
  consent,
  evidence,
  onConsent,
  onInfer,
  pending,
}: {
  consent: boolean;
  evidence: Evidence;
  onConsent: (consent: boolean) => void;
  onInfer: () => void;
  pending: boolean;
}) {
  if (!evidence.candidates.length) return null;
  return (
    <details className="rounded border bg-background p-3">
      <summary className="cursor-pointer font-medium text-sm">
        Optional inference disclosure
      </summary>
      <p className="mt-2 text-muted-foreground text-xs">
        If you continue, Lirna sends only this mention label, the displayed
        context, and these bounded candidate labels and texts to the configured
        provider. The provider can only suggest a supplied candidate. Nothing is
        saved until you explicitly accept the suggestion.
      </p>
      {evidence.policy.citationInference.allowed ? (
        <>
          <div className="mt-3 flex items-start gap-2">
            <Checkbox
              checked={consent}
              id="citation-inference-consent"
              onCheckedChange={onConsent}
            />
            <Label
              className="font-normal leading-5"
              htmlFor="citation-inference-consent"
            >
              I consent to sending this displayed data for this inference
              request.
            </Label>
          </div>
          <Button
            className="mt-3"
            disabled={!consent || pending}
            onClick={onInfer}
            size="sm"
            type="button"
            variant="outline"
          >
            {pending ? "Requesting suggestion..." : "Request inference"}
          </Button>
        </>
      ) : (
        <p className="mt-2 text-muted-foreground text-xs">
          Source handling policy does not permit external inference.
        </p>
      )}
    </details>
  );
}

function InferenceResult({
  inference,
  onSelect,
  pending,
  suggested,
}: {
  inference?: Inference;
  onSelect: (
    candidate: Evidence["candidates"][number],
    inference: Extract<Inference, { status: "suggested" }>,
  ) => void;
  pending: boolean;
  suggested?: Evidence["candidates"][number];
}) {
  if (!inference) return null;
  if (inference.status !== "suggested" || !suggested) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {inference.reasoning} The mention remains unresolved; manual selection
        is still available.
      </p>
    );
  }
  return (
    <div className="rounded border bg-background p-3" role="status">
      <p className="font-medium text-sm">
        Inference suggests {suggested.label}
      </p>
      <p className="mt-1 text-muted-foreground text-xs">
        Confidence {Math.round(inference.confidence * 100)}%.{" "}
        {inference.reasoning}
      </p>
      <Button
        className="mt-2"
        disabled={pending}
        onClick={() => onSelect(suggested, inference)}
        size="sm"
        type="button"
      >
        Accept inferred suggestion
      </Button>
    </div>
  );
}
