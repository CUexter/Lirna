import type { RefObject } from "react";

import type { ReadingData } from "./content";
import type { ReadingNavigationCause } from "./navigation-observations";
import type { ReadingNavigation } from "./reading-navigation";
import {
  type ReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./reading-scene-topology";
import { type ReadingReference, referenceTarget } from "./references";

export function authoredTarget(
  reading: ReadingData,
  from: ReadingData["components"][number],
  href: string,
) {
  try {
    const url = new URL(href, from.finalUrl);
    const components = reading.components.filter((candidate) =>
      [candidate.requestedUrl, candidate.finalUrl].some(
        (value) =>
          comparableComponentUrl(value) === comparableComponentUrl(url),
      ),
    );
    const component = components.length === 1 ? components[0] : undefined;
    return component
      ? { component, fragment: fragmentFromUrl(url) }
      : undefined;
  } catch {
    return undefined;
  }
}

export function componentHasFragment(
  component: ReadingData["components"][number],
  fragment: string,
) {
  const ids = new Set<string>(component.figures.map((figure) => figure.id));
  const visitInlines = (
    values: ReadingData["components"][number]["sections"][number]["title"],
  ) => {
    for (const value of values) {
      if (value.kind === "anchor") ids.add(value.id);
      if ("children" in value) visitInlines(value.children);
    }
  };
  const visitBlocks = (blocks: typeof component.introductoryBlocks) => {
    for (const block of blocks) visitBlock(block);
  };
  const visitBlock = (block: (typeof component.introductoryBlocks)[number]) => {
    if (block.kind === "statement") {
      visitInlines(block.label);
      visitInlines(block.body);
      return;
    }
    if (block.kind === "list") {
      for (const item of block.items) visitInlines(item);
      return;
    }
    if (block.kind === "table") {
      visitInlines(block.caption);
      for (const row of [...block.head, ...block.body])
        for (const cell of row.cells) visitInlines(cell);
      return;
    }
    if (block.kind === "figure") {
      ids.add(block.figure.id);
      visitInlines(block.figure.caption);
      visitInlines(block.figure.description.text);
      return;
    }
    if (block.kind !== "diagnostic") visitInlines(block.children);
  };
  const visitSections = (sections: typeof component.sections) => {
    for (const section of sections) {
      ids.add(section.id);
      visitInlines(section.title);
      visitBlocks(section.blocks);
      visitSections(section.children);
    }
  };
  visitBlocks(component.introductoryBlocks);
  visitSections(component.sections);
  return ids.has(fragment);
}

export function scrollToPendingFragment(
  ref: RefObject<string | undefined>,
  {
    cause,
    container,
    highlight = false,
    navigation,
    target,
    targetRoot,
  }: {
    container?: RefObject<HTMLElement | null>;
    cause?: ReadingNavigationCause;
    highlight?: boolean;
    navigation?: ReadingNavigation;
    target?: string;
    targetRoot?: RefObject<HTMLElement | null>;
  } = {},
) {
  requestAnimationFrame(() => {
    const fragment = ref.current;
    if (!fragment) return;
    const targetElement = targetRoot?.current
      ? [...targetRoot.current.querySelectorAll<HTMLElement>("[id]")].find(
          (element) => element.id === fragment,
        )
      : document.getElementById(fragment);
    if (!targetElement) return;
    if (navigation && cause && target) {
      const moved = navigation
        .request({
          cause,
          owner: container ? "publisher-note" : "article",
          target,
        })
        .commit({
          kind: "target",
          scrollContainer: container?.current,
          target: targetElement,
        });
      if (moved && highlight) highlightTarget(targetElement);
    }
    ref.current = undefined;
  });
}

export function highlightTarget(target: HTMLElement) {
  const visibleTarget = target.hasChildNodes()
    ? target
    : (target.parentElement ?? target);
  visibleTarget.classList.remove("authored-target-highlight");
  // Restart the animation when the same authored link is followed repeatedly.
  void visibleTarget.offsetWidth;
  visibleTarget.classList.add("authored-target-highlight");
  visibleTarget.addEventListener(
    "animationend",
    () => visibleTarget.classList.remove("authored-target-highlight"),
    { once: true },
  );
}

export function createReferenceJumper({
  articleRef,
  componentIdentity,
  navigation,
  notesIdentity,
  onUnavailable,
  onPublisherNoteActivate,
  topology,
  toolsScrollRef,
}: {
  articleRef: RefObject<HTMLElement | null>;
  componentIdentity: string;
  navigation: ReadingNavigation;
  notesIdentity?: string;
  onUnavailable?: (target: string) => void;
  onPublisherNoteActivate?: () => void;
  topology: ReadingSceneTopology;
  toolsScrollRef: RefObject<HTMLElement | null>;
}) {
  return (reference: ReadingReference) => {
    const destination = resolveReadingSceneDestination(topology, {
      sceneIdentity: reference.componentIdentity,
      target: referenceTarget(reference),
    });
    if (destination.movement === "none") {
      onUnavailable?.(reference.title);
      return;
    }
    const isPublisherNote = destination.owner === "publisher-note";
    if (isPublisherNote && reference.componentIdentity !== notesIdentity)
      return;
    const root = isPublisherNote ? toolsScrollRef.current : articleRef.current;
    if (
      !root ||
      (!isPublisherNote && reference.componentIdentity !== componentIdentity)
    )
      return;
    const target = [...root.querySelectorAll<HTMLElement>("[id]")].find(
      (element) => element.id === reference.targetId,
    );
    if (!target) {
      onUnavailable?.(reference.title);
      return;
    }
    if (isPublisherNote) onPublisherNoteActivate?.();
    const targetIdentity = destination.target;
    const handle = navigation.request({
      cause: "reference-target",
      owner: destination.owner,
      target: targetIdentity,
    });
    if (
      handle.commit({
        kind: "target",
        scrollContainer: isPublisherNote ? toolsScrollRef.current : undefined,
        target,
      })
    )
      highlightTarget(target);
  };
}

function comparableComponentUrl(value: string | URL) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname
    .replace(/(?:\/index)?\.html$/, "")
    .replace(/\/$/, "");
  return url.href;
}

function fragmentFromUrl(url: URL) {
  if (!url.hash) return undefined;
  try {
    return decodeURIComponent(url.hash.slice(1));
  } catch {
    return url.hash.slice(1);
  }
}
