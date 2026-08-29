import { expect } from "bun:test";
import { act, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { renderReading, resetActions, view } from "./routeHarness";

export type ReadingUser = ReturnType<typeof userEvent.setup>;

export function setupReadingUser() {
  return userEvent.setup();
}

export async function openSupplementOne(user: ReadingUser) {
  await user.click(view().getByRole("tab", { name: "Supplementary" }));
  await user.click(view().getByRole("button", { name: "Supplement one" }));
  await waitFor(() => view().getByText("First supplement content."));
}

export async function openPublisherNote(user: ReadingUser) {
  await user.click(await view().findByText("[note 1]"));
  await view().findByText("Publisher-authored note.");
  return publisherNoteContainer();
}

function publisherNoteContainer() {
  const container = document.querySelector<HTMLElement>(
    '[data-reading-scroll-owner="publisher-note"]',
  );
  if (!container) throw new Error("Publisher-note scroll owner is unavailable");
  return container;
}

export function scrollPublisherNote(container: HTMLElement, scrollTop: number) {
  container.scrollTop = scrollTop;
  act(() => container.dispatchEvent(new Event("scroll")));
}

async function followPublisherNoteLink(
  user: ReadingUser,
  link: string,
  content: string,
) {
  await user.click(view().getByRole("link", { name: link }));
  await view().findByText(content);
}

export async function followPublisherNoteLinkAtPosition(
  user: ReadingUser,
  container: HTMLElement,
  destination: { link: string; content: string; scrollTop: number },
) {
  await followPublisherNoteLink(user, destination.link, destination.content);
  await waitFor(() => expect(container.scrollTop).toBe(destination.scrollTop));
}

export async function openCitationBibliography(user: ReadingUser) {
  await user.click(
    await view().findByRole("button", { name: "Citation: [1] (resolved)" }),
  );
  await waitFor(() => view().getByRole("region", { name: "Bibliography" }));
}

export function articleBibliographyEntry() {
  const entry = document.getElementById("article:entry-one");
  if (!entry) throw new Error("Article bibliography entry is unavailable");
  return entry;
}

export async function returnFromArticleBibliography(user: ReadingUser) {
  const entry = articleBibliographyEntry();
  await user.click(
    within(entry).getAllByRole("button", { name: "Show in article" }).at(0) as
      | HTMLElement
      | SVGElement,
  );
}

type ReadingRouter = Awaited<ReturnType<typeof renderReading>>;

export function expectBibliographyRoute(router: ReadingRouter) {
  expect(router.state.location.search).toEqual({
    component: "article",
    view: "bibliography",
    citation: "entry-one",
  });
}

export async function expectArticleContents(router: ReadingRouter) {
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ component: "article" }),
  );
}

export function captureScrollIntoView() {
  const original = HTMLElement.prototype.scrollIntoView;
  const capture: {
    block?: ScrollLogicalPosition;
    target?: string;
    restore: () => void;
  } = {
    restore: () => {
      HTMLElement.prototype.scrollIntoView = original;
    },
  };
  HTMLElement.prototype.scrollIntoView = function (options) {
    capture.target = this.id;
    capture.block = typeof options === "object" ? options.block : undefined;
  };
  return capture;
}

export function captureWindowScrollTo(updateScrollY = false) {
  const original = window.scrollTo;
  const locations: ScrollToOptions[] = [];
  window.scrollTo = (options) => {
    if (typeof options !== "object") return;
    locations.push(options);
    if (updateScrollY) window.scrollY = options.top ?? window.scrollY;
  };
  return {
    locations,
    restore: () => {
      window.scrollTo = original;
    },
  };
}

export function setWindowScrollY(value: number) {
  const descriptor = Object.getOwnPropertyDescriptor(window, "scrollY");
  Object.defineProperty(window, "scrollY", {
    configurable: true,
    value,
    writable: true,
  });
  return () => {
    if (descriptor) Object.defineProperty(window, "scrollY", descriptor);
    else delete (window as { scrollY?: number }).scrollY;
  };
}

export async function setupArticleScroll() {
  resetActions();
  const scroll = captureWindowScrollTo(true);
  const restoreScrollY = setWindowScrollY(0);
  const user = setupReadingUser();
  await renderReading();
  await waitFor(() => view().getByText("A synthetic Source state passage."));
  return {
    scroll,
    user,
    restore: () => {
      scroll.restore();
      restoreScrollY();
    },
  };
}
