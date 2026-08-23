import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { inquiry } from "@/clients/inquiry";
import type { SepReadingData } from "./content";
import { observeReadingNavigation } from "./navigation-observations";

const historyPositionsKey = "lirnaReadingPositions";
const historyNavigationPositionsKey = "lirnaReadingNavigationPositions";

function historyPositionKey(
  sourceId: string,
  stateId: string,
  componentIdentity: string,
) {
  return JSON.stringify([sourceId, stateId, componentIdentity]);
}

function historyScrollTop(
  sourceId: string,
  stateId: string,
  componentIdentity: string,
) {
  const key = historyPositionKey(sourceId, stateId, componentIdentity);
  const state = window.history.state;
  if (!state || typeof state !== "object") return undefined;
  return (
    historyNavigationScrollTop(key) ??
    stateScrollTop(state[historyPositionsKey], key)
  );
}

function historyNavigationScrollTop(key: string) {
  const state = window.history.state;
  if (!state || typeof state !== "object") return undefined;
  const snapshot = state[historyNavigationPositionsKey];
  if (!snapshot || typeof snapshot !== "object") return undefined;
  const { href, positions } = snapshot as {
    href?: unknown;
    positions?: unknown;
  };
  if (href !== window.location.href) return undefined;
  return stateScrollTop(positions, key);
}

function stateScrollTop(positions: unknown, key: string) {
  if (!positions || typeof positions !== "object") return undefined;
  const scrollTop = (positions as Record<string, unknown>)[key];
  return typeof scrollTop === "number" && Number.isFinite(scrollTop)
    ? Math.max(0, scrollTop)
    : undefined;
}

export function saveReadingHistoryScrollTop(
  sourceId: string,
  stateId: string,
  componentIdentity: string,
  scrollTop: number,
) {
  const key = historyPositionKey(sourceId, stateId, componentIdentity);
  writeNavigationScrollTop(key, scrollTop);
  writeHistoryScrollTop(key, scrollTop);
}

function writeNavigationScrollTop(key: string, scrollTop: number) {
  const state =
    window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
  const current = state[historyNavigationPositionsKey];
  const positions =
    current &&
    typeof current === "object" &&
    (current as { href?: unknown }).href === window.location.href
      ? (current as { positions?: Record<string, number> }).positions
      : undefined;
  window.history.replaceState(
    {
      ...state,
      [historyNavigationPositionsKey]: {
        href: window.location.href,
        positions: { ...positions, [key]: scrollTop },
      },
    },
    "",
  );
}

function writeHistoryScrollTop(key: string, scrollTop: number) {
  const state =
    window.history.state && typeof window.history.state === "object"
      ? window.history.state
      : {};
  const positions =
    state[historyPositionsKey] && typeof state[historyPositionsKey] === "object"
      ? state[historyPositionsKey]
      : {};
  window.history.replaceState(
    {
      ...state,
      __hashScrollIntoViewOptions: false,
      [historyPositionsKey]: {
        ...positions,
        [key]: scrollTop,
      },
    },
    "",
  );
}

export function useReadingResume({
  component,
  ephemeralScrollTop,
  explicitFragment,
  sourceId,
  stateId,
}: {
  component: SepReadingData["components"][number] | undefined;
  ephemeralScrollTop: number | undefined;
  explicitFragment?: string;
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

  useEffect(() => {
    if (!component) return;
    const initialEntryScrollTop = historyScrollTop(
      sourceId,
      stateId,
      component.identity,
    );
    const initialNavigationScrollTop = historyNavigationScrollTop(
      historyPositionKey(sourceId, stateId, component.identity),
    );
    if (
      isPending &&
      initialEntryScrollTop === undefined &&
      ephemeralScrollTop === undefined
    )
      return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let restoreTimer: ReturnType<typeof setTimeout> | undefined;
    let correctionTimer: ReturnType<typeof setTimeout> | undefined;
    let firstFrame = 0;
    let secondFrame = 0;
    let started = false;
    const save = (requestedScrollTop = window.scrollY) => {
      const scrollTop = Math.max(0, Math.round(requestedScrollTop));
      writeHistoryScrollTop(
        historyPositionKey(sourceId, stateId, component.identity),
        scrollTop,
      );
      mutate(
        {
          componentIdentity: component.identity,
          componentLabel: component.label,
          scrollTop,
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
      writeHistoryScrollTop(
        historyPositionKey(sourceId, stateId, component.identity),
        Math.max(0, Math.round(window.scrollY)),
      );
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 500);
    };
    const saveImmediately = () => {
      if (timer) clearTimeout(timer);
      setStatus("saving");
      save();
    };
    const cancelCorrection = () => {
      if (correctionTimer) clearTimeout(correctionTimer);
      correctionTimer = undefined;
    };
    const start = () => {
      const entryScrollTop =
        historyScrollTop(sourceId, stateId, component.identity) ??
        initialEntryScrollTop;
      const persistedScrollTop =
        resume?.sourceId === sourceId &&
        resume.stateId === stateId &&
        resume.componentIdentity === component.identity
          ? resume.scrollTop
          : 0;
      const desiredScrollTop =
        entryScrollTop ?? ephemeralScrollTop ?? persistedScrollTop;
      started = true;
      window.addEventListener("scroll", handleScroll, { passive: true });
      if (!explicitFragment) {
        observeReadingNavigation({
          cause: "resume",
          owner: "article",
          target: `scroll-top:${desiredScrollTop}`,
        });
        window.scrollTo({ top: desiredScrollTop });
      }
      if (
        !explicitFragment &&
        initialNavigationScrollTop !== undefined &&
        window.location.hash.length > 0
      ) {
        correctionTimer = setTimeout(() => {
          observeReadingNavigation({
            cause: "resume-correction",
            owner: "article",
            target: `scroll-top:${desiredScrollTop}`,
          });
          window.scrollTo({ top: desiredScrollTop });
        }, 1000);
      }
      setStatus("saved");
      window.addEventListener("keydown", cancelCorrection);
      window.addEventListener("pagehide", saveImmediately);
      window.addEventListener("pointerdown", cancelCorrection);
      window.addEventListener("touchstart", cancelCorrection, {
        passive: true,
      });
      window.addEventListener("wheel", cancelCorrection, { passive: true });
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
      cancelAnimationFrame(secondFrame);
      if (restoreTimer) clearTimeout(restoreTimer);
      cancelCorrection();
      if (!started) return;
      if (timer) clearTimeout(timer);
      save(
        historyScrollTop(sourceId, stateId, component.identity) ??
          window.scrollY,
      );
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("keydown", cancelCorrection);
      window.removeEventListener("pagehide", saveImmediately);
      window.removeEventListener("pointerdown", cancelCorrection);
      window.removeEventListener("touchstart", cancelCorrection);
      window.removeEventListener("wheel", cancelCorrection);
      document.removeEventListener("visibilitychange", saveImmediately);
    };
  }, [
    component,
    ephemeralScrollTop,
    explicitFragment,
    isPending,
    mutate,
    resume,
    sourceId,
    stateId,
  ]);

  return status;
}
