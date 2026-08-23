import { useCallback, useEffect, useLayoutEffect, useRef } from "react";

import { scrollTarget } from "./authored-navigation";
import {
  createReadingNavigation,
  type ReadingNavigation,
  type ReadingNavigationHandle,
} from "./reading-navigation";

interface ActiveFragment {
  componentIdentity: string;
  fragment: string;
  frame: number;
  handle: ReadingNavigationHandle;
}

export function useReadingNavigationScope() {
  const articleRef = useRef<HTMLElement>(null);
  const toolsScrollRef = useRef<HTMLDivElement>(null);
  const navigation = useRef<ReadingNavigation | null>(null);
  if (!navigation.current) {
    navigation.current = createReadingNavigation();
  }
  return { articleRef, navigation: navigation.current, toolsScrollRef };
}

export function useExplicitFragmentNavigation({
  componentIdentity,
  fragment,
  navigation,
  onFragmentChange,
}: {
  componentIdentity: string;
  fragment?: string;
  navigation: ReadingNavigation;
  onFragmentChange: (fragment: string) => void;
}) {
  const activeFragment = useRef<ActiveFragment | null>(null);
  const cancelActiveFragment = useCallback(() => {
    const active = activeFragment.current;
    if (!active) return;
    cancelAnimationFrame(active.frame);
    active.handle.cancel();
    activeFragment.current = null;
  }, []);
  const beginFragment = useCallback(
    (nextFragment: string) => {
      const current = activeFragment.current;
      if (
        current?.componentIdentity === componentIdentity &&
        current.fragment === nextFragment &&
        current.handle.active()
      ) {
        return;
      }
      cancelActiveFragment();
      const targetId = decodeFragment(nextFragment);
      const handle = navigation.request({
        owner: "article",
        cause: "explicit-fragment-arrival",
        target: `fragment:${targetId}`,
      });
      const active: ActiveFragment = {
        componentIdentity,
        fragment: nextFragment,
        frame: 0,
        handle,
      };
      activeFragment.current = active;
      const commitWhenReady = () => {
        if (activeFragment.current !== active || !handle.active()) return;
        const target = document.getElementById(targetId);
        if (!target || !isReadingTargetReady(target)) {
          active.frame = requestAnimationFrame(commitWhenReady);
          return;
        }
        handle.commit(() =>
          scrollTarget(target, null, "explicit-fragment-arrival"),
        );
      };
      active.frame = requestAnimationFrame(commitWhenReady);
    },
    [cancelActiveFragment, componentIdentity, navigation],
  );

  useLayoutEffect(() => {
    if (fragment) {
      beginFragment(fragment);
    } else {
      cancelActiveFragment();
    }
  }, [beginFragment, cancelActiveFragment, fragment]);
  useEffect(() => cancelActiveFragment, [cancelActiveFragment]);

  return (nextFragment: string) => {
    beginFragment(nextFragment);
    onFragmentChange(nextFragment);
  };
}

export function isReadingTargetReady(target: Element) {
  if (!target.isConnected) return false;
  if (document.fonts?.status === "loading") return false;
  const article = target.closest("article") ?? target;
  return Array.from(article.querySelectorAll("img")).every(
    (image) => image.complete,
  );
}

function decodeFragment(fragment: string) {
  const value = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
