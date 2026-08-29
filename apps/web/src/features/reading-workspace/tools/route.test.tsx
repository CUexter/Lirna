import { expect, test } from "bun:test";
import { waitFor, within } from "@testing-library/react";
import type { ReadingNavigationObservation } from "../navigation/observations";
import {
  renderReading,
  resetActions,
  view,
} from "../test-support/routeHarness";
import {
  articleBibliographyEntry,
  captureScrollIntoView,
  expectBibliographyRoute,
  openCitationBibliography,
  returnFromArticleBibliography,
  setupReadingUser,
} from "../test-support/routeScenarios";

test("Citation opening emits only its Bibliography lifecycle observation", async () => {
  resetActions();
  const user = setupReadingUser();
  const observations: ReadingNavigationObservation[] = [];
  const listener = (event: Event) =>
    observations.push(
      (event as CustomEvent<ReadingNavigationObservation>).detail,
    );
  window.addEventListener("lirna:reading-navigation", listener);

  try {
    await renderReading("?component=article");
    await waitFor(() =>
      expect(
        view().getByRole("button", { name: "Citation: [1] (resolved)" }),
      ).toBeTruthy(),
    );
    observations.length = 0;

    await openCitationBibliography(user);
    await waitFor(() =>
      expect(
        observations.some(({ cause }) => cause === "bibliography-opening"),
      ).toBe(true),
    );

    expect(
      observations
        .map(({ cause }) => cause)
        .filter((cause) =>
          [
            "bibliography-opening",
            "component-transition",
            "direct-reader-scroll",
            "publisher-note-navigation",
            "reference-opening",
          ].includes(cause),
        ),
    ).toEqual(["bibliography-opening"]);
  } finally {
    window.removeEventListener("lirna:reading-navigation", listener);
  }
});

test("filters publisher bibliography and preserves component search when returning from a Citation", async () => {
  resetActions();
  const user = setupReadingUser();
  const scroll = captureScrollIntoView();
  try {
    const router = await renderReading("?component=article");
    await waitFor(() =>
      expect(
        view().getByRole("button", { name: "Citation: [1] (resolved)" }),
      ).toBeTruthy(),
    );
    await openCitationBibliography(user);
    expectBibliographyRoute(router);
    expect(
      view().getByText("Ada Lovelace. Synthetic publisher entry."),
    ).toBeTruthy();
    expect(document.getElementById("article:entry-one")?.className).toContain(
      "border-primary",
    );
    expect(
      document.getElementById("article:entry-one")?.closest("details")?.open,
    ).toBe(true);
    await user.type(view().getByLabelText("Search bibliography"), "hopper");
    expect(
      view().queryByText("Ada Lovelace. Synthetic publisher entry."),
    ).toBeNull();
    expect(
      view().getByText("Grace Hopper. Another publisher entry."),
    ).toBeTruthy();
    const search = view().getByLabelText("Search bibliography");
    await user.click(search);
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    await waitFor(() =>
      expect(
        view().getByText("Ada Lovelace. Synthetic publisher entry."),
      ).toBeTruthy(),
    );
    expect(
      view().getByText(
        "Synthetic publication content [note 1][note 4][note 7][proposition 1][1]",
      ),
    ).toBeTruthy();
    expect(articleBibliographyEntry()).toBeTruthy();
    await returnFromArticleBibliography(user);
    expect(
      view().getByRole("complementary", { name: "Reading tools" }),
    ).toBeTruthy();
    expect(router.state.location.search).toEqual({
      component: "article",
    });
    expect(scroll.target).toBe("citation-one");
  } finally {
    scroll.restore();
  }
});

test("opens publisher notes beside the article and follows their backlinks", async () => {
  resetActions();
  const user = setupReadingUser();
  const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
  let scrolledTo: string | undefined;
  let scrollBlock: ScrollLogicalPosition | undefined;
  HTMLElement.prototype.scrollIntoView = function (options) {
    scrolledTo = this.id;
    scrollBlock = typeof options === "object" ? options.block : undefined;
    if (this.closest('[aria-label="Reading tools"]')) window.scrollTo(0, 0);
  };
  try {
    const router = await renderReading("?component=article");
    await waitFor(() => view().getByText("[note 1]"));
    await user.click(view().getByText("[proposition 1]"));
    await waitFor(() => expect(scrolledTo).toBe("proposition-1"));
    expect(scrollBlock).toBe("center");
    const highlightedTarget =
      document.getElementById("proposition-1")?.parentElement;
    expect(
      highlightedTarget?.classList.contains("authored-target-highlight"),
    ).toBe(true);
    highlightedTarget?.dispatchEvent(new Event("animationend"));
    expect(
      highlightedTarget?.classList.contains("authored-target-highlight"),
    ).toBe(false);
    window.scrollTo(0, 640);
    await user.click(view().getByText("[note 1]"));
    const notes = await waitFor(() =>
      view().getByRole("complementary", { name: "Reading tools" }),
    );
    expect(notes.textContent).toContain("Publisher-authored note.");
    expect(document.querySelectorAll("article")).toHaveLength(2);
    expect(
      notes
        .querySelector("[data-reading-scroll-owner]")
        ?.getAttribute("data-reading-scroll-owner"),
    ).toBe("publisher-note");
    expect(window.scrollY).toBe(640);
    expect(router.state.location.search).toEqual({ component: "article" });
    await user.click(view().getByText("[note 4]"));
    await waitFor(() => expect(document.getElementById("4")).toBeTruthy());
    await waitFor(() =>
      expect(
        document
          .getElementById("4")
          ?.parentElement?.classList.contains("authored-target-highlight"),
      ).toBe(true),
    );
    await user.click(view().getByText("[note 7]"));
    await waitFor(() => expect(document.getElementById("7")).toBeTruthy());
    await user.click(view().getByText("[note 4]"));
    await waitFor(() => expect(document.getElementById("4")).toBeTruthy());
    await user.click(
      within(notes).getByRole("button", {
        name: "Citation: [1] (resolved)",
      }),
    );
    await waitFor(() => view().getByRole("region", { name: "Bibliography" }));
    expect(router.state.location.search).toEqual({
      component: "article",
      view: "bibliography",
      citation: "entry-one",
    });
    await user.click(view().getByText("[note 1]"));
    await waitFor(() =>
      expect(router.state.location.search).toEqual({ component: "article" }),
    );
    const reopenedNotes = await waitFor(() =>
      view().getByRole("complementary", { name: "Reading tools" }),
    );
    await user.click(within(reopenedNotes).getByText("1."));
    expect(
      view().getByRole("complementary", { name: "Reading tools" }),
    ).toBeTruthy();
    expect(scrolledTo).toBe("note-1");
    expect(router.state.location.search).toEqual({ component: "article" });
  } finally {
    HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  }
});

test("presents a publisher-note deep link inside Reading tools", async () => {
  resetActions();

  const router = await renderReading("?component=notes");

  await waitFor(() => view().getByText("A synthetic Source state passage."));
  const tools = view().getByRole("complementary", { name: "Reading tools" });
  expect(within(tools).getByText("Publisher-authored note.")).toBeTruthy();
  expect(document.querySelectorAll("article")).toHaveLength(2);
  expect(
    tools
      .querySelector("[data-reading-scroll-owner]")
      ?.getAttribute("data-reading-scroll-owner"),
  ).toBe("publisher-note");
  expect(router.state.location.search).toEqual({ component: "notes" });
});
