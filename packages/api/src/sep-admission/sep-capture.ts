// biome-ignore lint/style/noExcessiveLinesPerFile: The bounded capture workflow keeps its security checks and retry state machine together.
import {
  expandedSepCaptureLimits,
  type SepCaptureLimits,
  type SepResourceRole,
  standardSepCaptureLimits,
} from "./sep-bundle";
import {
  captureOptionalBundle,
  type OptionalCaptureResult,
} from "./sep-bundle-capture";
import {
  decodeCapturedHtml,
  parseCitationInformation,
  parseTitle,
} from "./sep-html";
import { captureSepHtml } from "./sep-http";
import { toCapturedSepResource } from "./sep-resource-capture";
import {
  activeEntryUrl,
  type ClassifiedSepUrl,
  citationInformationUrl,
  classifySepUrl,
  publicationScope,
  SepAdmissionError,
} from "./sep-url";

export { SepAdmissionError } from "./sep-url";

export interface SepDiagnostic {
  level: "info" | "warning";
  code: string;
  message: string;
}

export interface SepUnresolvedResource {
  url: string;
  parentIdentity: string;
  role: Exclude<SepResourceRole, "main" | "citation-information">;
  depth: number;
  reason: string;
  limit: boolean;
}

export interface SepCaptureReport {
  budget: "standard" | "expanded";
  completeness: "complete" | "partial" | "stopped";
  readingReadiness: "ready" | "degraded";
  readinessReasons: string[];
  unresolvedResources: SepUnresolvedResource[];
  limits: SepCaptureLimits;
  retryUsed: boolean;
}

export interface CapturedSepResource {
  observationKey: SepObservationKey;
  identity: string;
  role: SepResourceRole;
  requestedUrl: string;
  finalUrl: string;
  status: number;
  mediaType: string;
  charset?: string;
  contentEncoding?: string;
  retrievedAt: Date;
  selectedHeaders: Record<string, string>;
  requestCount: number;
  downloadedBytes: number;
  byteLength: number;
  sha256: string;
  discoveryEdge: string;
  depth: number;
  body: Buffer;
}

export type SepObservationKey = "submitted" | "recommended-archive";

export interface SepCaptureResult {
  stableKey: string;
  submittedUrl: string;
  recommendedArchiveUrl?: string;
  title: string;
  authors: string[];
  publisher: string;
  publicationHistory: string[];
  diagnostics: SepDiagnostic[];
  captureReport: SepCaptureReport;
  processingMilliseconds: number;
  resources: CapturedSepResource[];
}

export interface SepCaptureClient {
  capture(
    url: string,
    budget?: "standard" | "expanded",
  ): Promise<SepCaptureResult>;
}

interface CaptureOptions {
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  performanceNow?: () => number;
  limits?: Partial<SepCaptureLimits>;
  expandedLimits?: Partial<SepCaptureLimits>;
  maxRedirects?: number;
  maxResourceBytes?: number;
  timeoutMilliseconds?: number;
}

export function createSepCaptureClient(
  options: CaptureOptions = {},
): SepCaptureClient {
  const fetchResource = options.fetch ?? globalThis.fetch;
  const now = options.now ?? (() => new Date());
  const performanceNow = options.performanceNow ?? (() => performance.now());
  const limitsByBudget = {
    standard: compactLimits({
      ...standardSepCaptureLimits,
      ...options.limits,
      ...(options.maxRedirects === undefined
        ? {}
        : { maxRedirects: options.maxRedirects }),
      ...(options.maxResourceBytes === undefined
        ? {}
        : { maxResourceBytes: options.maxResourceBytes }),
      ...(options.timeoutMilliseconds === undefined
        ? {}
        : { timeoutMilliseconds: options.timeoutMilliseconds }),
    }),
    expanded: compactLimits({
      ...expandedSepCaptureLimits,
      ...options.expandedLimits,
    }),
  };

  return {
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The capture transaction keeps its shared active/archive byte ledger explicit.
    async capture(value, budget = "standard") {
      const limits = limitsByBudget[budget];
      let processingMilliseconds = 0;
      const startedAt = performanceNow();
      const submitted = classifySepUrl(value);
      const [main, citation] = await captureRequiredResources({
        submitted,
        limits,
        fetchResource,
        now,
      });
      const mandatoryBytes = main.byteLength + citation.byteLength;
      if (mandatoryBytes > limits.maxTotalBytes) {
        throw new SepAdmissionError(
          `Mandatory SEP evidence exceeds the ${limits.maxTotalBytes}-byte bundle limit`,
        );
      }
      const mainClassification = classifySepUrl(main.finalUrl);
      const scope = publicationScope(mainClassification);
      main.identity = `${scope.archive ?? "active"}:/`;
      const title = parseTitle(
        decodeCapturedHtml(main.body, main.charset, main.role),
      );
      if (!title) {
        throw new SepAdmissionError(
          "The SEP main entry does not contain a readable title",
        );
      }
      const metadata = parseCitationInformation(
        decodeCapturedHtml(citation.body, citation.charset, citation.role),
      );
      const recommendedArchiveUrl = validateArchiveRecommendation(
        metadata.recommendedArchiveUrl,
        citation.finalUrl,
        submitted.entry,
      );
      const archiveResources: CapturedSepResource[] = [];
      let archiveOptional: OptionalCaptureResult | undefined;
      let archiveMain: CapturedSepResource | undefined;
      let archiveScope: ReturnType<typeof publicationScope> | undefined;
      if (recommendedArchiveUrl) {
        const archiveTarget = classifySepUrl(recommendedArchiveUrl);
        archiveMain = await captureRequired({
          target: archiveTarget,
          role: "main",
          edge: "recommended-archive-entry",
          limits,
          fetchResource,
          now,
          observationKey: "recommended-archive",
        });
        archiveScope = publicationScope(classifySepUrl(archiveMain.finalUrl));
        archiveMain.identity = `${archiveScope.archive ?? "active"}:/`;
        if (mandatoryBytes + archiveMain.byteLength > limits.maxTotalBytes) {
          throw new SepAdmissionError(
            `Mandatory SEP observations exceed the ${limits.maxTotalBytes}-byte bundle limit`,
          );
        }
      }
      const observationBytes = mandatoryBytes + (archiveMain?.byteLength ?? 0);
      const optional = await captureOptionalBundle({
        main,
        scope,
        limits,
        fetchResource,
        now,
        initialBytes: observationBytes,
      });
      if (archiveMain && archiveScope) {
        archiveOptional = await captureOptionalBundle({
          main: archiveMain,
          scope: archiveScope,
          limits,
          fetchResource,
          now,
          initialBytes: optional.consumedBytes,
        });
        archiveResources.push(archiveMain, ...archiveOptional.resources);
      }
      processingMilliseconds += performanceNow() - startedAt;
      return {
        stableKey: `sep:${submitted.entry}`,
        submittedUrl: submitted.url.href,
        recommendedArchiveUrl,
        title,
        authors: metadata.authors,
        publisher: metadata.publisher,
        publicationHistory: metadata.publicationHistory,
        diagnostics: metadata.diagnostics,
        captureReport: buildCaptureReport(
          budget,
          limits,
          archiveOptional
            ? mergeOptionalResults(optional, archiveOptional)
            : optional,
        ),
        processingMilliseconds: Math.max(0, Math.round(processingMilliseconds)),
        resources: [main, citation, ...optional.resources, ...archiveResources],
      };
    },
  };
}

