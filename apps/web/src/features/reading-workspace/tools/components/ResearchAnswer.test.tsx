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
              type: "tool-admitEvidence",
              toolCallId: "admit-call",
              state: "output-available",
              input: {
                candidateHandle:
                  "candidate_10000000-0000-4000-8000-000000000000",
                purpose: "Ground the claim",
              },
              output: {
                kind: "source-passage-reference",
                outcome: "admitted",
                candidateCount: 1,
                id: "10000000-0000-4000-8000-000000000000",
                evidenceAlias: "ev_1",
                componentIdentity: "article",
                componentLabel: "Article",
                passage: "Verified evidence.",
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

test("shows persisted claim text beside exact evidence without claiming entailment", async () => {
  const user = userEvent.setup();
  const occurrenceId = "20000000-0000-4000-8000-000000000000";
  const answer = `This claim is grounded.[^${occurrenceId}]`;
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
                    answerTarget: { startOffset: 0, endOffset: 23 },
                    id: occurrenceId,
                    presentation: "passing",
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
          parts: [{ type: "text", text: answer }],
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

  await user.click(
    view().getByRole("button", {
      name: "Citation 1: Supporting evidence from Article",
    }),
  );

  expect(view().getAllByText("This claim is grounded.")).toHaveLength(2);
  expect(view().getByText("Verified evidence.")).toBeTruthy();
  expect(
    view().getByText(
      "This evidence relation is structural, not proof of semantic entailment.",
    ),
  ).toBeTruthy();
});

test("keeps aliases for duplicate verified passages independently resolvable", () => {
  render(
    <ResearchAssistantTranscript
      messages={[
        {
          id: "assistant-message",
          role: "assistant",
          parts: [
            admittedEvidenceToolPart(
              "first-reference",
              "ev_1",
              "10000000-0000-4000-8000-000000000000",
            ),
            admittedEvidenceToolPart(
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

test("groups adjacent evidence markers for one claim into one citation carousel", async () => {
  const user = userEvent.setup();
  const shown: string[] = [];
  render(
    <ResearchAssistantTranscript
      messages={[
        {
          id: "assistant-message",
          role: "assistant",
          parts: [
            admittedEvidenceToolPart(
              "first-reference",
              "ev_1",
              "10000000-0000-4000-8000-000000000000",
              "First evidence text.",
            ),
            admittedEvidenceToolPart(
              "second-reference",
              "ev_2",
              "20000000-0000-4000-8000-000000000000",
              "Second evidence text.",
            ),
            { type: "step-start" },
            {
              type: "text",
              text: "One claim has two sources.[^ev_1][^ev_2|qualifies]",
            },
          ],
        },
      ]}
      passageForReference={(reference) => ({
        show: () => {
          shown.push(reference.selection.exactText);
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

  const citation = view().getByRole("button", {
    name: /Citations 1, 2:/,
  });
  expect(view().queryByRole("button", { name: /^Citation 1:/ })).toBeNull();
  expect(view().queryByRole("button", { name: /^Citation 2:/ })).toBeNull();

  act(() => citation.focus());
  await waitFor(() =>
    expect(view().getByRole("button", { name: "Next" })).toBeTruthy(),
  );

  await user.click(
    view().getByRole("button", { name: "Show citation 2 in article" }),
  );
  expect(shown).toEqual(["Second evidence text."]);

  await user.click(citation);
  expect(shown).toEqual(["Second evidence text.", "First evidence text."]);
});

test("renders a Markdown table in an assistant message", () => {
  render(
    <ResearchAssistantTranscript
      messages={[
        {
          id: "assistant-message",
          role: "assistant",
          parts: [
            {
              type: "text",
              text: [
                "| Finding | Detailed explanation |",
                "| --- | --- |",
                "| Result | A deliberately long value that requires horizontal scrolling |",
              ].join("\n"),
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

  const table = view().getByRole("table");

  expect(table.parentElement?.classList.contains("overflow-x-auto")).toBe(true);
  expect(table.parentElement?.style.maxHeight).toBe("");
  expect(view().getByRole("columnheader", { name: "Finding" })).toBeTruthy();
  expect(view().getByRole("cell", { name: "Result" })).toBeTruthy();
});

function admittedEvidenceToolPart(
  toolCallId: string,
  evidenceAlias: string,
  id: string,
  exactText = "Verified evidence.",
) {
  return {
    type: "tool-admitEvidence" as const,
    toolCallId,
    state: "output-available" as const,
    input: {
      candidateHandle: `candidate_${id}`,
      purpose: "Ground the claim",
    },
    output: {
      kind: "source-passage-reference",
      outcome: "admitted",
      candidateCount: 1,
      id,
      evidenceAlias,
      componentIdentity: "article",
      componentLabel: "Article",
      passage: exactText,
      selection: {
        offsetBasis: "normalized-derivative-text-v1" as const,
        normalizedStartOffset: 0,
        normalizedEndOffset: 18,
        exactText,
        prefix: "",
        suffix: "",
      },
    },
  };
}

function view() {
  return within(document.body);
}
