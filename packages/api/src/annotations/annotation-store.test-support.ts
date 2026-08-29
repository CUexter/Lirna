import type { ActiveReadingDerivativeOperations } from "../sep-admission/state/active-reading-derivative";

const sourceId = "10000000-0000-4000-8000-000000000000";
const stateId = "20000000-0000-4000-8000-000000000000";

export function activeReadingStub(
  available: boolean,
): ActiveReadingDerivativeOperations {
  return {
    async read() {
      return available
        ? {
            status: "active",
            value: {
              sourceId,
              sourceTitle: "Evidence",
              stateId,
              derivativeId: "40000000-0000-4000-8000-000000000000",
              activationId: "50000000-0000-4000-8000-000000000000",
              activationSequence: 1,
              reading: readingPayload(),
              policy: {
                rightsBasis: "publicly-accessible",
                sensitivityLevel: "ordinary-cloud",
              },
            },
          }
        : { status: "no-active-derivative" };
    },
    async previewActivation() {
      return { status: "candidate-not-found" };
    },
    async activate() {
      return { status: "candidate-not-found" };
    },
  };
}

function readingPayload() {
  const component = {
    identity: "article:main",
    role: "main" as const,
    label: "Article",
    order: 0,
    requestedUrl: "https://example.com/article",
    finalUrl: "https://example.com/article",
    retrievedAt: "2026-08-18T10:00:00.000Z",
    sha256: "a".repeat(64),
    toc: [],
    introductoryBlocks: [],
    sections: [],
    figures: [],
    bibliography: [],
    plainText: "Readevidence carefully.",
  };
  return {
    version: 1 as const,
    source: {
      id: sourceId,
      stateId,
      title: "Evidence",
      authors: [],
      publisher: "Example",
      publicationHistory: [],
      canonicalUrl: "https://example.com/article",
      observation: "submitted" as const,
      admittedAt: "2026-08-18T10:00:00.000Z",
    },
    mainComponent: {
      identity: component.identity,
      requestedUrl: component.requestedUrl,
      finalUrl: component.finalUrl,
      retrievedAt: component.retrievedAt,
      sha256: component.sha256,
    },
    components: [component],
    capture: {
      completeness: "complete" as const,
      readingReadiness: "ready" as const,
      readinessReasons: [],
      diagnostics: [],
    },
    toc: [],
    introductoryBlocks: [],
    sections: [],
    plainText: component.plainText,
    provenance: {
      adapter: { id: "sep" as const, version: "1" as const },
      parser: { id: "parse5" as const, version: "7.3.0" as const },
      inputResourceHashes: [],
    },
  };
}
