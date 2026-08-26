import { expect, test } from "bun:test";
import { act, waitFor } from "@testing-library/react";
import {
  renderReading,
  resetActions,
  view,
} from "./reading-route-test-harness";
import {
  expectArticleContents,
  setupReadingUser,
} from "./reading-route-test-scenarios";

test("focuses a Citation inside the persistent Reading tools panel", async () => {
  resetActions();
  const user = setupReadingUser();
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  const originalScrollTo = HTMLElement.prototype.scrollTo;
  const originalWindowScrollTo = window.scrollTo;
  let browserScrollRequests = 0;
  let articleScrollRequests = 0;
  let panelScrollRequests = 0;
  let pageScrollRequests = 0;
  HTMLElement.prototype.scrollIntoView = function () {
    if (this.closest('[aria-label="Reading tools"]'))
      browserScrollRequests += 1;
    else articleScrollRequests += 1;
  };
  HTMLElement.prototype.scrollTo = function () {
    if (this.closest('[aria-label="Reading tools"]')) panelScrollRequests += 1;
  };
  try {
    const router = await renderReading("?component=article");
    const citation = await view().findByRole("button", {
      name: "Citation: [1] (resolved)",
    });
    const panel = view().getByRole("complementary", { name: "Reading tools" });
    expect(
      view()
        .getByRole("tab", { name: "Contents" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    window.scrollTo = () => {
      pageScrollRequests += 1;
    };

    await user.click(citation);
    const articleEntry = document.getElementById("article:entry-one");
    expect(articleEntry).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(articleEntry));
    expect(
      view()
        .getByRole("tab", { name: "Bibliography" })
        .getAttribute("aria-selected"),
    ).toBe("true");
    expect(browserScrollRequests).toBe(0);
    expect(panelScrollRequests).toBeGreaterThan(0);
    expect(pageScrollRequests).toBe(0);

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(view().getByRole("complementary", { name: "Reading tools" })).toBe(
      panel,
    );

    const previousPanelScrollRequests = panelScrollRequests;
    const bibliography = view().getByRole("region", { name: "Bibliography" });
    if (!(bibliography.parentElement instanceof HTMLElement))
      throw new Error("Missing Bibliography scroll container");
    bibliography.parentElement.scrollTop = 500;
    await user.click(citation);
    await waitFor(() => {
      expect(panelScrollRequests).toBeGreaterThan(previousPanelScrollRequests);
      expect(document.activeElement).toBe(articleEntry);
    });
    expect(browserScrollRequests).toBe(0);

    articleScrollRequests = 0;
    await user.click(view().getByRole("tab", { name: "Contents" }));
    await expectArticleContents(router);
    expect(articleScrollRequests).toBe(0);
    expect(view().getByRole("complementary", { name: "Reading tools" })).toBe(
      panel,
    );
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    HTMLElement.prototype.scrollTo = originalScrollTo;
    window.scrollTo = originalWindowScrollTo;
  }
});
