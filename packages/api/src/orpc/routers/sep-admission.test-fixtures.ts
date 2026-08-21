import type {
  SepAdmissionOperations,
  SepAdmissionPreview,
  SepAdmissionResult,
} from "../../sep-admission/sep-admission";
import type {
  SepAdmittedState,
  SepAdmittedStateOperations,
} from "../../sep-admission/sep-admitted-state";
import type { SepReadingContract } from "../../sep-admission/sep-reading-contract";

export const previewId = "10000000-0000-4000-8000-000000000000";
export const sourceId = "20000000-0000-4000-8000-000000000000";
export const stateId = "30000000-0000-4000-8000-000000000000";

export function operationsStub(
  overrides: Partial<SepAdmissionOperations> = {},
): SepAdmissionOperations {
  return {
    async submit() {
      return previewFixture();
    },
    async get() {
      return undefined;
    },
    async extend() {
      return undefined;
    },
    async delete() {
      return false;
    },
    async retry() {
      return undefined;
    },
    async admit() {
      return undefined;
    },
    ...overrides,
  };
}

export function admittedSourceStatesStub(
  overrides: Partial<SepAdmittedStateOperations> = {},
): SepAdmittedStateOperations {
  return {
    async listSources() {
      return [];
    },
    async deleteSource() {
      return false;
    },
    async getState() {
      return undefined;
    },
    async getReading() {
      return undefined;
    },
    ...overrides,
  };
}

export function previewFixture(
  overrides: Partial<SepAdmissionPreview> = {},
): SepAdmissionPreview {
  return {
    id: previewId,
    title: "Test entry",
    authors: [],
    publisher: "Stanford Encyclopedia of Philosophy",
    publicationHistory: [],
    submittedUrl: "https://plato.stanford.edu/entries/test/",
    policy: {
      rightsBasis: "publicly-accessible",
      sensitivityLevel: "ordinary-cloud",
    },
    metrics: {
      requests: 1,
      downloadedBytes: 100,
      retainedBytes: 100,
      processingMilliseconds: 1,
    },
    createdAt: "2026-08-18T12:00:00.000Z",
    expiresAt: "2026-08-25T12:00:00.000Z",
    diagnostics: [],
    capture: {
      budget: "standard",
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
      unresolvedResources: [],
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
    resources: [],
    observations: [],
    comparison: {
      result: "active-only",
      message: "Only the active entry was captured",
    },
    ...overrides,
  };
}

export function resultFixture(
  overrides: Partial<SepAdmissionResult> = {},
): SepAdmissionResult {
  return { sourceId, states: [], ...overrides } as SepAdmissionResult;
}

export function stateFixture(
  overrides: Partial<SepAdmittedState> = {},
): SepAdmittedState {
  return {
    id: stateId,
    sourceId,
    sequence: 1,
    observationKey: "submitted",
    canonicalUrl: "https://plato.stanford.edu/entries/test/",
    title: "Test entry",
    authors: [],
    publisher: "Stanford Encyclopedia of Philosophy",
    publicationHistory: [],
    admittedAt: "2026-08-18T12:00:00.000Z",
    resources: [],
    ...overrides,
  };
}

export function readingFixture(): SepReadingContract {
  const identity = "active:/";
  const url = "https://plato.stanford.edu/entries/test/";
  const retrievedAt = "2026-08-18T12:00:00.000Z";
  const sha256 = "a".repeat(64);
  return {
    version: 1,
    source: {
      id: sourceId,
      stateId,
      title: "Test entry",
      authors: [],
      publisher: "Stanford Encyclopedia of Philosophy",
      publicationHistory: [],
      canonicalUrl: url,
      observation: "submitted",
      admittedAt: retrievedAt,
    },
    mainComponent: {
      identity,
      requestedUrl: url,
      finalUrl: url,
      retrievedAt,
      sha256,
    },
    components: [
      {
        identity,
        role: "main",
        label: "Main entry",
        order: 0,
        requestedUrl: url,
        finalUrl: url,
        retrievedAt,
        sha256,
        toc: [],
        introductoryBlocks: [],
        sections: [],
        figures: [],
        bibliography: [],
        plainText: "",
      },
    ],
    capture: {
      completeness: "complete",
      readingReadiness: "ready",
      readinessReasons: [],
      diagnostics: [],
    },
    toc: [],
    introductoryBlocks: [],
    sections: [],
    plainText: "",
    provenance: {
      adapter: { id: "sep", version: "1" },
      parser: { id: "parse5", version: "7.3.0" },
      inputResourceHashes: [{ identity, sha256 }],
    },
  };
}
