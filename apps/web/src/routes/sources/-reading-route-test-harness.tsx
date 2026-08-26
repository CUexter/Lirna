import { afterEach, mock } from "bun:test";
import { createRootRoute, createRoute } from "@tanstack/react-router";
import { cleanup, within } from "@testing-library/react";

import type { InquiryOutputs } from "@/clients/inquiry";
import { readingFixture, sourceId, stateId } from "./-reading-test-fixtures";
import { renderRoute } from "./-route-test-harness";
import {
  derivativeClientStub,
  readingWorkspaceFixture,
  sepUpdateClientStub,
  setSepUpdateResult,
} from "./-source-information-test-fixture";

type Workspace = InquiryOutputs["sources"]["readingWorkspace"];

export const calls = {
  annotations: [] as unknown[],
  citationResolutions: [] as unknown[],
  reading: [] as unknown[],
  resumeGet: [] as unknown[],
  resumeSave: [] as unknown[],
};

export const readingRouteState = {
  annotations: [] as unknown[],
  citationEvidence: [] as unknown[],
  citationResolutionError: undefined as Error | undefined,
  citationResolutions: [] as Workspace["citationResolutions"],
  getReading: async (
    _input?: unknown,
  ): Promise<ReturnType<typeof readingFixture>> => readingFixture(),
  getResume: async (_input: unknown): Promise<unknown> => null,
  retainedReplica: undefined as unknown,
  workspaceOverride: undefined as
    | ReturnType<typeof readingWorkspaceFixture>
    | undefined,
};

export const readingPositionState = readingRouteState;
export const bibliographyRouteState = readingRouteState;
export const citationResolutionCalls = calls.citationResolutions;

await mock.module("@/offline-working-set/offline-working-set-store", () => ({
  readOfflineWorkingSet: async () => readingRouteState.retainedReplica,
  confirmOfflineWorkingSetRemoval: async () => undefined,
  markOfflineWorkingSetStale: async (record: unknown) => record,
  requestOfflineWorkingSetRemoval: async (record: unknown) => record,
  restoreOfflineWorkingSet: async (record: unknown) => record,
  retainOfflineWorkingSet: async (record: unknown) => record,
}));

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sepAdmission: sepUpdateClientStub,
    sources: {
      derivatives: derivativeClientStub,
      assistant: {
        ask: {
          mutationOptions: () => ({
            mutationFn: async () => ({ answer: "Synthetic answer." }),
          }),
        },
      },
      readingWorkspace: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["reading-workspace", input],
          queryFn: async () => {
            const reading = await readingRouteState.getReading(input);
            return (
              readingRouteState.workspaceOverride ??
              readingWorkspaceFixture(
                reading,
                readingRouteState.citationResolutions,
              )
            );
          },
        }),
      },
      resume: {
        get: {
          key: ({ input }: { input: unknown }) => ["resume", input],
          queryOptions: ({ input }: { input: unknown }) => ({
            queryKey: ["resume", input],
            queryFn: () => readingRouteState.getResume(input),
          }),
        },
        save: {
          mutationOptions: () => ({
            mutationFn: async (input: unknown) => {
              calls.resumeSave.push(input);
            },
          }),
        },
      },
    },
  },
}));

await mock.module("@/clients/library", () => ({
  library: {
    sources: {
      readingWorkspace: {
        key: ({ input }: { input: unknown }) => ["reading-workspace", input],
      },
    },
    citationResolutions: {
      evidence: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["citation-evidence", input],
          queryFn: async () => readingRouteState.citationEvidence,
        }),
      },
      list: {
        key: ({ input }: { input: unknown }) => ["citation-resolutions", input],
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["citation-resolutions", input],
          queryFn: async () => readingRouteState.citationResolutions,
        }),
      },
      create: {
        mutationOptions: () => ({
          mutationFn: async (input: unknown) => createCitationResolution(input),
        }),
      },
      clear: {
        mutationOptions: () => ({ mutationFn: async () => true }),
      },
      infer: {
        mutationOptions: () => ({
          mutationFn: async () => ({
            status: "unavailable",
            candidateId: null,
            confidence: null,
            reasoning: "Provider unavailable",
          }),
        }),
      },
    },
    annotations: {
      list: {
        key: ({ input }: { input: unknown }) => ["annotations", input],
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["annotations", input],
          queryFn: async () => {
            calls.annotations.push(input);
            return readingRouteState.annotations;
          },
        }),
      },
      create: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
      update: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
      delete: {
        mutationOptions: () => ({ mutationFn: async () => undefined }),
      },
    },
  },
}));

const { Route } = await import("./$sourceId/$stateId");

export function view() {
  return within(document.body);
}

export function resetActions() {
  for (const recorded of Object.values(calls)) recorded.length = 0;
  readingRouteState.annotations = [];
  readingRouteState.citationEvidence = [];
  readingRouteState.citationResolutionError = undefined;
  readingRouteState.citationResolutions = [];
  readingRouteState.retainedReplica = undefined;
  readingRouteState.workspaceOverride = undefined;
  readingRouteState.getReading = async (input) => {
    calls.reading.push(input);
    return readingFixture();
  };
  readingRouteState.getResume = async (input) => {
    calls.resumeGet.push(input);
    return null;
  };
  setSepUpdateResult();
  window.history.replaceState({}, "");
}

afterEach(() => {
  resetActions();
  localStorage.clear();
  cleanup();
});

export async function renderReading(search = "") {
  const rootRoute = createRootRoute();
  const readingRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/sources/$sourceId/$stateId",
    component: Route.options.component,
    validateSearch: Route.options.validateSearch,
  });
  return renderRoute(
    rootRoute.addChildren([readingRoute]),
    `/sources/${sourceId}/${stateId}${search}`,
  );
}

async function createCitationResolution(input: unknown) {
  calls.citationResolutions.push(input);
  if (readingRouteState.citationResolutionError)
    throw readingRouteState.citationResolutionError;
  const resolution: Workspace["citationResolutions"][number] = {
    ...(input as object),
    id: "50000000-0000-4000-8000-000000000000",
    sourceId,
    sourceStateId: stateId,
    derivativeId: "60000000-0000-4000-8000-000000000000",
    componentIdentity: "article",
    mentionId: "citation-one",
    bibliographyComponentIdentity: "article",
    bibliographyEntryId: "entry-one",
    publisherAnchor: null,
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 0,
    normalizedEndOffset: 3,
    exactText: "[1]",
    prefix: "",
    suffix: "",
    actorId: "user-1",
    method: "manual",
    confidence: null,
    reasoning: null,
    createdAt: "2026-08-24T12:00:00.000Z",
    updatedAt: "2026-08-24T12:00:00.000Z",
  };
  readingRouteState.citationResolutions = [resolution];
  return resolution;
}
