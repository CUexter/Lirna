import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from "react";

import { scrollTarget, scrollToPendingFragment } from "./authored-navigation";
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

export function useSceneFragmentNavigation({
  articleRef,
  componentIdentity,
  navigation,
  notesIdentity,
  pendingFragment,
  toolsScrollRef,
}: {
  articleRef: RefObject<HTMLElement | null>;
  componentIdentity: string;
  navigation: ReadingNavigation;
  notesIdentity?: string;
  pendingFragment: RefObject<
    | {
        fragment: string;
        owner: "article" | "publisher-note";
        sceneIdentity: string;
        target: string;
      }
    | undefined
  >;
  toolsScrollRef: RefObject<HTMLElement | null>;
}) {
  useEffect(() => {
    const pending = pendingFragment.current;
    if (!pending) return;
    const activeIdentity =
      pending.owner === "publisher-note" ? notesIdentity : componentIdentity;
    if (pending.sceneIdentity !== activeIdentity) return;
    const fragment = { current: pending.fragment };
    scrollToPendingFragment(fragment, {
      cause: "pending-fragment",
      ...(pending.owner === "publisher-note"
        ? { container: toolsScrollRef, targetRoot: toolsScrollRef }
        : { targetRoot: articleRef }),
      highlight: true,
      navigation,
      target: pending.target,
    });
    pendingFragment.current = undefined;
  }, [
    articleRef,
    componentIdentity,
    navigation,
    notesIdentity,
    pendingFragment,
    toolsScrollRef,
  ]);
}

function decodeFragment(fragment: string) {
  const value = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
