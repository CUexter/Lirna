import { buttonVariants } from "@lirna/ui/components/button";
import { Button } from "@lirna/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon, MessageCircleQuestionIcon } from "lucide-react";
import { lazy, type MouseEvent, Suspense, useRef, useState } from "react";

import { ReadingArticlePane } from "../article/components/Pane";
import type { SelectionDraft } from "../annotations/domUtils";
import type { WorkspaceTransitionFeedbackProps } from "../navigation/components/TransitionFeedback";
import { ReadingToolsPanel } from "../tools/components/Panel";

const WorkspaceTransitionFeedback = lazy(() =>
  import("../navigation/components/TransitionFeedback").then((module) => ({
    default: module.WorkspaceTransitionFeedback,
  })),
);

const ReadingResearchAssistant = lazy(() =>
  import("../tools/components/ResearchAssistant").then((module) => ({
    default: module.ReadingResearchAssistant,
  })),
);

export function ReadingWorkspaceView({
  articlePaneProps,
  onFragmentActivate,
  readingToolsProps,
  transitionFeedback,
}: {
  articlePaneProps: Omit<
    React.ComponentProps<typeof ReadingArticlePane>,
    "onAskSelection"
  >;
  onFragmentActivate: (fragment: string) => void;
  readingToolsProps: React.ComponentProps<typeof ReadingToolsPanel>;
  transitionFeedback: WorkspaceTransitionFeedbackProps;
}) {
  const [assistantContext, setAssistantContext] = useState<{
    componentIdentity: string;
    selection?: SelectionDraft;
  }>();
  const assistantTriggerRef = useRef<HTMLButtonElement>(null);
  const { component, source } = articlePaneProps;
  const assistantOpen =
    assistantContext?.componentIdentity === component.identity;

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: delegated anchor clicks retain native keyboard activation.
    <main
      className={`reading-workspace grid min-h-full bg-background ${
        assistantOpen
          ? "grid-cols-[minmax(0,1fr)_clamp(24rem,calc(100vw-96rem),40vw)]"
          : "grid-cols-1"
      }`}
      onClick={(event) => {
        const fragment = authoredFragmentFromClick(event);
        if (!fragment) return;
        event.preventDefault();
        onFragmentActivate(fragment);
      }}
    >
      <div className="@container/reading min-w-0">
        <header className="sticky top-0 z-40 border-b bg-background/95 px-4 backdrop-blur sm:px-6 lg:px-10">
          <div className="mx-auto flex h-16 w-full max-w-6xl items-center 2xl:max-w-[104rem]">
            <Link
              className={buttonVariants({ size: "sm", variant: "ghost" })}
              hash="source-information"
              onClick={(event) => {
                if (!authoredFragmentFromClick(event)) return;
                event.preventDefault();
                onFragmentActivate("source-information");
              }}
              to="."
            >
              <ArrowLeftIcon data-icon="inline-start" />
              Source information
            </Link>
            <span className="ml-auto font-semibold font-serif text-xl">
              Lirna
            </span>
            <Button
              aria-controls="reading-research-assistant"
              aria-expanded={assistantOpen}
              aria-label="Ask this Source"
              className={buttonVariants({ size: "sm", variant: "ghost" })}
              onClick={() => {
                if (assistantOpen) {
                  setAssistantContext(undefined);
                } else {
                  setAssistantContext({
                    componentIdentity: component.identity,
                  });
                }
              }}
              ref={assistantTriggerRef}
              type="button"
            >
              <MessageCircleQuestionIcon />
              Ask
            </Button>
          </div>
        </header>
        {transitionFeedback.unavailable ||
        transitionFeedback.annotationDiscard.open ||
        transitionFeedback.workspaceLeave.open ? (
          <Suspense fallback={null}>
            <WorkspaceTransitionFeedback {...transitionFeedback} />
          </Suspense>
        ) : null}
        <div className="mx-auto grid w-full max-w-[104rem] @7xl/reading:grid-cols-[minmax(0,1fr)_26rem] @[96rem]/reading:grid-cols-[minmax(0,1fr)_28rem] @[96rem]/reading:gap-12 gap-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <ReadingArticlePane
            {...articlePaneProps}
            contentActions={{
              ...articlePaneProps.contentActions,
              onAskSelection: (selection) => {
                setAssistantContext({
                  componentIdentity: component.identity,
                  selection,
                });
              },
            }}
          />
          <div
            className="@7xl/reading:sticky @7xl/reading:top-4 z-20 @7xl/reading:col-start-2 @7xl/reading:row-start-1 self-start"
            id="reading-tools-panel"
          >
            <ReadingToolsPanel {...readingToolsProps} />
          </div>
        </div>
      </div>
      <div
        className={
          assistantOpen
            ? "sticky top-0 h-screen min-w-0 border-l bg-popover p-2 text-popover-foreground"
            : "hidden"
        }
      >
        <Suspense fallback={null}>
          <ReadingResearchAssistant
            onClose={() => setAssistantContext(undefined)}
            open={assistantOpen}
            reading={{
              componentIdentity: component.identity,
              componentLabel: component.label,
              sourceId: source.id,
              sourceTitle: source.title,
              stateId: source.stateId,
            }}
            selection={assistantOpen ? assistantContext.selection : undefined}
            triggerRef={assistantTriggerRef}
          />
        </Suspense>
      </div>
    </main>
  );
}

function authoredFragmentFromClick(event: MouseEvent<HTMLElement>) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    !(event.target instanceof Element)
  )
    return;
  const anchor = event.target.closest<HTMLAnchorElement>("a[href]");
  if (
    !anchor ||
    anchor.hasAttribute("download") ||
    (anchor.target && anchor.target !== "_self")
  )
    return;
  const current = new URL(window.location.href);
  const destination = new URL(anchor.href, current);
  if (
    destination.origin !== current.origin ||
    destination.pathname !== current.pathname ||
    destination.search !== current.search ||
    destination.hash.length <= 1
  )
    return;
  return destination.hash.slice(1);
}
