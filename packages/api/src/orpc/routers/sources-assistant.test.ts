import { expect, test } from "bun:test";
import { call } from "@orpc/server";
import type { Context } from "../../context";
import type { ResearchAssistantOperations } from "../../research-assistant/research-assistant";
import { createTestContext } from "../application-test-support";
import {
  admittedSourceStatesStub,
  readingFixture,
  sourceId,
  stateId,
} from "./sep-admission.test-fixtures";
import { sourcesRouter } from "./sources";

test("asks about trusted content from the admitted Source state", async () => {
  let received:
    | Parameters<ResearchAssistantOperations["answer"]>[0]
    | undefined;
  const result = await call(
    sourcesRouter.assistant.ask,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      question: "What is the central claim?",
      selection: {
        offsetBasis: "normalized-derivative-text-v1",
        normalizedStartOffset: 0,
        normalizedEndOffset: 9,
        exactText: "Synthetic",
        prefix: "",
        suffix: " reading text.",
      },
    },
    {
      context: context({
        async answer(input) {
          received = input;
          return { answer: "A provisional answer." };
        },
      }),
    },
  );

  expect(result).toEqual({ answer: "A provisional answer." });
  expect(received).toMatchObject({
    question: "What is the central claim?",
    sourceTitle: "Test entry",
    componentLabel: "Main entry",
    selectedText: "Synthetic",
    sourceText: "Synthetic reading text.",
  });
});

test("rejects selected evidence that does not match the admitted Source state", async () => {
  const request = call(
    sourcesRouter.assistant.ask,
    {
      sourceId,
      stateId,
      componentIdentity: "active:/",
      question: "What does this passage claim?",
      selection: {
        offsetBasis: "normalized-derivative-text-v1" as const,
        normalizedStartOffset: 0,
        normalizedEndOffset: 9,
        exactText: "Different",
        prefix: "",
        suffix: " reading text.",
      },
    },
    {
      context: context({
        async answer() {
          return { answer: "This must not be called." };
        },
      }),
    },
  );

  await expect(request).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "Selected Source-state evidence no longer matches",
  });
});

function context(researchAssistant: ResearchAssistantOperations): Context {
  return createTestContext({
    admittedSourceStates: admittedSourceStatesStub({
      async getReading() {
        const reading = readingFixture();
        const component = reading.components[0];
        if (!component) throw new Error("Fixture needs a reading component");
        component.plainText = "Synthetic reading text.";
        return reading;
      },
    }),
    researchAssistant,
  });
}
