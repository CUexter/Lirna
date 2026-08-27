import type { ComponentProps, RefObject } from "react";
import type { CitationResolution } from "../annotations/dom-utils";
import type { Bibliography } from "./bibliography";
import type { BibliographyMention } from "./bibliography-mentions";
import type { ReadingData } from "./content";
import type { ReadingNavigation } from "./reading-navigation";
import type {
  ReadingSceneScrollOwner,
  ReadingSceneTopology,
} from "./reading-scene-topology";
import type { ReadingReference, ReferenceIndex } from "./references";

export type ReadingToolTab =
  | "contents"
  | "bibliography"
  | "notes"
  | "supplementary";
export type ReadingComponent = ReadingData["components"][number];

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
  components: ReadingData["components"];
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
    onOpenAuthoredLink: (
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
