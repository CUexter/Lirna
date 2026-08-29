import { expect, test } from "bun:test";
import { act, waitFor, within } from "@testing-library/react";
import { historySemanticLocation } from "@/features/reading-workspace/position/history";
import { sourceId, stateId } from "../test-support/fixtures";
import {
  calls,
  renderReading,
  resetActions,
  view,
} from "../test-support/routeHarness";
import {
  captureWindowScrollTo,
  openPublisherNote,
  scrollPublisherNote,
  setupArticleScroll,
  setupReadingUser,
  setWindowScrollY,
} from "../test-support/routeScenarios";

test("preserves article and publisher-note progress through a reference round trip", async () => {
  resetActions();
  const restoreScrollY = setWindowScrollY(540);

  try {
    const user = setupReadingUser();
    await renderReading();
    const container = await openPublisherNote(user);
    scrollPublisherNote(container, 360);

    await user.click(view().getByRole("button", { name: "Reference (1)" }));
    await view().findByText("Reference context");
    await waitFor(() =>
      expect(calls.resumeSave).toContainEqual(
        expect.objectContaining({
          componentIdentity: "notes",
          scrollTop: 360,
          semanticLocation: expect.objectContaining({
            scene: expect.objectContaining({ owner: "publisher-note" }),
          }),
        }),
      ),
    );
    expect(window.scrollY).toBe(540);

    await user.click(view().getByRole("button", { name: "Show in article" }));
    await view().findByText("Publisher-authored note.");
    expect(historySemanticLocation(sourceId, stateId, "notes")).toMatchObject({
      scene: { identity: "notes", owner: "publisher-note" },
      fallback: { scrollTop: 360 },
    });
    expect(window.scrollY).toBe(540);
  } finally {
    restoreScrollY();
  }
});

test("restores article progress after a publisher-note round trip", async () => {
  resetActions();
  const restoreScrollY = setWindowScrollY(540);
  const scroll = captureWindowScrollTo(true);

  try {
    const user = setupReadingUser();
    await renderReading();
    await view().findByText("A synthetic Source state passage.");
    window.scrollY = 540;
    act(() => window.dispatchEvent(new Event("scroll")));
    await user.click(view().getByText("[note 1]"));
    await view().findByText("Publisher-authored note.");

    await user.click(
      view().getByRole("link", { name: "Back to proposition 1" }),
    );
    await view().findByText("A synthetic Source state passage.");
    await waitFor(() => expect(window.scrollY).toBe(540));
  } finally {
    scroll.restore();
    restoreScrollY();
  }
});

test("preserves article and publisher-note progress through a Bibliography round trip", async () => {
  resetActions();
  const restoreScrollY = setWindowScrollY(540);

  try {
    const user = setupReadingUser();
    await renderReading();
    const container = await openPublisherNote(user);
    scrollPublisherNote(container, 480);
    const publisherNote = container.querySelector<HTMLElement>(
      '[data-reading-scene-owner="publisher-note"]',
    );
    if (!publisherNote) throw new Error("Publisher-note scene is unavailable");
    await user.click(
      within(publisherNote).getByRole("button", { name: /Citation: \[1\]/ }),
    );
    await view().findByRole("region", { name: "Bibliography" });
    await waitFor(() =>
      expect(calls.resumeSave).toContainEqual(
        expect.objectContaining({
          componentIdentity: "notes",
          scrollTop: 480,
        }),
      ),
    );
    expect(window.scrollY).toBe(540);

    const citationContext = view()
      .getAllByText("Citation context")
      .find((summary) =>
        summary.parentElement?.textContent?.includes("Publisher-authored note"),
      );
    if (!citationContext?.parentElement)
      throw new Error("Publisher-note citation context is unavailable");
    await user.click(citationContext);
    await user.click(
      within(citationContext.parentElement).getByRole("button", {
        name: "Show in article",
      }),
    );
    await view().findByText("Publisher-authored note.");
    await waitFor(() => expect(container.scrollTop).toBe(480));
    expect(historySemanticLocation(sourceId, stateId, "notes")).toMatchObject({
      scene: { identity: "notes", owner: "publisher-note" },
      fallback: { scrollTop: 480 },
    });
    expect(window.scrollY).toBe(540);
  } finally {
    restoreScrollY();
  }
});

test("preserves the article position when opening Bibliography", async () => {
  const article = await setupArticleScroll();

  try {
    window.scrollY = 620;
    article.scroll.locations.length = 0;

    await article.user.click(view().getByRole("tab", { name: "Bibliography" }));
    await view().findByRole("region", { name: "Bibliography" });
    expect(article.scroll.locations).toEqual([]);
    expect(window.scrollY).toBe(620);
  } finally {
    article.restore();
  }
});
