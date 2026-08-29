import type { CitationResolutionRecord } from "../citation-resolutions/citation-resolution-contract";
import type { SepReadingContract } from "../sep-admission/reading/contract";
import type {
  SepAdmittedState,
  SepLibrarySource,
} from "../sep-admission/state/admitted-state";

export interface ReadingWorkspaceProjection {
  reading: SepReadingContract;
  state: SepAdmittedState;
  source: SepLibrarySource;
  citationResolutions: CitationResolutionRecord[];
}

export interface ReadingWorkspaceOperations {
  read(
    sourceId: string,
    stateId: string,
  ): Promise<ReadingWorkspaceProjection | undefined>;
}
