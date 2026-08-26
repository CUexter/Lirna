import { expect, test } from "bun:test";
import { waitFor, within } from "@testing-library/react";
import {
  readingRouteState,
  renderReading,
  resetActions,
  view,
} from "./reading-route-test-harness";
import {
  captureScrollIntoView,
  openSupplementOne,
  setupReadingUser,
} from "./reading-route-test-scenarios";
import { readingFixture, sourceId, stateId } from "./reading-test-fixtures";

test("returns from a bibliography mention in another Source component", async () => {
  resetActions();
  const scroll = captureScrollIntoView();
  try {
    const user = setupReadingUser();
    const router = await renderReading("?component=article");
    await waitFor(() => view().getByText("A synthetic Source state passage."));

    await user.click(view().getByRole("tab", { name: "Bibliography" }));
    const entry = view()
      .getByText("Supplement bibliography entry.")
      .closest("li");
    expect(entry).not.toBeNull();
    await user.click(
      within(entry as HTMLElement).getByRole("button", {
        name: "Show in article",
      }),
    );

    await waitFor(() =>
      expect(router.state.location.search).toEqual({
        component: "supplement-one",
      }),
    );
    await waitFor(() => expect(scroll.target).toBe("supplement-citation-one"));
    expect(
      document
        .getElementById("supplement-citation-one")
        ?.classList.contains("authored-target-highlight"),
    ).toBe(true);
  } finally {
    scroll.restore();
  }
});

test("opens an existing note from the Reading tools panel", async () => {
  resetActions();
  const firstAnnotation = {
    id: "annotation-1",
    sourceId,
    sourceStateId: stateId,
    componentIdentity: "article",
    kind: "note",
    publisherAnchor: null,
    offsetBasis: "normalized-derivative-text-v1",
    normalizedStartOffset: 2,
    normalizedEndOffset: 11,
    exactText: "synthetic",
    prefix: "A ",
    suffix: " Source state passage.",
    color: "yellow",
    body: "A durable note.",
    createdAt: "2026-08-20T00:00:00.000Z",
    updatedAt: "2026-08-20T00:00:00.000Z",
  };
  readingRouteState.annotations = [
    firstAnnotation,
    {
      ...firstAnnotation,
      id: "annotation-2",
      body: "A second durable note.",
    },
  ];
  const user = setupReadingUser();
  await renderReading();
  await waitFor(() => view().getByText("A synthetic Source state passage."));

  await user.click(view().getByRole("tab", { name: "Notes" }));
  await user.click(view().getByRole("button", { name: /A durable note/ }));

  await waitFor(() =>
    expect(
      view().getByRole("complementary", { name: "Edit annotation" }),
    ).toBeTruthy(),
  );
  expect(
    (view().getByLabelText("Annotation note") as HTMLTextAreaElement).value,
  ).toBe("A durable note.");

  await user.click(
    view().getByRole("button", { name: /A second durable note/ }),
  );
  await waitFor(() =>
    expect(
      (view().getByLabelText("Annotation note") as HTMLTextAreaElement).value,
    ).toBe("A second durable note."),
  );
});

test("shows an unavailable component instead of substituting the article", async () => {
  resetActions();
  const user = setupReadingUser();
  const router = await renderReading("?component=missing-supplement");
  await waitFor(() =>
    expect(
      view().getByRole("heading", { name: "Component unavailable" }),
    ).toBeTruthy(),
  );
  expect(view().getByText("missing-supplement")).toBeTruthy();
  expect(view().queryByText("A synthetic Source state passage.")).toBeNull();

  await user.click(view().getByRole("button", { name: "Open main article" }));
  await waitFor(() => view().getByText("A synthetic Source state passage."));
  expect(router.state.location.search).toEqual({ component: "article" });
});

