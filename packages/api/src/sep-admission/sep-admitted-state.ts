import type { CapturedSepResource, SepObservationKey } from "./sep-capture";
import type { SepReadingContract } from "./sep-reading-contract";

export interface SepAdmittedState {
  id: string;
  sourceId: string;
  sequence: number;
  observationKey: SepObservationKey;
  canonicalUrl: string;
  title: string;
  authors: string[];
  publisher: string;
  publicationHistory: string[];
  admittedAt: string;
  resources: Array<{
    role: CapturedSepResource["role"];
    requestedUrl: string;
    finalUrl: string;
    mediaType: string;
    byteLength: number;
    sha256: string;
    discoveryEdge: string;
  }>;
}

export interface SepLibrarySource {
  id: string;
  title: string;
  admittedAt: string;
  states: Array<
    Pick<
      SepAdmittedState,
      "id" | "sequence" | "observationKey" | "canonicalUrl" | "admittedAt"
    >
  >;
}

export interface SepAdmittedStateOperations {
  listSources(): Promise<SepLibrarySource[]>;
  deleteSource(sourceId: string): Promise<boolean>;
  getState(
    sourceId: string,
    stateId: string,
  ): Promise<SepAdmittedState | undefined>;
  getReading(
    sourceId: string,
    stateId: string,
  ): Promise<SepReadingContract | undefined>;
}
