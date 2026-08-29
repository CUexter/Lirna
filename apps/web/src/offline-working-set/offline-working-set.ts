import type { InquiryOutputs } from "@/clients/inquiry";
import { createBrowserOfflineWorkingSets } from "./offline-working-set-store";

type Snapshot = InquiryOutputs["sources"]["offlineManifest"];
type Replica = Snapshot["replica"];

export interface OfflineWorkingSetTarget {
  sourceId: string;
  stateId: string;
}

export interface OfflineWorkingSetCurrentness {
  activationId?: string;
  currentStateId?: string;
}

export type OfflineWorkingSetInspection =
  | { status: "absent" }
  | {
      status: "available";
      availability: "ready" | "partial" | "stale" | "pending-removal";
      retainedAt: string;
      synchronizedAt: string;
      replicaBytes: number;
      referencedResourceBytes: number;
      referencedResourceCount: number;
      reasons: string[];
    };

export type RetainedReadingWorkspace =
  | { status: "absent" }
  | {
      status: "available";
      revision: string;
      retainedAt: string;
      workspace: Replica["workspace"];
      annotations: Replica["annotations"];
      positions: Replica["positions"];
    };

export interface OfflineWorkingSets {
  inspect(
    target: OfflineWorkingSetTarget,
    currentness?: OfflineWorkingSetCurrentness,
  ): Promise<OfflineWorkingSetInspection>;
  open(target: OfflineWorkingSetTarget): Promise<RetainedReadingWorkspace>;
  retain(
    target: OfflineWorkingSetTarget,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<OfflineWorkingSetInspection>;
  requestRemoval(
    target: OfflineWorkingSetTarget,
  ): Promise<OfflineWorkingSetInspection>;
  restore(
    target: OfflineWorkingSetTarget,
  ): Promise<OfflineWorkingSetInspection>;
  confirmRemoval(
    target: OfflineWorkingSetTarget,
  ): Promise<OfflineWorkingSetInspection>;
}

export const offlineWorkingSets: OfflineWorkingSets =
  createBrowserOfflineWorkingSets();
