import { expect, test } from "bun:test";
import { act, waitFor, within } from "@testing-library/react";
import {
  calls,
  readingPositionState,
  renderReading,
  resetActions,
  view,
} from "./reading-route-test-harness";
import {
  captureWindowScrollTo,
  openSupplementOne,
  setupArticleScroll,
  setupReadingUser,
  setWindowScrollY,
} from "./reading-route-test-scenarios";
import { sourceId, stateId } from "./reading-test-fixtures";

test("restores a component location through its parent breadcrumb", async () => {
  resetActions();
  const scroll = captureWindowScrollTo();
  const restoreScrollY = setWindowScrollY(240);

  try {
    const user = setupReadingUser();
    await renderReading();
    await waitFor(() => view().getByText("A synthetic Source state passage."));
    scroll.locations.length = 0;

    await openSupplementOne(user);
    window.scrollY = 480;
    await user.click(
      within(
        view().getByRole("navigation", { name: "Component path" }),
      ).getByRole("button", { name: "Article" }),
    );
    await waitFor(() => view().getByText("A synthetic Source state passage."));
    await waitFor(() => expect(scroll.locations).toContainEqual({ top: 240 }));
  } finally {
    scroll.restore();
    restoreScrollY();
  }
});

test("restores and saves positions for the selected Source component", async () => {
  resetActions();
  const scroll = captureWindowScrollTo();
  readingPositionState.getResume = async (input) => {
    calls.resumeGet.push(input);
    return {
      sourceId,
      stateId,
      sourceTitle: "Synthetic Reading Source",
      componentIdentity: "supplement-one",
      componentLabel: "Supplement one",
      scrollTop: 640,
      savedAt: "2026-08-20T01:00:00.000Z",
    };
  };

  try {
    await renderReading("?component=supplement-one");
    await waitFor(() => view().getByText("First supplement content."));
    await waitFor(() => expect(scroll.locations).toContainEqual({ top: 640 }));
    expect(calls.resumeGet).toContainEqual({
      sourceId,
      stateId,
      componentIdentity: "supplement-one",
    });
    act(() => window.dispatchEvent(new Event("pagehide")));
    await waitFor(() =>
      expect(calls.resumeSave).toContainEqual(
        expect.objectContaining({
          sourceId,
          stateId,
          componentIdentity: "supplement-one",
          semanticLocation: expect.objectContaining({
            source: { sourceId, stateId },
            scene: expect.objectContaining({
              identity: "supplement-one",
              owner: "article",
            }),
            fallback: expect.objectContaining({ scrollTop: 0 }),
          }),
        }),
      ),
    );
  } finally {
    scroll.restore();
  }
});

test("does not restore a saved position over an explicit fragment", async () => {
  resetActions();
  const scroll = captureWindowScrollTo();
  readingPositionState.getResume = async () => ({
    sourceId,
    stateId,
    sourceTitle: "Synthetic Reading Source",
    componentIdentity: "article",
    componentLabel: "Article",
    scrollTop: 640,
    savedAt: "2026-08-20T01:00:00.000Z",
  });

  try {
    await renderReading("#Poss");
    await waitFor(() => view().getByText("A synthetic Source state passage."));
    await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
    expect(scroll.locations).toEqual([]);
  } finally {
    scroll.restore();
  }
});

test("starts an unseen Source component at the top before saving it", async () => {
  const article = await setupArticleScroll();

  try {
    window.scrollY = 350;
    article.scroll.locations.length = 0;
    calls.resumeSave.length = 0;

    await openSupplementOne(article.user);
    await waitFor(() =>
      expect(article.scroll.locations).toContainEqual({ top: 0 }),
    );
    act(() => window.dispatchEvent(new Event("pagehide")));
    await waitFor(() =>
      expect(calls.resumeSave).toContainEqual(
        expect.objectContaining({
          componentIdentity: "supplement-one",
          scrollTop: 0,
        }),
      ),
    );
  } finally {
    article.restore();
  }
});
