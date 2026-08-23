import { buttonVariants } from "@lirna/ui/components/button";
import { Link } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import type { MouseEvent } from "react";

import { ReadingArticlePane } from "./reading-article-pane";
import { ReadingToolsPanel } from "./reading-tools-panel";

export function ReadingWorkspaceView({
  articlePaneProps,
  onFragmentActivate,
  readingToolsProps,
}: {
  articlePaneProps: React.ComponentProps<typeof ReadingArticlePane>;
  onFragmentActivate: (fragment: string) => void;
  readingToolsProps: React.ComponentProps<typeof ReadingToolsPanel>;
}) {
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: delegated anchor clicks retain native keyboard activation.
    <main
      className="min-h-full bg-background"
      onClick={(event) => {
        const fragment = authoredFragmentFromClick(event);
        if (!fragment) return;
        event.preventDefault();
        onFragmentActivate(fragment);
      }}
    >
      <header className="border-b px-4 sm:px-6 lg:px-10">
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
        </div>
      </header>
      <div className="mx-auto grid w-full max-w-[104rem] gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_26rem] lg:px-10 lg:py-12 2xl:grid-cols-[minmax(0,1fr)_28rem] 2xl:gap-12">
        <ReadingArticlePane {...articlePaneProps} />
        <div className="z-20 self-start lg:sticky lg:top-4 lg:col-start-2 lg:row-start-1">
          <ReadingToolsPanel {...readingToolsProps} />
        </div>
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
