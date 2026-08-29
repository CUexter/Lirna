import type { ComponentProps, RefObject } from "react";
import type { CitationResolution } from "../annotations/domUtils";
import type { ReadingDerivative } from "../article/components/Content";
import type {
  ReadingReference,
  ReferenceIndex,
} from "../bibliography/components/References";
import type { Bibliography } from "../bibliography/components/View";
import type { BibliographyMention } from "../bibliography/mentions";
import type { ReadingNavigation } from "../navigation/model";
import type {
  ReadingSceneScrollOwner,
  ReadingSceneTopology,
} from "../navigation/sceneTopology";

export type ReadingToolTab =
  | "contents"
  | "bibliography"
  | "notes"
  | "supplementary";
export type ReadingComponent = ReadingDerivative["components"][number];

export interface ReadingToolsPanelProps {
  bibliography: {
    citationScrollRequest: number;
    citationResolutions: CitationResolution[];
    mainComponentIdentity: string;
    navigation: ReadingNavigation;
    resolution?: ComponentProps<typeof Bibliography>["resolution"];
    onReturnCitation: (mention: BibliographyMention) => void;
    selectedComponentIdentity?: string;
    selectedEntry?: string;
  };
  component: ReadingComponent;
  components: ReadingDerivative["components"];
  topology: ReadingSceneTopology;
  navigation: {
    activeTab: ReadingToolTab;
    onActiveTabChange: (tab: ReadingToolTab) => void;
    onComponentChange: (identity: string) => void;
  };
  notes: {
    onOpenAnnotation: (annotationId: string) => void;
    sourceId: string;
    stateId: string;
  };
  scrollContainerRef: RefObject<HTMLDivElement | null>;
  supplementary: {
    onJumpReference: (reference: ReadingReference) => void;
    onOpenPublisherAuthoredLink: (
      from: ReadingComponent,
      href: string,
      label: string,
    ) => boolean;
    onOpenCitation: (
      from: ReadingComponent,
      entryId: string | undefined,
      mentionId: string,
    ) => void;
    onOpenReference: (reference: ReadingReference) => void;
    publisherNotes?: ReadingComponent;
    publisherNotesOwner?: ReadingSceneScrollOwner;
    referenceIndex: ReferenceIndex;
    selectedReference?: ReadingReference;
  };
}
