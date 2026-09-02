import { afterEach, expect, test } from "bun:test";
import { act, cleanup, render, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ResearchAssistantTranscript } from "./ResearchAssistantTranscript";

afterEach(cleanup);

test("renders a live evidence alias as an inline citation", async () => {
  const user = userEvent.setup();
  let shown = false;
  render(
    <ResearchAssistantTranscript
      messages={[
        {
          id: "assistant-message",
          role: "assistant",
          parts: [
            {
              type: "tool-referencePassage",
              toolCallId: "reference-call",
              state: "output-available",
              input: {
                componentIdentity: "article",
                exactText: "Verified evidence.",
                occurrence: 1,
              },
              output: {
                kind: "source-passage-reference",
                id: "10000000-0000-4000-8000-000000000000",
                evidenceAlias: "ev_1",
                componentIdentity: "article",
                componentLabel: "Article",
                selection: {
                  offsetBasis: "normalized-derivative-text-v1",
                  normalizedStartOffset: 0,
                  normalizedEndOffset: 18,
                  exactText: "Verified evidence.",
                  prefix: "",
                  suffix: "",
                },
              },
            },
            { type: "step-start" },
            { type: "text", text: "This claim is grounded.[^ev_1]" },
          ],
        },
      ]}
      passageForReference={(reference) => ({
        show: () => {
          shown = true;
        },
        text: reference.selection.exactText,
      })}
      passageForSelection={(selection) => ({
        show: () => {},
        text: selection.exactText,
      })}
      pending={false}
    />,
  );

  expect(view().getByText("This claim is grounded.")).toBeTruthy();
  const citation = view().getByRole("button", {
    name: "Citation 1: Supporting evidence from Article",
  });
  act(() => citation.focus());
  await waitFor(() =>
    expect(view().getByText("Verified evidence.")).toBeTruthy(),
  );
  await user.keyboard("{Escape}");
  await waitFor(() => expect(document.activeElement).toBe(citation));
  act(() => {
    citation.blur();
    citation.focus();
  });
  await waitFor(() =>
    expect(view().getByText("Verified evidence.")).toBeTruthy(),
  );
  await user.keyboard("{Enter}");
  expect(shown).toBe(true);
});

test("renders a persisted quote occurrence from exact verified text", () => {
  const occurrenceId = "20000000-0000-4000-8000-000000000000";
  render(
    <ResearchAssistantTranscript
      messages={[
        {
          id: "assistant-message",
          role: "assistant",
          metadata: {
            references: [
              {
                id: "10000000-0000-4000-8000-000000000000",
                componentIdentity: "article",
                componentLabel: "Article",
                occurrences: [
                  {
                    answerTarget: { startOffset: 0, endOffset: 50 },
                    id: occurrenceId,
                    presentation: "quote",
                    relation: "supports",
                    referenceId: "10000000-0000-4000-8000-000000000000",
                  },
                ],
                selection: {
                  offsetBasis: "normalized-derivative-text-v1",
                  normalizedStartOffset: 0,
                  normalizedEndOffset: 18,
                  exactText: "Verified evidence.",
                  prefix: "",
                  suffix: "",
                },
              },
            ],
          },
          parts: [
            {
              type: "text",
              text: `:::quote[${occurrenceId}]\n:::`,
            },
          ],
        },
      ]}
      passageForReference={(reference) => ({
        show: () => {},
        text: reference.selection.exactText,
      })}
      passageForSelection={(selection) => ({
        show: () => {},
        text: selection.exactText,
      })}
      pending={false}
    />,
  );

  expect(view().getByText("Verified evidence.")).toBeTruthy();
  expect(
    view().getByRole("button", {
      name: "Citation 1: Supporting evidence from Article",
    }),
  ).toBeTruthy();
  expect(view().queryByText(`:::quote[${occurrenceId}]`)).toBeNull();
});

test("keeps aliases for duplicate verified passages independently resolvable", () => {
  render(
    <ResearchAssistantTranscript
      messages={[
        {
          id: "assistant-message",
          role: "assistant",
          parts: [
            referenceToolPart(
              "first-reference",
              "ev_1",
              "10000000-0000-4000-8000-000000000000",
            ),
            referenceToolPart(
              "second-reference",
              "ev_2",
              "20000000-0000-4000-8000-000000000000",
            ),
            { type: "step-start" },
            { type: "text", text: "The second verification applies.[^ev_2]" },
          ],
        },
      ]}
      passageForReference={(reference) => ({
        show: () => {},
        text: reference.selection.exactText,
      })}
      passageForSelection={(selection) => ({
        show: () => {},
        text: selection.exactText,
      })}
      pending={false}
    />,
  );

  expect(
    view().getByRole("button", {
      name: "Citation 2: Supporting evidence from Article",
    }),
  ).toBeTruthy();
});

function referenceToolPart(
  toolCallId: string,
  evidenceAlias: string,
  id: string,
) {
  return {
    type: "tool-referencePassage" as const,
    toolCallId,
    state: "output-available" as const,
    input: {
      componentIdentity: "article",
      exactText: "Verified evidence.",
      occurrence: 1,
    },
    output: {
      kind: "source-passage-reference",
      id,
      evidenceAlias,
      componentIdentity: "article",
      componentLabel: "Article",
      selection: {
        offsetBasis: "normalized-derivative-text-v1" as const,
        normalizedStartOffset: 0,
        normalizedEndOffset: 18,
        exactText: "Verified evidence.",
        prefix: "",
        suffix: "",
      },
    },
  };
}

function view() {
  return within(document.body);
}
