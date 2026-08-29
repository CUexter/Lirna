import type { db } from "@lirna/db";

import { readAnnotationsInSnapshot } from "../annotations/annotation-store";
import { readReadingPositionsInSnapshot } from "../reading-position/reading-position-store";
import { readReadingWorkspaceInSnapshot } from "../reading-workspace/reading-workspace-reader";
import { readActiveReadingDerivativeInSnapshot } from "../sep-admission/state/active-reading-derivative-store";
import {
  decideOfflineRetention,
  type OfflineRetentionDecision,
} from "../source-handling-policy/source-handling-policy";
import { createOfflineWorkingSetSnapshot } from "./offline-working-set";

type OfflineWorkingSetSnapshot = ReturnType<
  typeof createOfflineWorkingSetSnapshot
>;

export type OfflineWorkingSetCaptureResult =
  | { status: "captured"; snapshot: OfflineWorkingSetSnapshot }
  | { status: "unavailable" }
  | {
      status: "policy-ineligible";
      reasons: Extract<OfflineRetentionDecision, { allowed: false }>["reasons"];
    };

export interface OfflineWorkingSetOperations {
  capture(
    sourceId: string,
    stateId: string,
  ): Promise<OfflineWorkingSetCaptureResult>;
}

export function createOfflineWorkingSetCapture(
  database: typeof db,
  onSnapshotEstablished?: () => Promise<void>,
): OfflineWorkingSetOperations {
  return {
    capture: (sourceId, stateId) =>
      database.transaction(
        async (tx): Promise<OfflineWorkingSetCaptureResult> => {
          const active = await readActiveReadingDerivativeInSnapshot(tx, {
            sourceId,
            stateId,
          });
          if (active.status !== "active") return { status: "unavailable" };
          const eligibility = decideOfflineRetention(active.value.policy);
          if (!eligibility.allowed) {
            return {
              status: "policy-ineligible",
              reasons: eligibility.reasons,
            };
          }

          await onSnapshotEstablished?.();
          const workspace = await readReadingWorkspaceInSnapshot(
            tx,
            sourceId,
            stateId,
            active.value.reading,
          );
          if (!workspace) return { status: "unavailable" };
          const annotations = await readAnnotationsInSnapshot(
            tx,
            sourceId,
            stateId,
          );
          const componentIdentities = new Set(
            workspace.reading.components.map(({ identity }) => identity),
          );
          const positions = (
            await readReadingPositionsInSnapshot(tx, sourceId, stateId)
          ).filter(({ componentIdentity }) =>
            componentIdentities.has(componentIdentity),
          );

          return {
            status: "captured",
            snapshot: createOfflineWorkingSetSnapshot({
              workspace,
              annotations,
              positions,
            }),
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      ),
  };
}
