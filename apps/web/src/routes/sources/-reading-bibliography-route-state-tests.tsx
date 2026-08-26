import { expect, test } from "bun:test";
import { act, fireEvent, waitFor } from "@testing-library/react";
import { renderReading, view } from "./-reading-route-test-harness";
import {
  captureScrollIntoView,
  expectArticleContents,
  expectBibliographyRoute,
  returnFromArticleBibliography,
  setupReadingUser,
} from "./-reading-route-test-scenarios";

test("restores bibliography and Citation context from route search", async () => {
  const scroll = captureScrollIntoView();
  try {
    const user = setupReadingUser();
    const router = await renderReading(
      "?component=article&view=bibliography&citation=entry-one",
    );
    await waitFor(() => view().getByRole("region", { name: "Bibliography" }));
    expectBibliographyRoute(router);
    expect(
      view().getByText("Ada Lovelace. Synthetic publisher entry."),
    ).toBeTruthy();

    expect(
      view().getByText(
        "Synthetic publication content [note 1][note 4][note 7][proposition 1][1]",
      ),
    ).toBeTruthy();
    expect(document.getElementById("article:entry-one")).not.toBeNull();
    await returnFromArticleBibliography(user);
    expect(router.state.location.search).toEqual({
      component: "article",
    });
    expect(
      view().getByRole("complementary", { name: "Reading tools" }),
    ).toBeTruthy();
    expect(scroll.target).toBe("citation-one");
    expect(
      document
        .getElementById("citation-one")
        ?.classList.contains("authored-target-highlight"),
    ).toBe(true);
  } finally {
    scroll.restore();
  }
});

test("opens and focuses a Citation on the first click", async () => {
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
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
    HTMLElement.prototype.scrollTo = originalScrollTo;
    window.scrollTo = originalWindowScrollTo;
  }
});

test("keeps the Reading tools panel persistent and changes views with tabs", async () => {
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  HTMLElement.prototype.scrollIntoView = () => undefined;
  try {
    const router = await renderReading(
      "?component=article&view=bibliography&citation=entry-one",
    );
    await view().findByRole("complementary", {
      name: "Reading tools",
    });
    expect(view().getByText("A synthetic Source state passage.")).toBeTruthy();

    const panel = view().getByRole("complementary", { name: "Reading tools" });
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(view().getByRole("complementary", { name: "Reading tools" })).toBe(
      panel,
    );
    expectBibliographyRoute(router);

    fireEvent.click(view().getByRole("tab", { name: "Contents" }));
    await expectArticleContents(router);
    expect(
      view().getByRole("complementary", { name: "Reading tools" }),
    ).toBeTruthy();
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});
