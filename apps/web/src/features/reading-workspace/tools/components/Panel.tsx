import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@lirna/ui/components/tabs";
import {
  BookOpenTextIcon,
  FilesIcon,
  ListTreeIcon,
  StickyNoteIcon,
} from "lucide-react";

import { Bibliography } from "../../bibliography/components/View";
import { useReadingToolsLocation } from "../../position/hooks/useToolsLocation";
import type { ReadingToolsPanelProps, ReadingToolTab } from "../panel.types";
import { ContentsTab, NotesTab, SupplementaryTab } from "./Tabs";

export type { ReadingToolTab } from "../panel.types";

export function ReadingToolsPanel({
  bibliography,
  component,
  components,
  topology,
  navigation,
  notes,
  scrollContainerRef,
  supplementary,
}: ReadingToolsPanelProps) {
  const saveToolsLocation = useReadingToolsLocation(
    scrollContainerRef,
    bibliography.navigation,
    {
      activeTab: navigation.activeTab,
      hasSelectedReference: Boolean(supplementary.selectedReference),
      publisherNotesOwner: supplementary.publisherNotesOwner,
    },
  );

  return (
    <aside
      aria-label="Reading tools"
      className="flex h-[70svh] flex-col overflow-hidden rounded-md border bg-background/95 shadow-lg backdrop-blur lg:h-[calc(100vh-2rem)]"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <p className="font-medium text-sm">Reading tools</p>
          <p className="text-muted-foreground text-xs">{component.label}</p>
        </div>
      </header>
      <Tabs
        className="flex min-h-0 flex-1 flex-col"
        onValueChange={(value) => {
          saveToolsLocation();
          navigation.onActiveTabChange(value as ReadingToolTab);
        }}
        value={navigation.activeTab}
      >
        <TabsList className="grid h-10 w-full grid-cols-4 border-b bg-transparent p-0">
          <TabsTrigger className="gap-1 px-1 text-xs" value="contents">
            <ListTreeIcon aria-hidden="true" />
            Contents
          </TabsTrigger>
          <TabsTrigger className="gap-1 px-1 text-xs" value="bibliography">
            <BookOpenTextIcon aria-hidden="true" />
            Bibliography
          </TabsTrigger>
          <TabsTrigger className="gap-1 px-1 text-xs" value="notes">
            <StickyNoteIcon aria-hidden="true" />
            Notes
          </TabsTrigger>
          <TabsTrigger className="gap-1 px-1 text-xs" value="supplementary">
            <FilesIcon aria-hidden="true" />
            Supplementary
          </TabsTrigger>
        </TabsList>
        <div
          className="reading-tools-scroll-container min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
          ref={scrollContainerRef}
        >
          <TabsContent value="contents">
            <ContentsTab component={component} />
          </TabsContent>
          <TabsContent value="bibliography">
            <Bibliography
              bibliographyComponents={{
                all: components,
                citationResolutions: bibliography.citationResolutions,
                mainIdentity: bibliography.mainComponentIdentity,
              }}
              compact
              navigation={bibliography.navigation}
              resolution={bibliography.resolution}
              onReturn={bibliography.onReturnCitation}
              scrollContainerRef={scrollContainerRef}
              selection={{
                componentIdentity:
                  bibliography.selectedComponentIdentity ?? component.identity,
                entry: bibliography.selectedEntry,
                request: bibliography.citationScrollRequest,
              }}
            />
          </TabsContent>
          <TabsContent className="space-y-3" value="notes">
            <NotesTab
              component={component}
              onOpenAnnotation={notes.onOpenAnnotation}
              sourceId={notes.sourceId}
              stateId={notes.stateId}
            />
          </TabsContent>
          <TabsContent className="space-y-6" value="supplementary">
            <SupplementaryTab
              component={component}
              components={components}
              onComponentChange={navigation.onComponentChange}
              topology={topology}
              publisherNotes={{
                component: supplementary.publisherNotes,
                onOpenPublisherAuthoredLink:
                  supplementary.onOpenPublisherAuthoredLink,
                onOpenCitation: supplementary.onOpenCitation,
              }}
              references={{
                index: supplementary.referenceIndex,
                onJump: supplementary.onJumpReference,
                onOpen: supplementary.onOpenReference,
                selected: supplementary.selectedReference,
              }}
            />
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}
