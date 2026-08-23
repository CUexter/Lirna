import { type RefObject, useLayoutEffect, useRef } from "react";

import { highlightTarget, scrollTarget } from "./authored-navigation";
import type { SepReadingData } from "./content";
import { observeReadingNavigation } from "./navigation-observations";
import type { ReadingNavigation } from "./reading-navigation";
import { saveReadingHistoryScrollTop } from "./reading-resume";
import type { ReadingSceneTopology } from "./reading-scene-topology";

export function useComponentTree(
  reading: SepReadingData,
  selectedComponent: string | undefined,
  topology: ReadingSceneTopology,
) {
  const sceneIdentity = selectedComponent ?? topology.mainSceneIdentity;
  const selectedScene = topology.scenes.find(
    (item) => item.identity === sceneIdentity,
  );
  const scene =
    selectedScene?.presentationRegion === "article"
      ? selectedScene
      : selectedScene
        ? topology.scenes.find(
            (item) => item.identity === topology.mainSceneIdentity,
          )
        : undefined;
  const component = scene
    ? reading.components.find(
        (item) => item.identity === scene.componentIdentity,
      )
    : undefined;
  const componentForScene = (identity?: string) =>
    identity
      ? reading.components.find((item) => item.identity === identity)
      : undefined;
  const parent = componentForScene(scene?.parentSceneIdentity);
  const previous = componentForScene(scene?.previousSceneIdentity);
  const next = componentForScene(scene?.nextSceneIdentity);
  const publisherNoteIdentity =
    selectedScene?.presentationRegion === "reading-tools:supplementary"
      ? selectedScene.componentIdentity
      : undefined;
  return { component, next, parent, previous, publisherNoteIdentity };
}

export function usePreservedScroll() {
  const scrollTop = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    if (scrollTop.current === undefined) return;
    observeReadingNavigation({
      cause: "preserved-scroll",
      owner: "article",
      target: `scroll-top:${scrollTop.current}`,
    });
    window.scrollTo({ top: scrollTop.current });
    scrollTop.current = undefined;
  });
  return () => {
    scrollTop.current = window.scrollY;
  };
}

export function usePendingCitationReturn({
  articleRef,
  componentIdentity,
  navigation,
  notesIdentity,
  pendingCitation,
  toolsScrollRef,
}: {
  articleRef: RefObject<HTMLElement | null>;
  componentIdentity: string;
  navigation: ReadingNavigation;
  notesIdentity?: string;
  pendingCitation: RefObject<
    | {
        componentIdentity: string;
        mentionId: string;
        owner: "article" | "publisher-note";
      }
    | undefined
  >;
  toolsScrollRef: RefObject<HTMLDivElement | null>;
}) {
  useLayoutEffect(() => {
    const pending = pendingCitation.current;
    const inNotes = pending?.owner === "publisher-note";
    if (
      !pending ||
      (inNotes
        ? pending.componentIdentity !== notesIdentity
        : pending.componentIdentity !== componentIdentity)
    )
      return;
    const target = `citation:${pending.componentIdentity}:${pending.mentionId}`;
    const handle = navigation.request({
      cause: "citation-return",
      owner: pending.owner,
      target,
    });
    const returnToCitation = () => {
      if (!handle.active()) return;
      const citation = [
        ...((inNotes
          ? toolsScrollRef.current
          : articleRef.current
        )?.querySelectorAll<HTMLElement>("[id]") ?? []),
      ].find((element) => element.id === pending.mentionId);
      if (!citation) return;
      if (
        handle.commit(() =>
          scrollTarget(
            citation,
            inNotes ? toolsScrollRef.current : undefined,
            "citation-return",
            target,
          ),
        )
      ) {
        highlightTarget(citation);
        pendingCitation.current = undefined;
      }
    };
    if (!inNotes) {
      returnToCitation();
      return;
    }
    const frame = requestAnimationFrame(returnToCitation);
    return () => {
      cancelAnimationFrame(frame);
      handle.cancel();
    };
  }, [
    articleRef,
    componentIdentity,
    navigation,
    notesIdentity,
    pendingCitation,
    toolsScrollRef,
  ]);
}

export function useScrollRestore({
  articleRef,
  component,
  navigation,
  sourceId,
  stateId,
  onViewChange,
}: {
  articleRef: RefObject<HTMLElement | null>;
  component: SepReadingData["components"][number] | undefined;
  navigation: ReadingNavigation;
  sourceId: string;
  stateId: string;
  onViewChange: (view: "article" | "bibliography", citation?: string) => void;
}) {
  const locations = useRef(new Map<string, number>());
  const ephemeralScrollTop = component
    ? locations.current.get(component.identity)
    : undefined;

  const saveLocation = () => {
    if (!component) return;
    locations.current.set(component.identity, window.scrollY);
    saveReadingHistoryScrollTop(
      sourceId,
      stateId,
      component.identity,
      window.scrollY,
    );
  };
  const openBibliography = (entryId: string | undefined) => {
    onViewChange("bibliography", entryId);
  };
  const returnToCitation = (mentionId: string) => {
    if (!component) return;
    const citation = [
      ...(articleRef.current?.querySelectorAll<HTMLElement>("[id]") ?? []),
    ].find((element) => element.id === mentionId);
    if (!citation) return;
    const target = `citation:${component.identity}:${mentionId}`;
    const handle = navigation.request({
      cause: "citation-return",
      owner: "article",
      target,
    });
    handle.commit(() =>
      scrollTarget(citation, undefined, "citation-return", target),
    );
    highlightTarget(citation);
  };
  return {
    ephemeralScrollTop,
    openBibliography,
    returnToCitation,
    saveLocation,
  };
}
