import { buttonVariants } from "@lirna/ui/components/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { inquiry } from "@/clients/inquiry";

import { ReadingAnnotations } from "../annotations/annotations";
import { Bibliography } from "./bibliography";
import { SepReadingBreadcrumb } from "./breadcrumb";
import { SepReadingCaptureStatus } from "./capture-status";
import { SepReadingComponentNav } from "./component-nav";
import {
  Blocks,
  CitationActions,
  Figure,
  ReadingSection,
  type SepReadingData,
} from "./content";
import { ReadingResearchAssistant } from "./research-assistant";
import { SepReadingSidebar } from "./sidebar";
import { SepReadingSourceHeader } from "./source-header";

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
  const {
    ephemeralScrollTop,
    openBibliography,
    returnToCitation,
    saveLocation,
  } = useScrollRestore(component, view, onViewChange);

  const resumeStatus = useReadingResume({
    component,
    ephemeralScrollTop,
    sourceId: source.id,
    stateId: source.stateId,
  });

  if (!component) return null;

  const handleComponentChange = (identity: string) => {
    saveLocation();
    onComponentChange(identity);
  };

  return (
    <main className="min-h-full bg-background">
      <header className="border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center">
          <Link
            className={buttonVariants({ size: "sm", variant: "ghost" })}
            hash="source-information"
            to="."
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Source information
          </Link>
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
          <p className="flex items-center gap-2 text-muted-foreground text-sm">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${resumeStatus === "error" ? "bg-destructive" : "bg-emerald-500"}`}
            />
            {resumeStatus === "saving"
              ? "Syncing reading position..."
              : resumeStatus === "error"
                ? "Reading position could not sync"
                : `Reading position synced for ${component.label}`}
          </p>
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
            plainText={component.plainText}
            sourceId={source.id}
            stateId={source.stateId}
            view={view}
          />
          <ReadingResearchAssistant
            componentIdentity={component.identity}
            componentLabel={component.label}
            sourceId={source.id}
            stateId={source.stateId}
            sourceTitle={source.title}
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

function useReadingResume({
  component,
  ephemeralScrollTop,
  sourceId,
  stateId,
}: {
  component: SepReadingData["components"][number] | undefined;
  ephemeralScrollTop: number | undefined;
  sourceId: string;
  stateId: string;
}) {
  const { mutate } = useMutation(inquiry.sources.resume.save.mutationOptions());
  const { data: resume, isPending } = useQuery(
    inquiry.sources.resume.get.queryOptions({
      input: component
        ? {
            sourceId,
            stateId,
            componentIdentity: component.identity,
          }
        : {},
    }),
  );
  const [status, setStatus] = useState<"saving" | "saved" | "error">("saving");

  useEffect(() => {
    if (!component || isPending) return;
    if (ephemeralScrollTop !== undefined) {
      window.scrollTo({ top: ephemeralScrollTop });
    } else if (
      resume?.sourceId === sourceId &&
      resume.stateId === stateId &&
      resume.componentIdentity === component.identity
    ) {
      window.scrollTo({ top: resume.scrollTop });
    } else {
      window.scrollTo({ top: 0 });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const save = () => {
      mutate(
        {
          componentIdentity: component.identity,
          componentLabel: component.label,
          scrollTop: Math.max(0, Math.round(window.scrollY)),
          sourceId,
          stateId,
        },
        {
          onError: () => setStatus("error"),
          onSuccess: () => setStatus("saved"),
        },
      );
    };
    const scheduleSave = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 500);
    };
    const saveImmediately = () => {
      if (timer) clearTimeout(timer);
      setStatus("saving");
      save();
    };
    const saveOnUnmount = () => {
      if (timer) clearTimeout(timer);
      save();
    };
    saveImmediately();
    window.addEventListener("scroll", scheduleSave, { passive: true });
    window.addEventListener("pagehide", saveImmediately);
    document.addEventListener("visibilitychange", saveImmediately);
    return () => {
      saveOnUnmount();
      window.removeEventListener("scroll", scheduleSave);
      window.removeEventListener("pagehide", saveImmediately);
      document.removeEventListener("visibilitychange", saveImmediately);
    };
  }, [
    component,
    ephemeralScrollTop,
    isPending,
    mutate,
    resume,
    sourceId,
    stateId,
  ]);

  return status;
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

  const ephemeralScrollTop = component
    ? locations.current.get(component.identity)
    : undefined;

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
  return {
    ephemeralScrollTop,
    openBibliography,
    returnToCitation,
    saveLocation,
  };
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
