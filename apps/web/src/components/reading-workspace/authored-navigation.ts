import type { RefObject } from "react";

import type { SepReadingData } from "./content";
import {
  observeReadingNavigation,
  type ReadingNavigationCause,
  readingToolsOwnerFor,
} from "./navigation-observations";
import type { ReadingNavigation } from "./reading-navigation";
import {
  type ReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./reading-scene-topology";
import { type ReadingReference, referenceTarget } from "./references";

export function authoredTarget(
  reading: SepReadingData,
  from: SepReadingData["components"][number],
  href: string,
) {
  try {
    const url = new URL(href, from.finalUrl);
    const component = reading.components.find((candidate) =>
      [candidate.requestedUrl, candidate.finalUrl].some(
        (value) =>
          comparableComponentUrl(value) === comparableComponentUrl(url),
      ),
    );
    return component
      ? { component, fragment: fragmentFromUrl(url) }
      : undefined;
  } catch {
    return undefined;
  }
}

export function scrollToPendingFragment(
  ref: RefObject<string | undefined>,
  {
    cause,
    container,
    highlight = false,
  }: {
    container?: RefObject<HTMLElement | null>;
    cause?: ReadingNavigationCause;
    highlight?: boolean;
  } = {},
) {
  requestAnimationFrame(() => {
    const fragment = ref.current;
    if (!fragment) return;
    const target = document.getElementById(fragment);
    if (!target) return;
    scrollTarget(target, container?.current, cause);
    if (highlight) highlightTarget(target);
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
  onPublisherNoteActivate,
  topology,
  toolsScrollRef,
}: {
  articleRef: RefObject<HTMLElement | null>;
  componentIdentity: string;
  navigation: ReadingNavigation;
  notesIdentity?: string;
  onPublisherNoteActivate?: () => void;
  topology: ReadingSceneTopology;
  toolsScrollRef: RefObject<HTMLElement | null>;
}) {
  return (reference: ReadingReference) => {
    const destination = resolveReadingSceneDestination(topology, {
      sceneIdentity: reference.componentIdentity,
      target: referenceTarget(reference),
    });
    if (destination.movement === "none") return;
    const isPublisherNote = destination.owner === "publisher-note";
    if (isPublisherNote && reference.componentIdentity !== notesIdentity)
      return;
    if (isPublisherNote) onPublisherNoteActivate?.();
    const root = isPublisherNote ? toolsScrollRef.current : articleRef.current;
    if (
      !root ||
      (!isPublisherNote && reference.componentIdentity !== componentIdentity)
    )
      return;
    const target = [...root.querySelectorAll<HTMLElement>("[id]")].find(
      (element) => element.id === reference.targetId,
    );
    if (!target) return;
    const targetIdentity = destination.target;
    const handle = navigation.request({
      cause: "reference-target",
      owner: destination.owner,
      target: targetIdentity,
    });
    handle.commit(() => {
      scrollTarget(
        target,
        isPublisherNote ? toolsScrollRef.current : undefined,
        "reference-target",
        targetIdentity,
      );
      highlightTarget(target);
    });
  };
}

export function scrollTarget(
  target: HTMLElement,
  scrollContainer?: HTMLElement | null,
  cause: ReadingNavigationCause = "pending-fragment",
  targetIdentity?: string,
) {
  const targetName =
    targetIdentity ??
    (target.id ? `#${target.id}` : target.tagName.toLowerCase());
  if (!scrollContainer?.contains(target)) {
    observeReadingNavigation({
      cause,
      owner: "article",
      target: targetName,
    });
    target.scrollIntoView({ block: "center" });
    return;
  }
  observeReadingNavigation({
    cause,
    owner: readingToolsOwnerFor(scrollContainer),
    target: targetName,
  });
  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  scrollContainer.scrollTo({
    top:
      scrollContainer.scrollTop +
      targetRect.top -
      containerRect.top -
      (scrollContainer.clientHeight - targetRect.height) / 2,
  });
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
