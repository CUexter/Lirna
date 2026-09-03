import { afterEach, expect, test } from "bun:test";
import type {
  EvidenceResolutionResult,
  UnresolvedEvidenceResolution,
} from "@lirna/api/client";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";

import type { ResearchAssistantMessage } from "../researchAssistantTransport";
import { ResearchAssistantResponse } from "./ResearchAssistantResponse";

afterEach(cleanup);

test("presents every evidence outcome as a research status instead of Completed", () => {
  render(
    <ResearchAssistantResponse
      message={message([
        foundOutput(),
        discoveryOutput({
          kind: "evidence-discovery",
          outcome: "candidates",
          componentScope: ["active:/"],
          candidateCount: 1,
          candidates: [
            {
              handle: "candidate_10000000-0000-4000-8000-000000000000",
              componentIdentity: "active:/",
              componentLabel: "Main entry",
              relevanceScore: 2,
              passage: "Candidate passage.",
              before: "",
              after: "",
            },
          ],
        }),
        outcomeOutput({
          kind: "evidence-resolution",
          outcome: "none",
          reasonCode: "no-relevant-passage",
          componentScope: ["active:/"],
          candidateCount: 0,
        }),
        discoveryOutput({
          kind: "evidence-discovery",
          outcome: "ambiguous",
          reasonCode: "equally-ranked-passages",
          componentScope: ["active:/"],
          candidateCount: 2,
          candidates: [],
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
  expect(document.body.textContent).toContain("Ground evidence");
  expect(document.body.textContent).toContain("Used 1 source");
  expect(document.body.textContent).toContain("Found candidate passages");
  expect(document.body.textContent).toContain("No relevant passage found");
  expect(document.body.textContent).toContain("Several passages may apply");
  expect(document.body.textContent).toContain("Source representation changed");
  expect(document.body.textContent).toContain(
    "Component scope was not recognized",
  );
  expect(document.body.textContent).toContain("Evidence budget exhausted");
  expect(document.body.textContent).not.toContain("Completed");
  expect(document.body.textContent).not.toContain("Error");
  expect(
    document.querySelectorAll("svg[class*='text-orange-600']"),
  ).toHaveLength(3);
});

test("keeps execution exceptions visibly distinct", () => {
  render(
    <ResearchAssistantResponse
      message={message([
        {
          type: "tool-admitEvidence",
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
    "Evidence request was refused",
  );
});

test("shows uncertainty after exhausted answer evidence repair", () => {
  render(
    <ResearchAssistantResponse
      message={message([
        invalidLedgerOutput(1),
        invalidLedgerOutput(2),
        invalidLedgerOutput(3),
        { type: "step-start" },
        {
          type: "text",
          text: "I could not complete a reliable answer because I could not validate its evidence links. No answer was saved.",
        },
      ])}
      passageForReference={() => ({ show() {}, text: "" })}
    />,
  );

  expect(
    document.body.textContent?.match(/Answer evidence needs repair/g),
  ).toHaveLength(3);
  expect(document.body.textContent).toContain(
    "I could not complete a reliable answer because I could not validate its evidence links. No answer was saved.",
  );
});

test("does not support the retired exact-text passage tool protocol", () => {
  render(
    <ResearchAssistantResponse
      message={message([
        {
          type: "tool-referencePassage",
          toolCallId: "retired-call",
          state: "output-available",
          input: {
            componentIdentity: "active:/",
            exactText: "Model-supplied passage.",
            occurrence: 1,
          },
          output: {
            kind: "source-passage-reference",
            id: "10000000-0000-4000-8000-000000000000",
            evidenceAlias: "ev_1",
            componentIdentity: "active:/",
            componentLabel: "Main entry",
            selection: {
              offsetBasis: "normalized-derivative-text-v1",
              normalizedStartOffset: 0,
              normalizedEndOffset: 23,
              exactText: "Model-supplied passage.",
              prefix: "",
              suffix: "",
            },
          },
        },
        { type: "step-start" },
        { type: "text", text: "Unsupported evidence.[^ev_1]" },
      ])}
      passageForReference={() => ({ show() {}, text: "" })}
    />,
  );

  expect(document.body.textContent).not.toContain("Used 1 source");
  expect(document.body.textContent).toContain("referencePassage");
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
    type: "tool-groundEvidence",
    toolCallId: `${output.outcome}-call`,
    state: "output-available",
    input: { componentIdentity: "active:/" },
    output: output satisfies EvidenceResolutionResult,
  };
}

function discoveryOutput(
  output: Extract<EvidenceResolutionResult, { kind: "evidence-discovery" }>,
): ResearchAssistantMessage["parts"][number] {
  return {
    type: "tool-groundEvidence",
    toolCallId: `${output.outcome}-call`,
    state: "output-available",
    input: { componentScope: ["active:/"], intent: "evidence" },
    output,
  };
}

function foundOutput(): ResearchAssistantMessage["parts"][number] {
  return {
    type: "tool-groundEvidence",
    toolCallId: "found-call",
    state: "output-available",
    input: { componentIdentity: "active:/" },
    output: {
      kind: "source-passage-reference",
      outcome: "admitted",
      candidateCount: 1,
      id: "10000000-0000-4000-8000-000000000000",
      evidenceAlias: "ev_1",
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      passage: "Verified passage.",
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

function invalidLedgerOutput(
  attempt: number,
): ResearchAssistantMessage["parts"][number] {
  return {
    type: "tool-prepareAnswer",
    toolCallId: `invalid-ledger-${attempt}`,
    state: "output-available",
    input: {},
    output: {
      kind: "answer-ledger",
      outcome: "invalid",
      problemCodes: ["source-dependent-claim-without-direct-evidence"],
    },
  } as ResearchAssistantMessage["parts"][number];
}

test("renders redacted Source-component reads without fabricated coordinates", async () => {
  render(
    <ResearchAssistantResponse
      message={message([
        {
          type: "tool-readSourceComponent",
          toolCallId: "read-call",
          state: "output-available",
          input: { componentIdentity: "supplement:/one", offset: 0 },
          output: { kind: "source-component", found: true },
        } as ResearchAssistantMessage["parts"][number],
      ])}
      passageForReference={() => ({ show() {}, text: "" })}
    />,
  );

  const trigger = document.body.textContent?.includes("Read Source component")
    ? [...document.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Read Source component"),
      )
    : undefined;
  if (!trigger) throw new Error("Expected a Read Source component header");
  await fireEvent.click(trigger);
  await waitFor(() => {
    expect(document.body.textContent).toContain(
      "Read the Source component content for evidence discovery",
    );
  });
  expect(document.body.textContent).not.toContain("characters 0-0");
});
