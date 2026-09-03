import { expect, test } from "bun:test";
import { MockLanguageModelV4 } from "ai/test";

import { createResearchAssistant } from "./research-assistant";
import {
  textStream,
  toolCallStream,
} from "./research-model-stream.test-support";
import type { ResearchThreadOperations } from "./research-thread-contract";
import { createResearchTurnOperations } from "./research-turn";

test("answers a direct-quotation follow-up without recapping the previous answer", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("ground", "groundEvidence", {
          componentScope: ["active:/"],
          intent: "Tuvel's statement about transracialism",
          limit: 5,
        });
      if (call === 2)
        return toolCallStream("prepare", "prepareAnswer", {
          claims: [
            {
              key: "attribution",
              text: "Tuvel writes:",
              kind: "source-dependent",
              evidence: [{ alias: "ev_1", relation: "supports" }],
            },
          ],
        });
      return textStream("Tuvel writes:\n\n:::quote[ev_1]\n:::");
    },
  });
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  const turns = createResearchTurnOperations(createResearchAssistant(model), {
    async append(input) {
      appended.push(input);
      return {
        id: crypto.randomUUID(),
        role: input.role,
        content: input.content,
        createdAt: "2026-09-04T12:00:00.000Z",
      };
    },
  });
  const passage =
    "The legitimacy of transgender entailed the legitimacy of transracialism.";

  const stream = await turns.answer({
    threadId: "30000000-0000-4000-8000-000000000000",
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    components: [
      {
        identity: "active:/",
        label: "Main entry",
        plainText: passage,
        role: "main",
      },
    ],
    derivativeId: "derivative-one",
    history: [
      { role: "user", content: "How did the philosopher reply?" },
      {
        role: "assistant",
        content:
          "The philosopher challenged the article's argument and requested retraction.",
      },
    ],
    question: "Directly quote it for me.",
    sourceId: "source-one",
    sourceStateId: "state-one",
    sourceText: passage,
    sourceTitle: "Test source",
  });
  for await (const _chunk of stream) {
    // Consume the stream so the answer is committed.
  }

  expect(model.doStreamCalls).toHaveLength(3);
  expect(model.doStreamCalls[0]?.prompt[0]?.content).toContain(
    "If the latest user asks only for a direct quotation, provide at most a brief attribution and the empty quote block; do not recap the previous answer",
  );
  expect(appended).toHaveLength(1);
  expect(appended[0]?.content).toMatch(
    /^Tuvel writes:\n\n:::quote\[[\da-f-]{36}\]\n:::$/,
  );
  expect(appended[0]?.content).not.toContain("challenged the article");
  expect(appended[0]?.references).toMatchObject([
    {
      selection: { exactText: passage },
      occurrences: [{ presentation: "quote", relation: "supports" }],
    },
  ]);
});
