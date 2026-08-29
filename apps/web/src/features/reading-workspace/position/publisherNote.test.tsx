import { expect, test } from "bun:test";
import { act, waitFor } from "@testing-library/react";
import { sourceId, stateId } from "../test-support/fixtures";
import { readingWithTwoPublisherNotes } from "../test-support/publisherNote";
import {
  calls,
  readingPositionState,
  renderReading,
  resetActions,
  view,
} from "../test-support/routeHarness";
import {
  followPublisherNoteLinkAtPosition,
  openPublisherNote,
  scrollPublisherNote,
  setupReadingUser,
} from "../test-support/routeScenarios";

test("persists publisher-note semantics with its tools-container pixels", async () => {
  resetActions();
  const user = setupReadingUser();
  await renderReading();
  await waitFor(() => view().getByText("[note 1]"));

  const container = await openPublisherNote(user);
  scrollPublisherNote(container, 360);

  await waitFor(
    () =>
      expect(calls.resumeSave).toContainEqual(
        expect.objectContaining({
          componentIdentity: "notes",
          scrollTop: 360,
          semanticLocation: expect.objectContaining({
            source: { sourceId, stateId },
            scene: {
              identity: "notes",
              componentIdentity: "notes",
              owner: "publisher-note",
            },
            fallback: expect.objectContaining({
              scrollTop: 360,
              textExcerpt: expect.stringContaining("publisher-authored note"),
            }),
          }),
        }),
      ),
    { timeout: 2_000 },
  );
});

test("restores publisher-note progress after explicit note navigation yields", async () => {
  resetActions();
  readingPositionState.getResume = async (input) => {
    calls.resumeGet.push(input);
    if ((input as { componentIdentity?: string }).componentIdentity !== "notes")
      return null;
    return {
      sourceId,
      stateId,
      sourceTitle: "Synthetic Reading Source",
      componentIdentity: "notes",
      componentLabel: "Notes",
      scrollTop: 720,
      semanticLocation: {
        version: 1,
        source: { sourceId, stateId },
        scene: {
          identity: "notes",
          componentIdentity: "notes",
          owner: "publisher-note",
        },
        block: {
          identity: "scene:9bdbf349f9e2b1e9",
          strategy: "scene-fallback",
        },
        progress: 0,
        fallback: {
          scrollTop: 720,
          blockIndex: 0,
          blockTag: "scene",
          textExcerpt: "",
          authoredAnchor: null,
        },
      },
      savedAt: "2026-08-20T01:00:00.000Z",
    };
  };

  const user = setupReadingUser();
  await renderReading();
  const container = await openPublisherNote(user);

  expect(container.scrollTop).toBe(0);
  await user.click(view().getByRole("tab", { name: "Contents" }));
  await user.click(view().getByRole("tab", { name: "Supplementary" }));
  await waitFor(() => expect(container.scrollTop).toBe(720));
  expect(calls.resumeGet).toContainEqual({
    sourceId,
    stateId,
    componentIdentity: "notes",
  });
});

test("does not overwrite pending publisher-note progress before reader movement", async () => {
  resetActions();
  readingPositionState.getResume = async (input) => {
    calls.resumeGet.push(input);
    if ((input as { componentIdentity?: string }).componentIdentity === "notes")
      return new Promise(() => undefined);
    return null;
  };

  const user = setupReadingUser();
  await renderReading();
  await openPublisherNote(user);
  act(() => window.dispatchEvent(new Event("pagehide")));
  await act(
    async () =>
      new Promise((resolve) => {
        setTimeout(resolve, 20);
      }),
  );

  expect(
    calls.resumeSave.some(
      (input) =>
        (input as { componentIdentity?: string }).componentIdentity === "notes",
    ),
  ).toBe(false);
});

test("keeps independent progress while switching publisher-note scenes", async () => {
  resetActions();
  readingPositionState.getReading = async () => readingWithTwoPublisherNotes();
  const user = setupReadingUser();
  await renderReading();
  const container = await openPublisherNote(user);

  scrollPublisherNote(container, 310);
  await user.click(view().getByRole("tab", { name: "Contents" }));
  scrollPublisherNote(container, 150);
  await user.click(view().getByRole("tab", { name: "Supplementary" }));
  await waitFor(() => expect(container.scrollTop).toBe(310));

  await followPublisherNoteLinkAtPosition(user, container, {
    link: "Second publisher note",
    content: "Second publisher-note scene.",
    scrollTop: 0,
  });

  scrollPublisherNote(container, 620);
  await followPublisherNoteLinkAtPosition(user, container, {
    link: "First publisher note",
    content: "Publisher-authored note.",
    scrollTop: 310,
  });

  await followPublisherNoteLinkAtPosition(user, container, {
    link: "Second publisher note",
    content: "Second publisher-note scene.",
    scrollTop: 620,
  });
});
