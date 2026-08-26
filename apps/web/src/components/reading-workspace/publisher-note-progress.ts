import { type RefObject, useEffect } from "react";

import type { SepReadingData } from "./content";
import {
  historyPositionKey,
  historyScrollTop,
  historySemanticLocation,
  writeReadingHistoryPosition,
} from "./reading-history-position";
import type { ReadingNavigation } from "./reading-navigation";
import { isReadingTargetReady } from "./reading-navigation-hooks";
import { resolveReadingResumeLocation } from "./reading-resume-location";
import { useReadingResumeSession } from "./reading-resume-session";
import { createReadingSemanticLocation } from "./reading-semantic-location";

export function usePublisherNoteProgress({
  active,
  component,
  navigation,
  scrollContainerRef,
  sourceId,
  stateId,
}: {
  active: boolean;
  component?: SepReadingData["components"][number];
  navigation: ReadingNavigation;
  scrollContainerRef: RefObject<HTMLElement | null>;
  sourceId: string;
  stateId: string;
}) {
  const { isPending, mutate, resume, resumeIntent } = useReadingResumeSession({
    active,
    component,
    navigation,
    owner: "publisher-note",
    sourceId,
    stateId,
  });
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!active || !component || !container) return;
    const historyScroll = historyScrollTop(
      sourceId,
      stateId,
      component.identity,
    );
    const persisted =
      resume?.sourceId === sourceId &&
      resume.stateId === stateId &&
      resume.componentIdentity === component.identity
        ? resume
        : undefined;
    let readinessFrame = 0;
    if (!isPending || historyScroll !== undefined) {
      const intent = resumeIntent;
      const commitWhenReady = () => {
        if (
          !intent ||
          intent.key !==
            historyPositionKey(sourceId, stateId, component.identity) ||
          !intent.handle.active()
        )
          return;
        const root = sceneRoot(container, component.identity);
        if (!root || !isReadingTargetReady(root)) {
          readinessFrame = requestAnimationFrame(commitWhenReady);
          return;
        }
        const destination = resolveReadingResumeLocation({
          componentIdentity: component.identity,
          legacyScrollTop: historyScroll ?? persisted?.scrollTop ?? 0,
          location:
            historySemanticLocation(sourceId, stateId, component.identity) ??
            persisted?.semanticLocation,
          owner: "publisher-note",
          root: root ?? null,
          scrollTop: container.scrollTop,
          sourceId,
          stateId,
          viewportHeight: container.clientHeight,
          viewportTop: container.getBoundingClientRect().top,
        });
        intent.handle.commit(
          {
            kind: "position",
            scrollContainer: container,
            top: destination.scrollTop,
          },
          {
            cause: destination.cause,
            owner: "publisher-note",
            target: destination.target,
          },
        );
      };
      readinessFrame = requestAnimationFrame(() => {
        readinessFrame = requestAnimationFrame(commitWhenReady);
      });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    let latest = position(container, component.identity, sourceId, stateId);
    const save = () => {
      writeReadingHistoryPosition(
        historyPositionKey(sourceId, stateId, component.identity),
        latest.semanticLocation,
      );
      mutate({
        componentIdentity: component.identity,
        componentLabel: component.label,
        scrollTop: latest.scrollTop,
        semanticLocation: latest.semanticLocation,
        sourceId,
        stateId,
      });
    };
    const handleScroll = () => {
      dirty = true;
      latest = position(container, component.identity, sourceId, stateId);
      writeReadingHistoryPosition(
        historyPositionKey(sourceId, stateId, component.identity),
        latest.semanticLocation,
      );
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 500);
    };
    const saveImmediately = () => {
      if (isPending && historyScroll === undefined && !dirty) return;
      if (timer) clearTimeout(timer);
      save();
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pagehide", saveImmediately);
    document.addEventListener("visibilitychange", saveImmediately);
    return () => {
      cancelAnimationFrame(readinessFrame);
      if (timer) clearTimeout(timer);
      if (dirty) save();
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", saveImmediately);
      document.removeEventListener("visibilitychange", saveImmediately);
    };
  }, [
    active,
    component,
    isPending,
    mutate,
    resume,
    resumeIntent,
    scrollContainerRef,
    sourceId,
    stateId,
  ]);
}

function position(
  container: HTMLElement,
  componentIdentity: string,
  sourceId: string,
  stateId: string,
) {
  const root = sceneRoot(container, componentIdentity);
  const scrollTop = Math.max(0, Math.round(container.scrollTop));
  return {
    scrollTop,
    semanticLocation: createReadingSemanticLocation({
      componentIdentity,
      owner: "publisher-note",
      root: root ?? null,
      scrollTop,
      sourceId,
      stateId,
      viewportHeight: container.clientHeight,
      viewportTop: container.getBoundingClientRect().top,
    }),
  };
}

function sceneRoot(container: HTMLElement, componentIdentity: string) {
  return Array.from(
    container.querySelectorAll<HTMLElement>("[data-reading-scene-identity]"),
  ).find(
    (candidate) => candidate.dataset.readingSceneIdentity === componentIdentity,
  );
}
