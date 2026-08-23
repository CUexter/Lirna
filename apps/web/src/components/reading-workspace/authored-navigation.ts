import type { RefObject } from "react";

import type { SepReadingData } from "./content";

export function authoredTarget(
  reading: SepReadingData,
  from: SepReadingData["components"][number],
  href: string,
) {
  try {
    const url = new URL(href, from.finalUrl);
    const component = reading.components.find((candidate) =>
      [candidate.requestedUrl, candidate.finalUrl].some(
        (value) =>
          comparableComponentUrl(value) === comparableComponentUrl(url),
      ),
    );
    return component
      ? { component, fragment: fragmentFromUrl(url) }
      : undefined;
  } catch {
    return undefined;
  }
}

export function scrollToPendingFragment(
  ref: RefObject<string | undefined>,
  {
    container,
    highlight = false,
  }: {
    container?: RefObject<HTMLElement | null>;
    highlight?: boolean;
  } = {},
) {
  requestAnimationFrame(() => {
    const fragment = ref.current;
    if (!fragment) return;
    const target = document.getElementById(fragment);
    if (!target) return;
    scrollTarget(target, container?.current);
    if (highlight) highlightTarget(target);
    ref.current = undefined;
  });
}

export function highlightTarget(target: HTMLElement) {
  const visibleTarget = target.hasChildNodes()
    ? target
    : (target.parentElement ?? target);
  visibleTarget.classList.remove("authored-target-highlight");
  // Restart the animation when the same authored link is followed repeatedly.
  void visibleTarget.offsetWidth;
  visibleTarget.classList.add("authored-target-highlight");
  visibleTarget.addEventListener(
    "animationend",
    () => visibleTarget.classList.remove("authored-target-highlight"),
    { once: true },
  );
}

export function jumpToReference(
  reference: { targetId: string },
  container?: RefObject<HTMLElement | null>,
) {
  const target = document.getElementById(reference.targetId);
  if (!target) return;
  scrollTarget(target, container?.current);
  highlightTarget(target);
}

export function createReferenceJumper(
  container: RefObject<HTMLElement | null>,
) {
  return (reference: { targetId: string }) =>
    jumpToReference(reference, container);
}

export function scrollTarget(
  target: HTMLElement,
  scrollContainer?: HTMLElement | null,
) {
  if (!scrollContainer?.contains(target)) {
    target.scrollIntoView({ block: "center" });
    return;
  }
  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  scrollContainer.scrollTo({
    top:
      scrollContainer.scrollTop +
      targetRect.top -
      containerRect.top -
      (scrollContainer.clientHeight - targetRect.height) / 2,
  });
}

function comparableComponentUrl(value: string | URL) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname
    .replace(/(?:\/index)?\.html$/, "")
    .replace(/\/$/, "");
  return url.href;
}

function fragmentFromUrl(url: URL) {
  if (!url.hash) return undefined;
  try {
    return decodeURIComponent(url.hash.slice(1));
  } catch {
    return url.hash.slice(1);
  }
}
