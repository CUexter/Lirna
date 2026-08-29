import type { InquiryOutputs } from "@/clients/inquiry";
import { createBrowserOfflineWorkingSets } from "./offline-working-set-browser";

type Snapshot = InquiryOutputs["sources"]["offlineManifest"];
type Replica = Snapshot["replica"];

export interface OfflineWorkingSetTarget {
  sourceId: string;
  stateId: string;
}

export type OfflineActivityReadiness = {
  activity:
    | "read-retained-content"
    | "view-retained-annotations"
    | "view-retained-citation-selections"
    | "restore-retained-position"
    | "save-reading-progress"
    | "change-authored-records"
    | "launch-without-network";
  label: string;
  state: "supported" | "limited" | "unsupported";
  reason?: string;
};

export type OfflineWorkingSetInspection =
  | { status: "absent" }
  | {
      status: "available";
      localAvailability: "readable";
      freshness: "current" | "outdated" | "unknown";
      removal: "retained" | "pending";
      readiness: "ready" | "partial";
      activities: OfflineActivityReadiness[];
      retainedAt: string;
      synchronizedAt: string;
      replicaBytes: number;
      referencedResourceBytes: number;
      referencedResourceCount: number;
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
  ): Promise<OfflineWorkingSetInspection>;
  subscribe(
    target: OfflineWorkingSetTarget,
    onCurrentnessMayHaveChanged: () => void,
  ): () => void;
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
