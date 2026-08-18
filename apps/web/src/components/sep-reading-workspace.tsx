import { Badge } from "@lirna/ui/components/badge";
import { Button } from "@lirna/ui/components/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { ReadingAnnotations } from "./reading-annotations";
import { Bibliography } from "./sep-bibliography";
import {
  Blocks,
  CitationActions,
  Diagnostic,
  Figure,
  ReadingSection,
  type SepReadingData,
} from "./sep-reading-content";
import { SepReadingSidebar } from "./sep-reading-sidebar";

export type { SepReadingData };

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

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
  const locations = useRef(new Map<string, number>());
  const returnMention = useRef<string | undefined>(undefined);
  const component =
    reading.components.find((item) => item.identity === selectedComponent) ??
    reading.components.find(
      (item) => item.identity === reading.mainComponent.identity,
    ) ??
    reading.components[0];
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
  if (!component) return null;
  const saveLocation = () =>
    locations.current.set(component.identity, window.scrollY);
  const handleComponentChange = (identity: string) => {
    saveLocation();
    onComponentChange(identity);
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
  const siblings = reading.components.filter(
    (item) => item.parentIdentity === component.parentIdentity,
  );
  const siblingIndex = siblings.findIndex(
    (item) => item.identity === component.identity,
  );
  const previous = siblings[siblingIndex - 1];
  const next = siblings[siblingIndex + 1];
  const parent = reading.components.find(
    (item) => item.identity === component.parentIdentity,
  );
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
          <header
            className="flex flex-col gap-3 border-b pb-8"
            id="source-information"
          >
            <div className="flex flex-wrap gap-2">
              <Badge>SEP</Badge>
              <Badge variant="outline">
                {source.observation === "submitted"
                  ? "Active capture"
                  : "Archived capture"}
              </Badge>
              <Badge
                variant={
                  capture.readingReadiness === "ready" ? "secondary" : "outline"
                }
              >
                Reading {capture.readingReadiness}
              </Badge>
            </div>
            <h1 className="font-serif text-3xl leading-tight tracking-tight sm:text-5xl">
              {source.title}
            </h1>
            {source.authors.length > 0 ? (
              <p className="text-muted-foreground">
                {source.authors.join(", ")}
              </p>
            ) : null}
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-muted-foreground">Publisher</dt>
                <dd>{source.publisher}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">
                  State date
                </dt>
                <dd>{formatDate(source.admittedAt)}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">
                  Edition history
                </dt>
                <dd>
                  {source.publicationHistory.join("; ") || "Not recorded"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Captured</dt>
                <dd>{formatDate(component.retrievedAt)}</dd>
              </div>
            </dl>
          </header>
          {capture.readingReadiness === "degraded" ||
          capture.diagnostics.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="font-serif text-xl">
                  Capture and rendering status
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <p>
                  Bundle capture is {capture.completeness}; Reading is{" "}
                  {capture.readingReadiness}.
                </p>
                {capture.readinessReasons.map((reason) => (
                  <p key={reason}>{reason}</p>
                ))}
                {capture.diagnostics.map((diagnostic) => (
                  <Diagnostic
                    key={`${diagnostic.code}:${diagnostic.source.locator}`}
                    diagnostic={diagnostic}
                  />
                ))}
              </CardContent>
            </Card>
          ) : null}
          <nav
            aria-label="Component path"
            className="flex flex-wrap gap-2 text-muted-foreground text-sm"
          >
            <Button
              className="h-auto p-0"
              onClick={() => {
                handleComponentChange(reading.mainComponent.identity);
              }}
              type="button"
              variant="link"
            >
              {source.title}
            </Button>
            {parent ? (
              <>
                <span>/</span>
                <Button
                  className="h-auto p-0"
                  onClick={() => {
                    handleComponentChange(parent.identity);
                  }}
                  type="button"
                  variant="link"
                >
                  {parent.label}
                </Button>
              </>
            ) : null}
            <span>/</span>
            <span>{component.label}</span>
          </nav>
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
          <nav
            aria-label="Component navigation"
            className="flex justify-between gap-3 border-t pt-6"
          >
            {previous ? (
              <Button
                onClick={() => {
                  handleComponentChange(previous.identity);
                }}
                type="button"
                variant="outline"
              >
                Previous: {previous.label}
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button
                onClick={() => {
                  handleComponentChange(next.identity);
                }}
                type="button"
                variant="outline"
              >
                Next: {next.label}
              </Button>
            ) : null}
          </nav>
        </div>
      </div>
    </main>
  );
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
