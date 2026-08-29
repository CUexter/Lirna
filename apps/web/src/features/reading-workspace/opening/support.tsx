import { mock } from "bun:test";
import {
  notifyManager,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { act } from "@testing-library/react";
import type { PropsWithChildren } from "react";

import type { InquiryOutputs } from "@/clients/inquiry";
import { sourceId, stateId } from "../test-support/fixtures";
import { readingWorkspaceFixture } from "../test-support/sourceInformation";

export type Workspace = InquiryOutputs["sources"]["readingWorkspace"];
export type Target = { sourceId: string; stateId: string };

notifyManager.setNotifyFunction(act);
notifyManager.setBatchNotifyFunction(act);

export const openingReads: {
  online: (target: Target) => Promise<Workspace>;
  retained: (target: Target) => Promise<unknown>;
} = {
  online: async () => readingWorkspaceFixture(),
  retained: async () => undefined,
};

await mock.module("@/clients/inquiry", () => ({
  inquiry: {
    sources: {
      readingWorkspace: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["reading-workspace", input],
          queryFn: () => openingReads.online(input as Target),
        }),
      },
      resume: {
        get: {
          queryOptions: ({ input }: { input: unknown }) => ({
            queryKey: ["resume", input],
            queryFn: async () => null,
          }),
        },
      },
    },
  },
}));

await mock.module("@/clients/library", () => ({
  library: {
    annotations: {
      list: {
        queryOptions: ({ input }: { input: unknown }) => ({
          queryKey: ["annotations", input],
          queryFn: async () => [],
        }),
      },
    },
  },
}));

await mock.module("@/features/offline-working-set/workingSets", () => ({
  offlineWorkingSets: {
    confirmRemoval: async () => ({ status: "absent" }),
    inspect: async () => ({ status: "absent" }),
    open: ({ sourceId, stateId }: Target) =>
      openingReads.retained({ sourceId, stateId }),
    requestRemoval: async () => ({ status: "absent" }),
    restore: async () => ({ status: "absent" }),
    retain: async () => ({ status: "absent" }),
    subscribe: () => () => undefined,
  },
}));

export const { useReadingWorkspaceOpening } = await import(
  "@/features/reading-workspace/opening/hooks/useOpening"
);
export const { hydrateRetainedWorkspace } = await import(
  "@/features/offline-working-set/retainedReadingHydration"
);

export function retainedRecord({
  annotations = [],
  hash,
  positions = [],
  retainedAt = "2026-08-26T12:00:00.000Z",
  workspace = readingWorkspaceFixture(),
}: {
  annotations?: unknown[];
  hash: string;
  positions?: unknown[];
  retainedAt?: string;
  workspace?: Workspace;
}) {
  return {
    status: "available" as const,
    revision: hash,
    retainedAt,
    annotations,
    positions,
    workspace,
  };
}

export function retainedPosition(scrollTop: number) {
  return {
    sourceId,
    stateId,
    sourceTitle: "Synthetic Reading Source",
    componentIdentity: "article",
    componentLabel: "Article",
    scrollTop,
    semanticLocation: {
      version: 1 as const,
      source: { sourceId, stateId },
      scene: {
        identity: "article",
        componentIdentity: "article",
        owner: "article" as const,
      },
      block: { identity: "article", strategy: "scene-fallback" as const },
      progress: 0,
      fallback: {
        scrollTop,
        blockIndex: 0,
        blockTag: "scene",
        textExcerpt: "",
        authoredAnchor: null,
      },
    },
    savedAt: "2026-08-26T12:00:00.000Z",
  };
}

export function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

export function queryWrapper(client: QueryClient) {
  return function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}
