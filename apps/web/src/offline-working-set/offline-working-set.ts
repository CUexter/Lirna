import type { InquiryInputs, InquiryOutputs } from "@/clients/inquiry";
import type { AppShellCompatibility } from "./app-shell-compatibility";
import { createBrowserOfflineWorkingSets } from "./offline-working-set-browser";

type Snapshot = InquiryOutputs["sources"]["offlineManifest"];
type Replica = Snapshot["replica"];
type ReadingPosition = NonNullable<InquiryOutputs["sources"]["resume"]["get"]>;

export type ReadingProgressInput = InquiryInputs["sources"]["resume"]["save"];
export type ReadingProgressSaveResult =
  | { status: "synchronized"; position: ReadingPosition }
  | {
      status: "pending";
      position: ReadingPosition;
      message: string;
    };

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
      status: "unsupported";
      localAvailability: "retained";
      schemaVersion: number;
      message: string;
    }
  | {
      status: "incompatible";
      localAvailability: "retained";
      persistedVersion: number;
      shellCompatibility: Extract<
        AppShellCompatibility,
        { status: "incompatible" }
      >;
      message: string;
    }
  | {
      status: "available";
      localAvailability: "readable";
      freshness: "current" | "outdated" | "unknown";
      removal: "retained" | "pending";
      readiness: "ready" | "partial" | "unavailable";
      retainedReadiness: "ready" | "partial";
      shellCompatibility: AppShellCompatibility;
      activities: OfflineActivityReadiness[];
      retainedAt: string;
      synchronizedAt: string;
      replicaBytes: number;
      referencedResourceBytes: number;
      referencedResourceCount: number;
      progressSynchronization: "synchronized" | "pending" | "failed";
    };

export type OfflineWorkingSetInventoryEntry =
  | {
      id: string;
      target?: OfflineWorkingSetTarget;
      status: "corrupt";
      message: string;
    }
  | {
      id: string;
      target: OfflineWorkingSetTarget;
      status: "unsupported";
      inspection: Extract<
        OfflineWorkingSetInspection,
        { status: "unsupported" }
      >;
    }
  | {
      id: string;
      target: OfflineWorkingSetTarget;
      status: "incompatible";
      inspection: Extract<
        OfflineWorkingSetInspection,
        { status: "incompatible" }
      >;
    }
  | {
      id: string;
      target: OfflineWorkingSetTarget;
      status: "available";
      inspection: Extract<OfflineWorkingSetInspection, { status: "available" }>;
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
  inventory(): Promise<OfflineWorkingSetInventoryEntry[]>;
  inspect(
    target: OfflineWorkingSetTarget,
  ): Promise<OfflineWorkingSetInspection>;
  subscribe(
    target: OfflineWorkingSetTarget,
    onCurrentnessMayHaveChanged: () => void,
  ): () => void;
  subscribeInventory(onChange: () => void): () => void;
  open(target: OfflineWorkingSetTarget): Promise<RetainedReadingWorkspace>;
  saveProgress(input: ReadingProgressInput): Promise<ReadingProgressSaveResult>;
  retryProgress(target: OfflineWorkingSetTarget): Promise<void>;
  synchronizeProgress(): Promise<void>;
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
  discardInventoryEntry(id: string): Promise<void>;
  removeSource(sourceId: string): Promise<number>;
  reconcileSourceDeletion<T>(
    sourceId: string,
    deleteSource: () => Promise<T>,
  ): Promise<T>;
  expireRetainedBefore(cutoff: Date): Promise<number>;
}

export const offlineWorkingSets: OfflineWorkingSets =
  createBrowserOfflineWorkingSets();
