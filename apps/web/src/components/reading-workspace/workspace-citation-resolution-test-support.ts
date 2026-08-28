import { expect } from "bun:test";
import { act, waitFor } from "@testing-library/react";
import { createRef } from "react";

import {
  createTestQueryClient,
  queryClientWrapper,
} from "@/test-support/query-hook";
import type { CitationResolution } from "../annotations/dom-utils";
import { createReadingNavigation } from "./reading-navigation";
import { readingFixture, sourceId, stateId } from "./reading-test-fixtures";
import type { useWorkspaceCitationResolution } from "./workspace-citation-resolution";

export const derivativeId = "40000000-0000-4000-8000-000000000000";
export type Movement = Parameters<
  typeof useWorkspaceCitationResolution
>[0]["movement"];

export function citationResolutionLibraryStub(
  evidence: unknown,
  createResolution: () => (input: unknown) => Promise<unknown> = () =>
    async () =>
      undefined,
) {
  return {
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
            queryFn: async () => evidence,
          }),
        },
        create: {
          mutationOptions: () => ({
            mutationFn: (input: unknown) => createResolution()(input),
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
    },
  };
}

export function createCitationResolutionHarness(
  evidence: unknown,
  movementOverrides: Partial<Movement> = {},
) {
  const reading = readingFixture();
  const mainComponent = reading.components[0];
  if (!mainComponent) throw new Error("Article fixture is missing");
  const client = createTestQueryClient();
  const workspaceKey = ["reading-workspace", { sourceId, stateId }];
  const movement: Movement = {
    activatePassage: (activate) => activate(),
    cancel: (onCommit) => onCommit(),
    moveToComponent: () => undefined,
    openBibliography: () => undefined,
    returnToCitationTarget: () => undefined,
    ...movementOverrides,
  };
  return {
    client,
    queryWrapper: queryClientWrapper(client),
    reading,
    workspaceKey,
    props: (
      overrides: {
        component?: (typeof reading.components)[number];
        derivativeId?: string;
        view?: "article" | "bibliography";
      } = {},
    ) => ({
      movement,
      reading: {
        citationResolutions: [],
        components: reading.components,
        mainComponentIdentity: reading.mainComponent.identity,
      },
      scene: {
        articleRef: createRef<HTMLElement>(),
        component: overrides.component ?? mainComponent,
        navigation: createReadingNavigation(),
        selectedCitation: undefined,
        toolsScrollRef: createRef<HTMLDivElement>(),
        view: overrides.view ?? ("article" as const),
      },
      target: {
        derivativeId: overrides.derivativeId ?? derivativeId,
        sourceId,
        stateId,
      },
    }),
    waitForEvidence: () =>
      waitFor(() =>
        expect(
          client.getQueryData<unknown>([
            "citation-evidence",
            { expectedDerivativeId: derivativeId, sourceId, stateId },
          ]),
        ).toEqual(evidence),
      ),
  };
}

export async function resolveMutation(
  completion: PromiseWithResolvers<unknown>,
  value: unknown,
) {
  await act(async () => {
    completion.resolve(value);
    await completion.promise;
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export function mentionEvidence(mentionId: string) {
  return {
    id: `${derivativeId}:article:${mentionId}`,
    sourceId,
    sourceStateId: stateId,
    derivativeId,
    componentIdentity: "article",
    mentionId,
    label: "[1]",
    context: "Synthetic publication content [1]",
    state: "ambiguous" as const,
    deterministicReason: "The authored label has bounded candidates.",
    candidates: [
      {
        id: `article:entry-${mentionId}`,
        bibliographyComponentIdentity: "article",
        bibliographyEntryId: `entry-${mentionId}`,
        label: "[1]",
        text: "Synthetic publisher entry.",
        reason: "The authored label matched this candidate.",
      },
    ],
    policy: {
      rightsBasis: "publicly-accessible" as const,
      sensitivityLevel: "ordinary-cloud" as const,
      citationInference: {
        allowed: true,
        reason: "eligible" as const,
        request: {
          activity: "citation-candidate-inference" as const,
          endpointClass: "ordinary-cloud" as const,
        },
      },
    },
  };
}

export function resolution(mentionId: string): CitationResolution {
  return {
    id: "50000000-0000-4000-8000-000000000000",
    sourceId,
    sourceStateId: stateId,
    derivativeId,
    componentIdentity: "article",
    mentionId,
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
}