test("scrolls automatic section references and opens numbered references", async () => {
  resetActions();
  const user = setupReadingUser();
  const scroll = captureScrollIntoView();
  try {
    await renderReading("?component=article");
    await waitFor(() =>
      expect(view().getByRole("button", { name: "Reference §2" })).toBeTruthy(),
    );

    await user.click(view().getByRole("button", { name: "Reference §2" }));
    expect(scroll.target).toBe("referenced-claim");
    expect(view().queryByText("Reference context")).toBeNull();

    await user.click(view().getByRole("button", { name: "Reference §2.1" }));
    expect(scroll.target).toBe("nested-claim");
    await user.click(view().getByRole("button", { name: "Reference §2.1.1" }));
    expect(scroll.target).toBe("deeply-nested-claim");

    await user.click(view().getByRole("button", { name: "Reference (1)" }));
    const numberedTool = view().getByRole("complementary", {
      name: "Reading tools",
    });
    expect(
      within(numberedTool).getByText("Numbered statement (1)"),
    ).toBeTruthy();
    await user.click(
      within(numberedTool).getByRole("button", { name: "Show in article" }),
    );
    expect(scroll.target).toBe("reading-reference-number-1");
  } finally {
    scroll.restore();
  }
});

test("previews authored fragment references before scrolling to them", async () => {
  resetActions();
  const user = setupReadingUser();
  const scroll = captureScrollIntoView();
  try {
    await renderReading("?component=article");

    await user.click(await view().findByRole("link", { name: "Poss" }));
    const referenceTool = view().getByRole("complementary", {
      name: "Reading tools",
    });
    expect(within(referenceTool).getByText("Poss")).toBeTruthy();
    expect(referenceTool.textContent).toContain(
      "Synthetic publication content",
    );
    expect(scroll.target).toBeUndefined();

    await user.click(view().getByRole("link", { name: "Ness" }));
    expect(within(referenceTool).getByText("Ness")).toBeTruthy();
    expect(scroll.target).toBeUndefined();

    await user.click(
      within(referenceTool).getByRole("button", { name: "Show in article" }),
    );
    expect(scroll.target).toBe("Ness");
  } finally {
    scroll.restore();
  }
});

test("clears component-local fragments when switching components", async () => {
  resetActions();
  const user = setupReadingUser();
  const scroll = captureScrollIntoView();
  const router = await renderReading("?component=article#Poss");
  await waitFor(() => view().getByText("A synthetic Source state passage."));
  expect(scroll.target).toBe("Poss");
  expect(router.state.location.hash).toBe("Poss");
  scroll.restore();

  await openSupplementOne(user);
  expect(router.state.location.hash).toBe("");
});

test("keeps the selected Source component when following its contents", async () => {
  resetActions();
  const reading = readingFixture();
  const supplement = reading.components.find(
    (component) => component.identity === "supplement-one",
  );
  if (!supplement) throw new Error("Supplement fixture missing");
  supplement.toc = [
    { id: "supplement-section", title: "Supplement section", children: [] },
  ];
  supplement.sections = [
    {
      id: "supplement-section",
      title: [{ kind: "text", text: "Supplement section" }],
      level: 2,
      blocks: [],
      children: [],
    },
  ];
  readingRouteState.getReading = async () => reading;
  const user = setupReadingUser();
  const router = await renderReading();
  await waitFor(() => view().getByText("A synthetic Source state passage."));

  await openSupplementOne(user);
  await user.click(view().getByRole("tab", { name: "Contents" }));
  await user.click(view().getByRole("link", { name: "Supplement section" }));

  await waitFor(() =>
    expect(router.state.location.search).toEqual({
      component: "supplement-one",
    }),
  );
  expect(router.state.location.hash).toBe("supplement-section");
  expect(view().getByText("First supplement content.")).toBeTruthy();
});

test("moves between adjacent Source components and returns through its breadcrumb", async () => {
  resetActions();
  const user = setupReadingUser();
  const router = await renderReading();
  await waitFor(() => view().getByText("A synthetic Source state passage."));

  await openSupplementOne(user);
  expect(router.state.location.search).toEqual({ component: "supplement-one" });
  await user.click(
    view().getByRole("button", { name: "Next: Supplement two" }),
  );
  await waitFor(() => view().getByText("Second supplement content."));
  await user.click(
    view().getByRole("button", { name: "Previous: Supplement one" }),
  );
  await waitFor(() => view().getByText("First supplement content."));
  await user.click(
    view().getByRole("button", { name: "Synthetic Reading Source" }),
  );
  await waitFor(() => view().getByText("A synthetic Source state passage."));
  expect(router.state.location.search).toEqual({ component: "article" });
});