async function captureRequiredResources(options: {
  submitted: ClassifiedSepUrl;
  limits: SepCaptureLimits;
  fetchResource: typeof globalThis.fetch;
  now: () => Date;
}): Promise<[CapturedSepResource, CapturedSepResource]> {
  const mainTarget = activeEntryUrl(options.submitted.entry);
  const citationTarget =
    options.submitted.kind === "citation-information"
      ? options.submitted
      : citationInformationUrl(options.submitted.entry);
  const main = await captureRequired({
    target: mainTarget,
    role: "main",
    edge: "submitted-entry",
    ...options,
    observationKey: "submitted",
  });
  const citation = await captureRequired({
    target: citationTarget,
    role: "citation-information",
    edge: "required-citation-information",
    ...options,
    observationKey: "submitted",
  });
  return [main, citation];
}

async function captureRequired(options: {
  target: ClassifiedSepUrl;
  role: "main" | "citation-information";
  edge: string;
  limits: SepCaptureLimits;
  fetchResource: typeof globalThis.fetch;
  now: () => Date;
  observationKey: SepObservationKey;
}): Promise<CapturedSepResource> {
  const captured = await captureSepHtml(options.target, options.role, {
    fetch: options.fetchResource,
    maxRedirects: options.limits.maxRedirects,
    maxResourceBytes: options.limits.maxResourceBytes,
    timeoutMilliseconds: options.limits.timeoutMilliseconds,
  });
  return toCapturedSepResource(captured, {
    observationKey: options.observationKey,
    identity:
      options.role === "main"
        ? "active:/"
        : `citation-information:${options.target.entry}`,
    role: options.role,
    requestedUrl: options.target.url.href,
    discoveryEdge: options.edge,
    depth: 0,
    retrievedAt: options.now(),
  });
}

function mergeOptionalResults(
  active: OptionalCaptureResult,
  archive: OptionalCaptureResult,
): OptionalCaptureResult {
  return {
    resources: [...active.resources, ...archive.resources],
    unresolved: [...active.unresolved, ...archive.unresolved],
    unknownComponent: active.unknownComponent || archive.unknownComponent,
    consumedBytes: archive.consumedBytes,
  };
}

function buildCaptureReport(
  budget: "standard" | "expanded",
  limits: SepCaptureLimits,
  optional: OptionalCaptureResult,
): SepCaptureReport {
  const stopped = optional.unresolved.some((item) => item.limit);
  const readinessReasons = [
    ...(optional.unresolved.some((item) => item.role !== "semantic-asset")
      ? ["One or more authored reading components are unavailable"]
      : []),
    ...(optional.unknownComponent
      ? ["An unknown component requires explicit reading support"]
      : []),
  ];
  return {
    budget,
    completeness: stopped
      ? "stopped"
      : optional.unresolved.length
        ? "partial"
        : "complete",
    readingReadiness: readinessReasons.length ? "degraded" : "ready",
    readinessReasons,
    unresolvedResources: optional.unresolved,
    limits,
    retryUsed: budget === "expanded",
  };
}

function compactLimits(limits: SepCaptureLimits): SepCaptureLimits {
  for (const value of Object.values(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new Error("SEP capture limits must be positive safe integers");
    }
  }
  return limits;
}

function validateArchiveRecommendation(
  recommendation: string | undefined,
  citationUrl: string,
  entry: string,
): string | undefined {
  if (!recommendation) {
    return undefined;
  }
  const classified = classifySepUrl(new URL(recommendation, citationUrl).href);
  if (
    classified.kind !== "main" ||
    !classified.archived ||
    classified.entry !== entry
  ) {
    throw new SepAdmissionError(
      "SEP recommended an invalid archive for this entry",
    );
  }
  return classified.url.href;
}
