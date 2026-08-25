import { Badge } from "@lirna/ui/components/badge";
import { Button } from "@lirna/ui/components/button";
import { Link } from "@tanstack/react-router";
import { RefreshCwIcon } from "lucide-react";

import type { InquiryOutputs } from "@/clients/inquiry";
import { ServerErrorMessage } from "@/components/server-error-message";
import { SepAdmissionPreview } from "@/components/source-admission/preview";
import { useSepUpdate } from "@/hooks/use-sep-update";
import { DerivativeReview } from "./derivative-review";

type Workspace = InquiryOutputs["sources"]["readingWorkspace"];

export function SourceInformation({ workspace }: { workspace: Workspace }) {
  if (workspace.source.kind === "legacy-sep-text" || !workspace.state) {
    return <LegacySourceInformation source={workspace.source} />;
  }
  return (
    <SepSourceInformation
      workspace={{ ...workspace, state: workspace.state }}
    />
  );
}

type SepWorkspace = Workspace & { state: NonNullable<Workspace["state"]> };

function SepSourceInformation({ workspace }: { workspace: SepWorkspace }) {
  const update = useSepUpdate(workspace.source.id);
  const { source, state } = workspace;

  return (
    <section
      aria-labelledby="source-information-title"
      className="border-b bg-muted/20 px-4 py-6 sm:px-6 lg:px-10"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
              Source information
            </p>
            <h2
              className="mt-1 font-serif text-2xl"
              id="source-information-title"
            >
              State {state.sequence + 1} evidence
            </h2>
            <p className="mt-1 text-muted-foreground text-sm">
              Immutable capture admitted {formatDate(state.admittedAt)}
            </p>
          </div>
          <Button disabled={update.checkPending} onClick={update.check}>
            <RefreshCwIcon data-icon="inline-start" />
            {update.checkPending ? "Checking SEP…" : "Check for update"}
          </Button>
        </div>

        <nav aria-label="Source states" className="flex flex-wrap gap-2">
          {source.states.map((candidate) => (
            <Link
              className={`rounded-md border px-3 py-2 text-sm ${
                candidate.id === state.id
                  ? "bg-primary text-primary-foreground"
                  : "bg-background"
              }`}
              key={candidate.id}
              params={{ sourceId: source.id, stateId: candidate.id }}
              to="/sources/$sourceId/$stateId"
            >
              State {candidate.sequence + 1}:{" "}
              {observationLabel(candidate.observationKey)}
            </Link>
          ))}
        </nav>

        <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <Fact label="Source identity" value={source.id} />
          <Fact label="Publisher" value={state.publisher} />
          <Fact
            label="Authors"
            value={state.authors.join(", ") || "Not recorded"}
          />
          <Fact
            label="Publication history"
            value={state.publicationHistory.join("; ") || "Not recorded"}
          />
          <Fact label="Rights basis" value={state.policy.rightsBasis} />
          <Fact label="Sensitivity" value={state.policy.sensitivityLevel} />
          <Fact label="Canonical URL" value={state.canonicalUrl} />
        </dl>

        <details className="border bg-background p-4">
          <summary className="cursor-pointer font-medium">
            Resource and component manifest ({state.resources.length} resources)
          </summary>
          <div className="mt-4 grid gap-3">
            {state.resources.map((resource) => (
              <div
                className="min-w-0 border-l-2 pl-3 text-xs"
                key={resource.identity}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{resource.identity}</strong>
                  <Badge variant="outline">{resource.role}</Badge>
                  <span>{formatBytes(resource.byteLength)}</span>
                </div>
                <p className="mt-1 break-all text-muted-foreground">
                  SHA-256 {resource.sha256}
                </p>
                <p className="break-all">Requested {resource.requestedUrl}</p>
                <p className="break-all">Final {resource.finalUrl}</p>
                <p>
                  Retrieved {formatDate(resource.retrievedAt)} via{" "}
                  {resource.discoveryEdge}
                </p>
                <p>
                  HTTP {resource.status} · {resource.mediaType} · depth{" "}
                  {resource.depth}
                </p>
                <p>
                  Charset {resource.charset ?? "not declared"} · encoding{" "}
                  {resource.contentEncoding ?? "not declared"}
                </p>
                <p>
                  {resource.requestCount} requests ·{" "}
                  {formatBytes(resource.downloadedBytes)} downloaded
                </p>
                <p className="break-words">
                  Selected headers {formatHeaders(resource.selectedHeaders)}
                </p>
              </div>
            ))}
            <h3 className="font-medium">
              Reading components ({state.components.length})
            </h3>
            {state.components.map((component) => (
              <div
                className="min-w-0 border-l-2 pl-3 text-xs"
                key={component.identity}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{component.label}</strong>
                  <Badge variant="outline">{component.role}</Badge>
                  <span>{component.identity}</span>
                </div>
                <p className="break-all">Requested {component.requestedUrl}</p>
                <p className="break-all">Final {component.finalUrl}</p>
                <p className="break-all">SHA-256 {component.sha256}</p>
                <p>
                  Order {component.order} · retrieved{" "}
                  {formatDate(component.retrievedAt)}
                </p>
                {component.parentIdentity ? (
                  <p>Parent {component.parentIdentity}</p>
                ) : null}
              </div>
            ))}
          </div>
        </details>

        <details className="border bg-background p-4">
          <summary className="cursor-pointer font-medium">
            Diagnostics and Derivatives
          </summary>
          <div className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <h3 className="font-medium">Capture</h3>
              <p>
                {state.capture.completeness}; Reading{" "}
                {state.capture.readingReadiness}
              </p>
              {state.capture.readinessReasons.map((reason) => (
                <p key={reason}>{reason}</p>
              ))}
              {state.capture.unresolvedResources.map((resource) => (
                <p
                  className="break-all"
                  key={`${resource.role}:${resource.url}`}
                >
                  Unresolved {resource.role}: {resource.url} ({resource.reason})
                </p>
              ))}
              {state.diagnostics.length === 0 ? (
                <p>No diagnostics recorded.</p>
              ) : null}
              {state.diagnostics.map((item) => (
                <p key={`${item.code}:${item.message}`}>
                  {item.code}: {item.message}
                </p>
              ))}
            </div>
            <div>
              <h3 className="font-medium">Derivative provenance</h3>
              {state.derivatives.map((derivative) => (
                <div className="mt-2" key={derivative.id}>
                  <p>
                    {derivative.kind} · {derivative.valid ? "valid" : "invalid"}{" "}
                    · {derivative.currentActivation ? "current" : "inactive"}
                  </p>
                  {derivative.provenance ? (
                    <p className="break-words text-xs">
                      {derivative.provenance.adapter.id}{" "}
                      {derivative.provenance.adapter.version} ·{" "}
                      {derivative.provenance.parser.id}{" "}
                      {derivative.provenance.parser.version} ·{" "}
                      {derivative.provenance.inputResourceHashes.length} inputs
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </details>

        <DerivativeReview sourceId={source.id} state={state} />

        {update.checkError ? (
          <ServerErrorMessage error={update.checkError} />
        ) : null}
        {update.preview?.update ? (
          <div className="flex flex-col gap-4" aria-live="polite">
            <p className="font-medium">
              {update.preview.update.observations
                .map((item) => `${observationLabel(item.key)}: ${item.result}`)
                .join(" · ")}
            </p>
            <SepAdmissionPreview
              admission={update.admission}
              lifecycle={update.lifecycle}
              preview={update.preview}
            />
          </div>
        ) : null}
      </div>
    </section>
  );
}

function LegacySourceInformation({ source }: { source: Workspace["source"] }) {
  return (
    <section
      aria-labelledby="source-information-title"
      className="border-b bg-muted/20 px-4 py-6 sm:px-6 lg:px-10"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div>
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
            Source information
          </p>
          <h2
            className="mt-1 font-serif text-2xl"
            id="source-information-title"
          >
            Legacy SEP text
          </h2>
        </div>
        <p className="max-w-3xl text-muted-foreground text-sm">
          This preserved prototype remains readable in its original state. A
          first-class capture is stored as a related Source rather than
          replacing this content or identity.
        </p>
        <div>
          {source.replacement ? (
            <Link
              params={{
                sourceId: source.replacement.id,
                stateId: source.replacement.currentStateId,
              }}
              to="/sources/$sourceId/$stateId"
            >
              Open related replacement: {source.replacement.title}
            </Link>
          ) : (
            <Link
              search={{ replacesSourceId: source.id }}
              to="/sources/admission"
            >
              Offer related replacement
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="break-words font-medium">{value}</dd>
    </div>
  );
}

function observationLabel(key: string) {
  return key === "submitted" ? "Active" : "Recommended archive";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatBytes(value: number) {
  return new Intl.NumberFormat(undefined, {
    style: "unit",
    unit: "byte",
    unitDisplay: "short",
  }).format(value);
}

function formatHeaders(headers: Record<string, string>) {
  const entries = Object.entries(headers);
  return entries.length === 0
    ? "none recorded"
    : entries.map(([name, value]) => `${name}: ${value}`).join("; ");
}
