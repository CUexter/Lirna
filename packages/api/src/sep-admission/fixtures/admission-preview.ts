import { createHash, randomUUID } from "node:crypto";

export type AdmissionObservationKey = "submitted" | "recommended-archive";

export const admissionPreviewDefaults = {
  submittedUrl: "https://plato.stanford.edu/entries/admission/",
  recommendedArchiveUrl:
    "https://plato.stanford.edu/archives/sum2026/entries/admission/",
  title: "Admission integration",
  authors: ["Integration Author"],
  publisher: "Metaphysics Research Lab, Stanford University",
  publicationHistory: ["First published 2026"],
  rightsBasis: "publicly-accessible",
  sensitivityLevel: "ordinary-cloud",
  captureDiagnostics: {
    completeness: "complete",
    readingReadiness: "ready",
    readinessReasons: [] as string[],
  },
} as const;

export const readingIntegrationHtml =
  "<html><body><main><h2>Knowledge</h2><p>A typed paragraph.</p><script>window.pwned = true</script></main></body></html>";

export const admissionCaptureLimits = {
  maxComponents: 64,
  maxAssets: 256,
  maxResourceBytes: 50_000_000,
  maxTotalBytes: 250_000_000,
  maxDepth: 8,
  maxRedirects: 5,
  timeoutMilliseconds: 15_000,
  maxConcurrency: 4,
} as const;

export function recommendedArchiveUrl(
  observations: readonly AdmissionObservationKey[],
) {
  return observations.includes("recommended-archive")
    ? admissionPreviewDefaults.recommendedArchiveUrl
    : undefined;
}

export function defaultObservationBody(observation: AdmissionObservationKey) {
  return Buffer.from(
    `<html><body><main><p>${observation}</p></main></body></html>`,
  );
}

export function admissionPreviewFields({
  id = randomUUID(),
  stableKey = "sep:admission-fixture",
  title = admissionPreviewDefaults.title,
  now = new Date(),
}: {
  id?: string;
  stableKey?: string;
  title?: string;
  now?: Date;
} = {}) {
  return {
    id,
    stableKey,
    submittedUrl: admissionPreviewDefaults.submittedUrl,
    recommendedArchiveUrl: admissionPreviewDefaults.recommendedArchiveUrl,
    title,
    authors: [...admissionPreviewDefaults.authors],
    publisher: admissionPreviewDefaults.publisher,
    publicationHistory: [...admissionPreviewDefaults.publicationHistory],
    diagnostics: [],
    captureDiagnostics: {
      ...admissionPreviewDefaults.captureDiagnostics,
      readinessReasons: [
        ...admissionPreviewDefaults.captureDiagnostics.readinessReasons,
      ],
    },
    rightsBasis: admissionPreviewDefaults.rightsBasis,
    sensitivityLevel: admissionPreviewDefaults.sensitivityLevel,
    processingMilliseconds: 1,
    createdAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
  };
}

export function previewResourcesForObservations({
  previewId,
  observations,
  bodies,
  citationBody = Buffer.from("citation"),
  charset = "utf-8",
}: {
  previewId: string;
  observations: readonly AdmissionObservationKey[];
  bodies?: Partial<Record<AdmissionObservationKey, Buffer>>;
  citationBody?: Buffer;
  charset?: string;
}) {
  return observations.flatMap((observation) => {
    const body = bodies?.[observation] ?? defaultObservationBody(observation);
    return [
      previewResource({
        previewId,
        role: "main",
        identity: observation === "submitted" ? "active:/" : "sum2026:/",
        body,
        observationKey: observation,
        charset,
      }),
      ...(observation === "submitted"
        ? [
            previewResource({
              previewId,
              role: "citation-information",
              identity: "citation-information:admission",
              body: citationBody,
            }),
          ]
        : []),
    ];
  });
}

export function previewResource({
  previewId,
  role,
  identity,
  body,
  observationKey = "submitted",
  charset = "utf-8",
  retrievedAt = new Date(),
}: {
  previewId: string;
  role: "main" | "citation-information";
  identity: string;
  body: Buffer;
  observationKey?: AdmissionObservationKey;
  charset?: string;
  retrievedAt?: Date;
}) {
  const url =
    role === "main"
      ? "https://plato.stanford.edu/entries/reading/"
      : "https://plato.stanford.edu/cgi-bin/encyclopedia/archinfo.cgi?entry=reading";
  return {
    id: randomUUID(),
    previewId,
    observationKey,
    identity,
    role,
    requestedUrl: url,
    finalUrl: url,
    status: 200,
    mediaType: "text/html",
    charset,
    retrievedAt,
    selectedHeaders: { "content-type": "text/html; charset=utf-8" },
    requestCount: 1,
    downloadedBytes: body.byteLength,
    byteLength: body.byteLength,
    sha256: hash(body),
    discoveryEdge:
      role === "main" ? "submitted-entry" : "required-citation-information",
    depth: 0,
    body,
  };
}

export function hash(body: Buffer) {
  return createHash("sha256").update(body).digest("hex");
}
