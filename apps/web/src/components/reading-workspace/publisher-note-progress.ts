import { useMutation, useQuery } from "@tanstack/react-query";
import { type RefObject, useEffect } from "react";

import { inquiry } from "@/clients/inquiry";
import type { SepReadingData } from "./content";
import {
  historyPositionKey,
  historyScrollTop,
  historySemanticLocation,
  writeReadingHistoryPosition,
} from "./reading-history-position";
import {
  createReadingSemanticLocation,
  resolveReadingSemanticLocation,
} from "./reading-semantic-location";

export function usePublisherNoteProgress({
  active,
  component,
  scrollContainerRef,
  sourceId,
  stateId,
}: {
  active: boolean;
  component?: SepReadingData["components"][number];
  scrollContainerRef: RefObject<HTMLElement | null>;
  sourceId: string;
  stateId: string;
}) {
  const { mutate } = useMutation(inquiry.sources.resume.save.mutationOptions());
  const resumeQuery = inquiry.sources.resume.get.queryOptions({
    input: component
      ? { sourceId, stateId, componentIdentity: component.identity }
      : {},
  });
  const { data: resume, isPending } = useQuery({
    ...resumeQuery,
    enabled: active && Boolean(component),
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
    if (!isPending || historyScroll !== undefined) {
      const root = sceneRoot(container, component.identity);
      const fallbackScrollTop = historyScroll ?? persisted?.scrollTop ?? 0;
      const desiredScrollTop =
        resolveReadingSemanticLocation({
          componentIdentity: component.identity,
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
        }) ?? fallbackScrollTop;
      container.scrollTo({ top: desiredScrollTop });
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    let dirty = false;
    let latest = position(container, component.identity, sourceId, stateId);
    const save = () => {
      writeReadingHistoryPosition(
        historyPositionKey(sourceId, stateId, component.identity),
        latest.scrollTop,
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
        latest.scrollTop,
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
