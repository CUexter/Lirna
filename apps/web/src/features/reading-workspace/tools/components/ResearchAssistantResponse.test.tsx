import { afterEach, expect, test } from "bun:test";
import type {
  EvidenceResolutionResult,
  UnresolvedEvidenceResolution,
} from "@lirna/api/client";
import { cleanup, render } from "@testing-library/react";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";
import { ResearchAssistantResponse } from "./ResearchAssistantResponse";

afterEach(cleanup);

test("presents every evidence outcome as a research status instead of Completed", () => {
  render(
    <ResearchAssistantResponse
      message={message([
        foundOutput(),
        outcomeOutput({
          kind: "evidence-resolution",
          outcome: "none",
          reasonCode: "no-matching-passage",
          componentScope: ["active:/"],
          candidateCount: 0,
        }),
        outcomeOutput({
          kind: "evidence-resolution",
          outcome: "ambiguous",
          reasonCode: "multiple-matching-passages",
          componentScope: ["active:/"],
          candidateCount: 2,
        }),
        outcomeOutput({
          kind: "evidence-resolution",
          outcome: "stale",
          reasonCode: "derivative-changed",
          componentScope: ["active:/"],
        }),
        outcomeOutput({
          kind: "evidence-resolution",
          outcome: "refused",
          reasonCode: "scope-denied",
          componentScope: ["active:/"],
        }),
        outcomeOutput({
          kind: "evidence-resolution",
          outcome: "budget-exhausted",
          reasonCode: "admission-budget-exhausted",
          componentScope: ["active:/"],
        }),
      ])}
      passageForReference={(reference) => ({
        show() {},
        text: reference.selection.exactText,
      })}
    />,
  );

  expect(document.body.textContent).toContain("Verified passage");
  expect(document.body.textContent).toContain("No relevant passage found");
  expect(document.body.textContent).toContain("Several passages may apply");
  expect(document.body.textContent).toContain("Source representation changed");
  expect(document.body.textContent).toContain("Evidence could not be admitted");
  expect(document.body.textContent).toContain("Evidence budget exhausted");
  expect(document.body.textContent).not.toContain("Completed");
  expect(document.body.textContent).not.toContain("Error");
});

test("keeps execution exceptions visibly distinct", () => {
  render(
    <ResearchAssistantResponse
      message={message([
        {
          type: "tool-referencePassage",
          toolCallId: "failed-call",
          state: "output-error",
          input: { componentIdentity: "active:/" },
          errorText: "Provider tool execution failed",
        },
      ])}
      passageForReference={() => ({ show() {}, text: "" })}
    />,
  );

  expect(document.body.textContent).toContain("Error");
  expect(document.body.textContent).not.toContain(
    "Evidence could not be admitted",
  );
});

function message(
  parts: ResearchAssistantMessage["parts"],
): ResearchAssistantMessage {
  return { id: "assistant-message", role: "assistant", parts };
}

function outcomeOutput(
  output: UnresolvedEvidenceResolution,
): ResearchAssistantMessage["parts"][number] {
  return {
    type: "tool-referencePassage",
    toolCallId: `${output.outcome}-call`,
    state: "output-available",
    input: { componentIdentity: "active:/" },
    output: output satisfies EvidenceResolutionResult,
  };
}

function foundOutput(): ResearchAssistantMessage["parts"][number] {
  return {
    type: "tool-referencePassage",
    toolCallId: "found-call",
    state: "output-available",
    input: { componentIdentity: "active:/" },
    output: {
      kind: "source-passage-reference",
      outcome: "found",
      candidateCount: 1,
      id: "10000000-0000-4000-8000-000000000000",
      evidenceAlias: "ev_1",
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      selection: {
        offsetBasis: "normalized-derivative-text-v1",
        normalizedStartOffset: 0,
        normalizedEndOffset: 17,
        exactText: "Verified passage.",
        prefix: "",
        suffix: "",
      },
    } satisfies EvidenceResolutionResult,
  };
}
