import type { RefObject } from "react";
import {
  type ReadingReference,
  referenceTarget,
} from "../bibliography/components/References";
import type { ReadingNavigation } from "./model";
import type { ReadingNavigationCause } from "./observations";
import {
  type ReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./sceneTopology";

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
  // Restart the animation when the same publisher-authored link is followed repeatedly.
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
  showInArticle,
  topology,
  toolsScrollRef,
}: {
  articleRef: RefObject<HTMLElement | null>;
  componentIdentity: string;
  navigation: ReadingNavigation;
  notesIdentity?: string;
  onUnavailable?: (target: string) => void;
  onPublisherNoteActivate?: () => void;
  showInArticle: (target: HTMLElement | Range) => { show: () => void };
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
    const handle = navigation.request({
      cause: "reference-target",
      owner: destination.owner,
      target: destination.target,
    });
    if (
      handle.commit({
        kind: "target",
        scrollContainer: isPublisherNote ? toolsScrollRef.current : undefined,
        target,
      })
    )
      showInArticle(target).show();
  };
}
