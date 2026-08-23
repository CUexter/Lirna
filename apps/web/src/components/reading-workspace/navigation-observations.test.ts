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
    owner: "reading-tools:bibliography",
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
      owner: "reading-tools:bibliography",
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

test("reader scroll controls cancel only their affected owner before movement", () => {
  const tools = document.createElement("div");
  tools.dataset.readingScrollOwner = "reading-tools:notes";
  document.body.append(tools);
  const canceled: string[] = [];
  const stop = observeDirectReaderScroll({
    onReaderControl: (owner) => canceled.push(owner),
    toolsScrollElement: tools,
  });

  tools.dispatchEvent(new WheelEvent("wheel", { bubbles: true }));
  window.dispatchEvent(new Event("scroll"));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown" }));
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab" }));

  stop();
  tools.remove();
  expect(canceled).toEqual(["reading-tools:notes", "article"]);
});

test("a reader action does not cancel another owner's programmatic movement", () => {
  const tools = document.createElement("div");
  tools.dataset.readingScrollOwner = "reading-tools:bibliography";
  document.body.append(tools);
  const canceled: string[] = [];
  const stop = observeDirectReaderScroll({
    onReaderControl: (owner) => canceled.push(owner),
    toolsScrollElement: tools,
  });

  window.dispatchEvent(new WheelEvent("wheel"));
  tools.dispatchEvent(new Event("scroll"));

  stop();
  tools.remove();
  expect(canceled).toEqual(["article"]);
});

test("reader scrollbar control cancels its scroll owner", () => {
  const tools = document.createElement("div");
  tools.dataset.readingScrollOwner = "publisher-note";
  document.body.append(tools);
  Object.defineProperty(tools, "clientWidth", { value: 80 });
  tools.getBoundingClientRect = () =>
    ({ left: 10 }) as ReturnType<HTMLElement["getBoundingClientRect"]>;
  const canceled: string[] = [];
  const stop = observeDirectReaderScroll({
    onReaderControl: (owner) => canceled.push(owner),
    toolsScrollElement: tools,
  });

  tools.dispatchEvent(
    new PointerEvent("pointerdown", { bubbles: true, clientX: 95 }),
  );

  stop();
  tools.remove();
  expect(canceled).toEqual(["publisher-note"]);
});
