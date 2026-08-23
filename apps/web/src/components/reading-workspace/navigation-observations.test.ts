import { expect, test } from "bun:test";

import {
  observeDirectReaderScroll,
  observeReadingNavigation,
  type ReadingNavigationObservation,
} from "./navigation-observations";

test("emits ordered navigation observations with owner, cause, and target", () => {
  const observations: ReadingNavigationObservation[] = [];
  const listener = (event: Event) =>
    observations.push(
      (event as CustomEvent<ReadingNavigationObservation>).detail,
    );
  window.addEventListener("lirna:reading-navigation", listener);

  observeReadingNavigation({
    cause: "resume",
    owner: "article",
    target: "scroll-top:120",
  });
  observeReadingNavigation({
    cause: "bibliography-selection",
    owner: "reading-tools",
    target: "#steup-2023",
  });

  window.removeEventListener("lirna:reading-navigation", listener);
  expect(observations).toEqual([
    {
      cause: "resume",
      order: observations[0]?.order,
      owner: "article",
      target: "scroll-top:120",
    },
    {
      cause: "bibliography-selection",
      order: observations[1]?.order,
      owner: "reading-tools",
      target: "#steup-2023",
    },
  ]);
  expect(observations[1]?.order).toBe((observations[0]?.order ?? 0) + 1);
});

test("labels reader-driven scrolling separately from programmatic movement", () => {
  const observations: ReadingNavigationObservation[] = [];
  const listener = (event: Event) =>
    observations.push(
      (event as CustomEvent<ReadingNavigationObservation>).detail,
    );
  const stop = observeDirectReaderScroll();
  window.addEventListener("lirna:reading-navigation", listener);

  window.dispatchEvent(new Event("wheel"));
  window.dispatchEvent(new Event("scroll"));

  stop();
  window.removeEventListener("lirna:reading-navigation", listener);
  expect(observations).toHaveLength(1);
  expect(observations[0]).toMatchObject({
    cause: "direct-reader-scroll",
    owner: "article",
  });
});
