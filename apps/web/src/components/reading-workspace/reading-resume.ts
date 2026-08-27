import { type RefObject, useEffect, useState } from "react";

import type { ReadingDerivative } from "./content";
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

export function useReadingResume({
  articleRef,
  component,
  navigation,
  sourceId,
  stateId,
}: {
  articleRef: RefObject<HTMLElement | null>;
  component: ReadingDerivative["components"][number] | undefined;
  navigation: ReadingNavigation;
  sourceId: string;
  stateId: string;
}) {
  const { isPending, mutate, resume, resumeIntent } = useReadingResumeSession({
    active: true,
    component,
    navigation,
    owner: "article",
    sourceId,
    stateId,
  });
  const [status, setStatus] = useState<"saving" | "saved" | "error">("saving");
  const componentIdentity = component?.identity;
  const componentLabel = component?.label;

  useEffect(() => {
    if (!(componentIdentity && componentLabel)) return;
    const initialEntryScrollTop = historyScrollTop(
      sourceId,
      stateId,
      componentIdentity,
    );
    if (isPending && initialEntryScrollTop === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let readinessFrame = 0;
    const semanticLocation = (scrollTop: number) =>
      createReadingSemanticLocation({
        componentIdentity,
        owner: "article",
        root: articleRef.current,
        scrollTop,
        sourceId,
        stateId,
        viewportHeight: window.innerHeight,
      });
    const save = (requestedScrollTop = window.scrollY) => {
      const scrollTop = Math.max(0, Math.round(requestedScrollTop));
      const semantic = semanticLocation(scrollTop);
      writeReadingHistoryPosition(
        historyPositionKey(sourceId, stateId, componentIdentity),
        semantic,
      );
      mutate(
        {
          componentIdentity,
          componentLabel,
          scrollTop,
          semanticLocation: semantic,
          sourceId,
          stateId,
        },
        {
          onError: () => setStatus("error"),
          onSuccess: () => setStatus("saved"),
        },
      );
    };
    const handleScroll = () => {
      const scrollTop = Math.max(0, Math.round(window.scrollY));
      writeReadingHistoryPosition(
        historyPositionKey(sourceId, stateId, componentIdentity),
        semanticLocation(scrollTop),
      );
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 500);
    };
    const saveImmediately = () => {
      if (timer) clearTimeout(timer);
      setStatus("saving");
      save();
    };
    const entryScrollTop =
      historyScrollTop(sourceId, stateId, componentIdentity) ??
      initialEntryScrollTop;
    const persisted =
      resume?.sourceId === sourceId &&
      resume.stateId === stateId &&
      resume.componentIdentity === componentIdentity
        ? resume
        : undefined;
    const legacyScrollTop = entryScrollTop ?? persisted?.scrollTop ?? 0;
    const resumeLocation =
      historySemanticLocation(sourceId, stateId, componentIdentity) ??
      persisted?.semanticLocation;
    const intent = resumeIntent;
    if (
      !intent ||
      intent.key !== historyPositionKey(sourceId, stateId, componentIdentity)
    )
      return;
    const { handle } = intent;
    window.addEventListener("scroll", handleScroll, { passive: true });
    const commitWhenReady = () => {
      if (!handle.active()) return;
      const article = articleRef.current;
      if (!article || !isReadingTargetReady(article)) {
        readinessFrame = requestAnimationFrame(commitWhenReady);
        return;
      }
      const destination = resolveReadingResumeLocation({
        componentIdentity,
        legacyScrollTop,
        location: resumeLocation,
        owner: "article",
        root: article,
        scrollTop: window.scrollY,
        sourceId,
        stateId,
        viewportHeight: window.innerHeight,
      });
      handle.commit(
        { kind: "position", top: destination.scrollTop },
        {
          cause: destination.cause,
          owner: "article",
          target: destination.target,
        },
      );
    };
    commitWhenReady();
    setStatus("saved");
    window.addEventListener("pagehide", saveImmediately);
    document.addEventListener("visibilitychange", saveImmediately);
    return () => {
      cancelAnimationFrame(readinessFrame);
      if (timer) clearTimeout(timer);
      save(
        historyScrollTop(sourceId, stateId, componentIdentity) ??
          window.scrollY,
      );
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", saveImmediately);
      document.removeEventListener("visibilitychange", saveImmediately);
    };
  }, [
    articleRef,
    componentIdentity,
    componentLabel,
    isPending,
    mutate,
    resume,
    resumeIntent,
    sourceId,
    stateId,
  ]);

  return status;
}
