import { readingComponentSummary } from "@lirna/api/client/reading-content";
import type { InquiryOutputs } from "@/clients/inquiry";

import { readingFixture, sourceId, stateId } from "./-reading-test-fixtures";

type Workspace = InquiryOutputs["sources"]["readingWorkspace"];

export function readingWorkspaceFixture(
  reading = readingFixture(),
  citationResolutions: Workspace["citationResolutions"] = [],
): Workspace {
  const admittedAt = reading.source.admittedAt;
  return {
    reading,
    citationResolutions,
    source: {
      id: sourceId,
      title: reading.source.title,
      admittedAt,
      authors: reading.source.authors,
      publisher: reading.source.publisher,
      publicationHistory: reading.source.publicationHistory,
      kind: "sep",
      stableKey: "sep:test",
      currentStateId: stateId,
      states: [
        {
          id: stateId,
          sequence: 0,
          observationKey: "submitted",
          canonicalUrl: reading.source.canonicalUrl,
          title: reading.source.title,
          publisher: reading.source.publisher,
          admittedAt,
        },
        {
          id: "30000000-0000-4000-8000-000000000000",
          sequence: 1,
          observationKey: "recommended-archive",
          canonicalUrl: reading.source.canonicalUrl,
          title: reading.source.title,
          publisher: reading.source.publisher,
          admittedAt,
        },
      ],
    },
    state: {
      id: stateId,
      sourceId,
      sequence: 0,
      observationKey: "submitted",
      canonicalUrl: reading.source.canonicalUrl,
      title: reading.source.title,
      authors: reading.source.authors,
      publisher: reading.source.publisher,
      publicationHistory: reading.source.publicationHistory,
      admittedAt,
      policy: {
        rightsBasis: "publicly-accessible",
        sensitivityLevel: "ordinary-cloud",
      },
      diagnostics: reading.capture.diagnostics,
      capture: {
        budget: "standard",
        completeness: reading.capture.completeness,
        readingReadiness: reading.capture.readingReadiness,
        readinessReasons: reading.capture.readinessReasons,
        unresolvedResources: [
          {
            url: "https://plato.stanford.edu/entries/synthetic/missing.html",
            parentIdentity: "article",
            role: "supplement",
            depth: 1,
            reason: "Capture returned 404",
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
      },
      resources: [
        {
          identity: reading.mainComponent.identity,
          role: "main",
          requestedUrl: reading.mainComponent.requestedUrl,
          finalUrl: reading.mainComponent.finalUrl,
          status: 200,
          mediaType: "text/html",
          charset: "utf-8",
          selectedHeaders: { "content-type": "text/html" },
          requestCount: 1,
          downloadedBytes: 1200,
          retrievedAt: reading.mainComponent.retrievedAt,
          byteLength: 1200,
          sha256: reading.mainComponent.sha256,
          discoveryEdge: "submitted-entry",
          depth: 0,
        },
      ],
      components: reading.components.map(readingComponentSummary),
      derivatives: [
        {
          id: "40000000-0000-4000-8000-000000000000",
          kind: "sep-reading-v1",
          valid: true,
          validation: { status: "valid", checks: [] },
          createdAt: admittedAt,
          currentActivation: {
            id: "50000000-0000-4000-8000-000000000000",
            derivativeId: "40000000-0000-4000-8000-000000000000",
            sequence: 1,
            actorId: "system:admission",
            reason: "Initial validated derivative",
            activatedAt: admittedAt,
            consequences: {
              semantic: { changedComponents: [] },
              structure: [],
              diagnostics: { added: [], removed: [] },
              relocations: [],
            },
          },
          generation: {
            version: 1,
            parser: { id: "parse5", version: "7.3.0" },
            renderer: { id: "lirna-reading-react", version: "1" },
            inputResourceHashes: reading.provenance.inputResourceHashes,
          },
          activationHistory: [
            {
              id: "50000000-0000-4000-8000-000000000000",
              derivativeId: "40000000-0000-4000-8000-000000000000",
              sequence: 1,
              actorId: "system:admission",
              reason: "Initial validated derivative",
              activatedAt: admittedAt,
              consequences: {
                semantic: { changedComponents: [] },
                structure: [],
                diagnostics: { added: [], removed: [] },
                relocations: [],
              },
            },
          ],
          provenance: reading.provenance,
        },
      ],
    },
  };
}

let updateResult: unknown;

export function setSepUpdateResult(value?: unknown) {
  updateResult = value;
}

export const sepUpdateClientStub = {
  checkUpdate: {
    mutationOptions: () => ({ mutationFn: async () => updateResult }),
  },
  extend: { mutationOptions: () => ({ mutationFn: async () => undefined }) },
  delete: { mutationOptions: () => ({ mutationFn: async () => undefined }) },
  retry: { mutationOptions: () => ({ mutationFn: async () => undefined }) },
  admit: { mutationOptions: () => ({ mutationFn: async () => undefined }) },
};

export const derivativeClientStub = {
  generate: {
    mutationOptions: () => ({ mutationFn: async () => undefined }),
  },
  previewActivation: {
    mutationOptions: () => ({ mutationFn: async () => undefined }),
  },
  activate: {
    mutationOptions: () => ({ mutationFn: async () => undefined }),
  },
};
