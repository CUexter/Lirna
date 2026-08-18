import { Button } from "@lirna/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { ReadingAnnotations } from "./reading-annotations";
import { Bibliography } from "./sep-bibliography";
import { SepReadingBreadcrumb } from "./sep-reading-breadcrumb";
import { SepReadingCaptureStatus } from "./sep-reading-capture-status";
import { SepReadingComponentNav } from "./sep-reading-component-nav";
import {
  Blocks,
  CitationActions,
  Figure,
  ReadingSection,
  type SepReadingData,
} from "./sep-reading-content";
import { SepReadingSidebar } from "./sep-reading-sidebar";
import { SepReadingSourceHeader } from "./sep-reading-source-header";

export type { SepReadingData };

export function SepReadingWorkspace({
  reading,
  selectedComponent,
  view,
  selectedCitation,
  onComponentChange,
  onViewChange,
}: {
  reading: SepReadingData;
  selectedComponent?: string;
  view: "article" | "bibliography";
  selectedCitation?: string;
  onComponentChange: (identity: string) => void;
  onViewChange: (view: "article" | "bibliography", citation?: string) => void;
}) {
  const { capture, source } = reading;
  const articleRef = useRef<HTMLElement>(null);
  const { component, parent, previous, next } = useComponentTree(
    reading,
    selectedComponent,
  );
  const { openBibliography, returnToCitation, saveLocation } = useScrollRestore(
    component,
    view,
    onViewChange,
  );

  if (!component) return null;

  const handleComponentChange = (identity: string) => {
    saveLocation();
    onComponentChange(identity);
  };

  return (
    <main className="min-h-full bg-background">
      <header className="border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center">
          <Button
            render={<Link hash="source-information" to="." />}
            size="sm"
            variant="ghost"
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Source information
          </Button>
          <span className="ml-auto font-semibold font-serif text-xl">
            Lirna
          </span>
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:px-10 lg:py-12">
        <SepReadingSidebar
          components={reading.components}
          currentComponent={component}
          onComponentChange={handleComponentChange}
          onViewBibliography={() => {
            saveLocation();
            onViewChange("bibliography");
          }}
          view={view}
        />
        <div className="flex min-w-0 flex-col gap-8">
          <SepReadingSourceHeader
            capture={capture}
            component={component}
            source={source}
          />
          <SepReadingCaptureStatus capture={capture} />
          <SepReadingBreadcrumb
            component={component}
            mainComponentIdentity={reading.mainComponent.identity}
            onSelect={handleComponentChange}
            parent={parent}
            sourceTitle={source.title}
          />
          <CitationActions.Provider value={{ open: openBibliography }}>
            {view === "bibliography" ? (
              <Bibliography
                component={component}
                onReturn={returnToCitation}
                selectedEntry={selectedCitation}
              />
            ) : (
              <article
                className="flex flex-col gap-8 font-serif text-lg leading-8"
                ref={articleRef}
              >
                <Blocks blocks={component.introductoryBlocks} />
                {component.sections.map((section) => (
                  <ReadingSection key={section.id} section={section} />
                ))}
                {component.figures.map((figure) => (
                  <Figure figure={figure} key={figure.id} />
                ))}
              </article>
            )}
          </CitationActions.Provider>
          <WorkspaceAnnotations
            articleRef={articleRef}
            componentIdentity={component.identity}
            sourceId={source.id}
            stateId={source.stateId}
            view={view}
          />
          <SepReadingComponentNav
            next={next}
            onSelect={handleComponentChange}
            previous={previous}
          />
        </div>
      </div>
    </main>
  );
}

function useComponentTree(
  reading: SepReadingData,
  selectedComponent: string | undefined,
) {
  const component =
    reading.components.find((item) => item.identity === selectedComponent) ??
    reading.components.find(
      (item) => item.identity === reading.mainComponent.identity,
    ) ??
    reading.components[0];
  const parent = component
    ? reading.components.find(
        (item) => item.identity === component.parentIdentity,
      )
    : undefined;
  const siblings = component
    ? reading.components.filter(
        (item) => item.parentIdentity === component.parentIdentity,
      )
    : [];
  const siblingIndex = component
    ? siblings.findIndex((item) => item.identity === component.identity)
    : -1;
  const previous = siblingIndex > 0 ? siblings[siblingIndex - 1] : undefined;
  const next =
    siblingIndex >= 0 && siblingIndex < siblings.length - 1
      ? siblings[siblingIndex + 1]
      : undefined;
  return { component, parent, previous, next };
}

function useScrollRestore(
  component: SepReadingData["components"][number] | undefined,
  view: "article" | "bibliography",
  onViewChange: (view: "article" | "bibliography", citation?: string) => void,
) {
  const locations = useRef(new Map<string, number>());
  const returnMention = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!component) return;
    window.scrollTo({ top: locations.current.get(component.identity) ?? 0 });
  }, [component]);

  useEffect(() => {
    if (view !== "article" || !returnMention.current) return;
    document
      .getElementById(returnMention.current)
      ?.scrollIntoView({ block: "center" });
    returnMention.current = undefined;
  }, [view]);

  const saveLocation = () => {
    if (!component) return;
    locations.current.set(component.identity, window.scrollY);
  };
  const openBibliography = (entryId: string | undefined, mentionId: string) => {
    saveLocation();
    returnMention.current = mentionId;
    onViewChange("bibliography", entryId);
  };
  const returnToCitation = (mentionId: string) => {
    returnMention.current = mentionId;
    onViewChange("article");
  };
  return { openBibliography, returnToCitation, saveLocation };
}

function WorkspaceAnnotations({
  view,
  ...props
}: React.ComponentProps<typeof ReadingAnnotations> & {
  view: "article" | "bibliography";
}) {
  return view === "article" ? (
    <ReadingAnnotations key={props.componentIdentity} {...props} />
  ) : null;
}
