import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { createRef } from "react";

import { readingFixture } from "../../routes/sources/-reading-test-fixtures";
import { Bibliography } from "./bibliography";

afterEach(cleanup);

test("waits for layout before scrolling to a selected entry", async () => {
  const originalAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;
  const originalGetBoundingClientRect =
    HTMLElement.prototype.getBoundingClientRect;
  const originalScrollTo = HTMLElement.prototype.scrollTo;
  const clientHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "clientHeight",
  );
  const animationFrames = new Map<number, FrameRequestCallback>();
  let nextFrameId = 0;
  let layoutReady = false;
  let requestedTop: number | undefined;
  window.requestAnimationFrame = (callback) => {
    nextFrameId += 1;
    animationFrames.set(nextFrameId, callback);
    return nextFrameId;
  };
  window.cancelAnimationFrame = (id) => animationFrames.delete(id);
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.id === "article:entry-one") {
      return DOMRect.fromRect(
        layoutReady ? { height: 40, y: 600 } : { height: 0, y: 0 },
      );
    }
    if (this.dataset.scrollContainer)
      return DOMRect.fromRect({ height: 400, y: 100 });
    return originalGetBoundingClientRect.call(this);
  };
  Object.defineProperty(HTMLElement.prototype, "clientHeight", {
    configurable: true,
    get() {
      return this.dataset.scrollContainer
        ? 400
        : (clientHeight?.get?.call(this) ?? 0);
    },
  });
  HTMLElement.prototype.scrollTo = function (options) {
    if (this.dataset.scrollContainer && typeof options === "object")
      requestedTop = options.top;
  };

  try {
    const scrollContainerRef = createRef<HTMLDivElement>();
    const reading = readingFixture();
    render(
      <div data-scroll-container ref={scrollContainerRef}>
        <Bibliography
          citationScrollRequest={1}
          components={reading.components}
          onReturn={() => undefined}
          scrollContainerRef={scrollContainerRef}
          selectedComponentIdentity="article"
          selectedEntry="entry-one"
        />
      </div>,
    );
    const citationContext = document
      .getElementById("article:entry-one")
      ?.querySelector("details");
    expect(citationContext).toBeInstanceOf(HTMLDetailsElement);
    expect((citationContext as HTMLDetailsElement).open).toBe(false);

    await act(async () => {
      layoutReady = true;
      const callbacks = [...animationFrames.values()];
      animationFrames.clear();
      for (const callback of callbacks) callback(performance.now());
    });

    expect(requestedTop).toBe(320);
  } finally {
    window.requestAnimationFrame = originalAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    HTMLElement.prototype.getBoundingClientRect = originalGetBoundingClientRect;
    HTMLElement.prototype.scrollTo = originalScrollTo;
    if (clientHeight)
      Object.defineProperty(
        HTMLElement.prototype,
        "clientHeight",
        clientHeight,
      );
  }
});
