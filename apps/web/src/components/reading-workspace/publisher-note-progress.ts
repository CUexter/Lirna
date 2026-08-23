import { useMutation } from "@tanstack/react-query";
import { type RefObject, useEffect } from "react";

import { inquiry } from "@/clients/inquiry";
import type { SepReadingData } from "./content";
import {
  historyPositionKey,
  writeReadingHistoryPosition,
} from "./reading-history-position";
import { createReadingSemanticLocation } from "./reading-semantic-location";

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

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!active || !component || !container) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
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
      if (timer) clearTimeout(timer);
      save();
    };
    container.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("pagehide", saveImmediately);
    document.addEventListener("visibilitychange", saveImmediately);
    return () => {
      if (timer) clearTimeout(timer);
      save();
      container.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", saveImmediately);
      document.removeEventListener("visibilitychange", saveImmediately);
    };
  }, [active, component, mutate, scrollContainerRef, sourceId, stateId]);
}

function position(
  container: HTMLElement,
  componentIdentity: string,
  sourceId: string,
  stateId: string,
) {
  const root = Array.from(
    container.querySelectorAll<HTMLElement>("[data-reading-scene-identity]"),
  ).find(
    (candidate) => candidate.dataset.readingSceneIdentity === componentIdentity,
  );
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
