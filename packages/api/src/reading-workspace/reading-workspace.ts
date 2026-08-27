import type { CitationResolutionRecord } from "../citation-resolutions/citation-resolution-contract";
import type {
  SepAdmittedState,
  SepLibrarySource,
} from "../sep-admission/sep-admitted-state";
import type { SepReadingContract } from "../sep-admission/sep-reading-contract";

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
