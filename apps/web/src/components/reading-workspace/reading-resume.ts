import { useMutation, useQuery } from "@tanstack/react-query";
import { type RefObject, useEffect, useRef, useState } from "react";

import { inquiry } from "@/clients/inquiry";
import type { SepReadingData } from "./content";
import { observeReadingNavigation } from "./navigation-observations";
import {
  historyPositionKey,
  historyScrollTop,
  historySemanticLocation,
  writeReadingHistoryPosition,
} from "./reading-history-position";
import type {
  ReadingNavigation,
  ReadingNavigationHandle,
} from "./reading-navigation";
import { isReadingTargetReady } from "./reading-navigation-hooks";
import { resolveReadingResumeLocation } from "./reading-resume-location";
import { createReadingSemanticLocation } from "./reading-semantic-location";

export { saveReadingHistoryScrollTop } from "./reading-history-position";

export function useReadingResume({
  articleRef,
  component,
  ephemeralScrollTop,
  navigation,
  sourceId,
  stateId,
}: {
  articleRef: RefObject<HTMLElement | null>;
  component: SepReadingData["components"][number] | undefined;
  ephemeralScrollTop: number | undefined;
  navigation: ReadingNavigation;
  sourceId: string;
  stateId: string;
}) {
  const { mutate } = useMutation(inquiry.sources.resume.save.mutationOptions());
  const resumeQuery = inquiry.sources.resume.get.queryOptions({
    input: component
      ? {
          sourceId,
          stateId,
          componentIdentity: component.identity,
        }
      : {},
  });
  const { data: resume, isPending } = useQuery({
    ...resumeQuery,
    enabled: Boolean(component),
  });
  const [status, setStatus] = useState<"saving" | "saved" | "error">("saving");
  const resumeIntent = useRef<{
    handle: ReadingNavigationHandle;
    key: string;
  } | null>(null);
  const componentIdentity = component?.identity;
  const resumeKey = componentIdentity
    ? historyPositionKey(sourceId, stateId, componentIdentity)
    : undefined;

  useEffect(() => {
    if (!(componentIdentity && resumeKey)) return;
    const intent = {
      handle: navigation.request({
        cause: "resume",
        owner: "article",
        target: `resume-position:${componentIdentity}`,
      }),
      key: resumeKey,
    };
    resumeIntent.current = intent;
    return () => {
      intent.handle.cancel();
      if (resumeIntent.current === intent) resumeIntent.current = null;
    };
  }, [componentIdentity, navigation, resumeKey]);

  useEffect(() => {
    if (!component) return;
    const initialEntryScrollTop = historyScrollTop(
      sourceId,
      stateId,
      component.identity,
    );
    if (
      isPending &&
      initialEntryScrollTop === undefined &&
      ephemeralScrollTop === undefined
    )
      return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let restoreTimer: ReturnType<typeof setTimeout> | undefined;
    let firstFrame = 0;
    let readinessFrame = 0;
    let secondFrame = 0;
    let started = false;
    const semanticLocation = (scrollTop: number) =>
      createReadingSemanticLocation({
        componentIdentity: component.identity,
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
        historyPositionKey(sourceId, stateId, component.identity),
        scrollTop,
        semantic,
      );
      mutate(
        {
          componentIdentity: component.identity,
          componentLabel: component.label,
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
        historyPositionKey(sourceId, stateId, component.identity),
        scrollTop,
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
      historyScrollTop(sourceId, stateId, component.identity) ??
      initialEntryScrollTop;
    const persisted =
      resume?.sourceId === sourceId &&
      resume.stateId === stateId &&
      resume.componentIdentity === component.identity
        ? resume
        : undefined;
    const legacyScrollTop =
      entryScrollTop ?? ephemeralScrollTop ?? persisted?.scrollTop ?? 0;
    const resumeLocation =
      historySemanticLocation(sourceId, stateId, component.identity) ??
      persisted?.semanticLocation;
    const intent = resumeIntent.current;
    if (
      !intent ||
      intent.key !== historyPositionKey(sourceId, stateId, component.identity)
    )
      return;
    const { handle } = intent;
    const start = () => {
      started = true;
      window.addEventListener("scroll", handleScroll, { passive: true });
      const commitWhenReady = () => {
        if (!handle.active()) return;
        const article = articleRef.current;
        if (!article || !isReadingTargetReady(article)) {
          readinessFrame = requestAnimationFrame(commitWhenReady);
          return;
        }
        const destination = resolveReadingResumeLocation({
          componentIdentity: component.identity,
          legacyScrollTop,
          location: resumeLocation,
          owner: "article",
          root: article,
          scrollTop: window.scrollY,
          sourceId,
          stateId,
          viewportHeight: window.innerHeight,
        });
        handle.commit(() => {
          observeReadingNavigation({
            cause: destination.cause,
            owner: "article",
            target: destination.target,
          });
          window.scrollTo({ top: destination.scrollTop });
        });
      };
      commitWhenReady();
      setStatus("saved");
      window.addEventListener("pagehide", saveImmediately);
      document.addEventListener("visibilitychange", saveImmediately);
    };

    // Native and router fragment scrolling run after the component is painted.
    // Let both settle so history can keep the fragment without losing position.
    firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        restoreTimer = setTimeout(start, 100);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(readinessFrame);
      cancelAnimationFrame(secondFrame);
      if (restoreTimer) clearTimeout(restoreTimer);
      if (!started) return;
      if (timer) clearTimeout(timer);
      save(
        historyScrollTop(sourceId, stateId, component.identity) ??
          window.scrollY,
      );
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("pagehide", saveImmediately);
      document.removeEventListener("visibilitychange", saveImmediately);
    };
  }, [
    articleRef,
    component,
    ephemeralScrollTop,
    isPending,
    mutate,
    resume,
    sourceId,
    stateId,
  ]);

  return status;
}
