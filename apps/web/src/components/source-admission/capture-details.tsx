import { Badge } from "@lirna/ui/components/badge";
import { Button } from "@lirna/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import { Separator } from "@lirna/ui/components/separator";
import { RotateCcwIcon } from "lucide-react";

import type { SepAdmissionPreviewData } from "./preview";

interface SepCaptureDetailsProps {
  preview: SepAdmissionPreviewData;
  retryPending: boolean;
  actionsDisabled: boolean;
  onRetry: () => void;
}

const byteFormat = new Intl.NumberFormat(undefined, {
  style: "unit",
  unit: "byte",
  unitDisplay: "short",
  maximumFractionDigits: 0,
});

function statusLabel(value: string) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export function SepCaptureDetails({
  preview,
  retryPending,
  actionsDisabled,
  onRetry,
}: SepCaptureDetailsProps) {
  const { capture } = preview;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-auto font-serif text-xl">
              Bundle status
            </CardTitle>
            <Badge
              variant={
                capture.completeness === "complete"
                  ? "secondary"
                  : "destructive"
              }
            >
              Completeness: {statusLabel(capture.completeness)}
            </Badge>
            <Badge
              variant={
                capture.readingReadiness === "ready" ? "secondary" : "outline"
              }
            >
              Reading readiness: {statusLabel(capture.readingReadiness)}
            </Badge>
          </div>
          <CardDescription>
            Completeness reports capture outcomes. Reading readiness separately
            reports whether every retained component has known reading support.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {capture.readinessReasons.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {capture.readinessReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              The captured bundle has known reading support.
            </p>
          )}

          <div>
            <h3 className="font-medium text-sm">Unresolved resources</h3>
            {capture.unresolvedResources.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-3">
                {capture.unresolvedResources.map((resource) => (
                  <li
                    className="rounded-md border border-border/70 p-3 text-sm"
                    key={`${resource.parentIdentity}:${resource.url}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={resource.limit ? "destructive" : "outline"}
                      >
                        {resource.limit ? "Limit reached" : resource.role}
                      </Badge>
                      <span className="text-muted-foreground text-xs">
                        Depth {resource.depth} from {resource.parentIdentity}
                      </span>
                    </div>
                    <p className="mt-2">{resource.reason}</p>
                    <p className="mt-1 break-all text-muted-foreground text-xs">
                      {resource.url}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-muted-foreground text-sm">
                No authored resources were omitted.
              </p>
            )}
          </div>

          <div>
            <h3 className="font-medium text-sm">
              {statusLabel(capture.budget)} capture limits
            </h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <Limit label="Components" value={capture.limits.maxComponents} />
              <Limit label="Assets" value={capture.limits.maxAssets} />
              <Limit label="Depth" value={capture.limits.maxDepth} />
              <Limit label="Redirects" value={capture.limits.maxRedirects} />
              <Limit
                label="Per resource"
                value={byteFormat.format(capture.limits.maxResourceBytes)}
              />
              <Limit
                label="Bundle"
                value={byteFormat.format(capture.limits.maxTotalBytes)}
              />
              <Limit
                label="Request timeout"
                value={`${capture.limits.timeoutMilliseconds.toLocaleString()} ms`}
              />
              <Limit
                label="Concurrency"
                value={capture.limits.maxConcurrency}
              />
            </dl>
          </div>
        </CardContent>
        {capture.retryAvailable ? (
          <CardFooter className="flex flex-col items-start gap-3 border-t pt-5">
            <p className="text-muted-foreground text-xs leading-5">
              One retry can replace this bundle using the server's larger
              capture limits. The attempt is consumed when started; existing
              evidence remains unchanged if it fails.
            </p>
            <Button
              disabled={actionsDisabled}
              onClick={onRetry}
              variant="outline"
            >
              <RotateCcwIcon data-icon="inline-start" />
              {retryPending
                ? "Retrying with larger limits…"
                : "Use larger capture limits"}
            </Button>
          </CardFooter>
        ) : (
          <CardFooter className="border-t pt-5 text-muted-foreground text-xs">
            The one-time larger capture retry has been used.
          </CardFooter>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">
            Source-state manifest
          </CardTitle>
          <CardDescription>
            Exact retained resources and provenance. Captured HTML is never
            rendered here.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {preview.resources.map((resource, index) => (
            <div
              className="flex flex-col gap-2"
              key={`${resource.observationKey}:${resource.identity}`}
            >
              {index > 0 ? <Separator /> : null}
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{resource.role}</Badge>
                <code className="text-xs">{resource.identity}</code>
                <span className="ml-auto text-muted-foreground text-xs">
                  HTTP {resource.status} ·{" "}
                  {byteFormat.format(resource.byteLength)}
                </span>
              </div>
              <dl className="grid gap-2 text-xs sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">Requested URL</dt>
                <dd className="break-all">{resource.requestedUrl}</dd>
                <dt className="text-muted-foreground">Final URL</dt>
                <dd className="break-all">{resource.finalUrl}</dd>
                <dt className="text-muted-foreground">Response</dt>
                <dd>
                  {resource.mediaType}
                  {resource.charset ? `; charset=${resource.charset}` : ""} ·{" "}
                  {resource.requestCount} request
                  {resource.requestCount === 1 ? "" : "s"} ·{" "}
                  {byteFormat.format(resource.downloadedBytes)} downloaded
                </dd>
                <dt className="text-muted-foreground">Retrieved</dt>
                <dd>{new Date(resource.retrievedAt).toLocaleString()}</dd>
                <dt className="text-muted-foreground">Content encoding</dt>
                <dd>{resource.contentEncoding ?? "identity"}</dd>
                <dt className="text-muted-foreground">Selected headers</dt>
                <dd className="break-all font-mono">
                  {Object.entries(resource.selectedHeaders)
                    .map(([name, value]) => `${name}: ${value}`)
                    .join(" · ") || "None"}
                </dd>
                <dt className="text-muted-foreground">Discovery</dt>
                <dd className="break-all">
                  {resource.discoveryEdge} · depth {resource.depth}
                </dd>
                <dt className="text-muted-foreground">Evidence</dt>
                <dd className="break-all font-mono">
                  sha256:{resource.sha256}
                </dd>
              </dl>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Limit({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs uppercase tracking-wide">
        {label}
      </dt>
      <dd className="mt-1">{value}</dd>
    </div>
  );
}
