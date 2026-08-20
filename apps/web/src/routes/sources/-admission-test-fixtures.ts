import type { InquiryOutputs } from "@/clients/inquiry";

export const previewId = "10000000-0000-4000-8000-000000000000";

type Preview = InquiryOutputs["sepAdmission"]["get"];
type Admission = InquiryOutputs["sepAdmission"]["admit"];

const resource: Preview["resources"][number] = {
  observationKey: "submitted",
  identity: "active:/",
  role: "main",
  requestedUrl: "https://plato.stanford.edu/entries/test/",
  finalUrl: "https://plato.stanford.edu/entries/test/",
  status: 200,
  mediaType: "text/html",
  charset: "utf-8",
  selectedHeaders: { "content-type": "text/html" },
  requestCount: 1,
  downloadedBytes: 1200,
  retrievedAt: "2026-08-18T12:00:00.000Z",
  byteLength: 1200,
  sha256: "a".repeat(64),
  discoveryEdge: "submitted",
  depth: 0,
};

export function previewFixture(overrides: Partial<Preview> = {}): Preview {
  return {
    id: previewId,
    title: "Synthetic SEP entry",
    authors: ["Ada Lovelace"],
    publisher: "Stanford Encyclopedia of Philosophy",
    publicationHistory: ["First published 2026"],
    submittedUrl: "https://plato.stanford.edu/entries/test/",
    recommendedArchiveUrl: "https://plato.stanford.edu/archives/test/",
    policy: {
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
    },
    metrics: {
      requests: 2,
      downloadedBytes: 2400,
      retainedBytes: 1200,
      processingMilliseconds: 18,
    },
    createdAt: "2026-08-18T12:00:00.000Z",
    expiresAt: "2026-08-25T12:00:00.000Z",
    diagnostics: [
      {
        level: "warning",
        code: "unresolved-resource",
        message: "One optional resource was not retained.",
      },
    ],
    capture: {
      budget: "standard",
      completeness: "partial",
      readingReadiness: "degraded",
      readinessReasons: ["One optional resource was unavailable."],
      unresolvedResources: [
        {
          url: "https://example.invalid/optional.css",
          parentIdentity: "active:/",
          role: "supplement",
          depth: 1,
          reason: "network-error",
          limit: false,
        },
      ],
      limits: {
        maxComponents: 64,
        maxAssets: 256,
        maxResourceBytes: 1024,
        maxTotalBytes: 4096,
        maxDepth: 8,
        maxRedirects: 5,
        timeoutMilliseconds: 15_000,
        maxConcurrency: 4,
      },
      retryUsed: false,
      retryAvailable: true,
    },
    resources: [resource],
    observations: [
      {
        key: "submitted",
        label: "Active",
        canonicalUrl: "https://plato.stanford.edu/entries/test/",
        resources: [resource],
      },
      {
        key: "recommended-archive",
        label: "Recommended archive",
        canonicalUrl: "https://plato.stanford.edu/archives/test/",
        resources: [],
      },
    ],
    comparison: {
      result: "distinct",
      message: "The active and archived entries differ.",
    },
    ...overrides,
  };
}

export function admittedFixture(): Admission {
  return {
    sourceId: "20000000-0000-4000-8000-000000000000",
    states: [
      {
        id: "30000000-0000-4000-8000-000000000000",
        sourceId: "20000000-0000-4000-8000-000000000000",
        sequence: 1,
        observationKey: "submitted",
        canonicalUrl: "https://plato.stanford.edu/entries/test/",
        title: "Synthetic SEP entry",
        authors: ["Ada Lovelace"],
        publisher: "Stanford Encyclopedia of Philosophy",
        publicationHistory: ["First published 2026"],
        admittedAt: "2026-08-18T12:01:00.000Z",
        resources: [resource],
      },
    ],
  };
}
