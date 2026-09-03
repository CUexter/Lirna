import { expect, test } from "bun:test";
import type { UIMessageChunk } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { createResearchAssistant } from "./research-assistant";
import type { ResearchEvidenceDecisionReceipt } from "./research-evidence-session-contract";
import {
  candidateHandleFromPrompt,
  textStream,
  toolCallStream,
} from "./research-model-stream.test-support";
import type { ResearchThreadOperations } from "./research-thread-contract";
import { createResearchTurnOperations } from "./research-turn";

test("persists a canonical Reference admitted through evidence discovery", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1)
        return toolCallStream("ground", "groundEvidence", {
          componentScope: ["active:/"],
          intent: "verified passage",
          limit: 5,
        });
      if (call === 2)
        return toolCallStream("prepare", "prepareAnswer", {
          claims: [
            {
              key: "grounded-claim",
              text: "The claim is grounded.",
              kind: "source-dependent",
              evidence: [{ alias: "ev_1", relation: "supports" }],
            },
          ],
        });
      return textStream("The claim is grounded.[^ev_1]");
    },
  });
  const appended: Array<Parameters<ResearchThreadOperations["append"]>[0]> = [];
  const receipts: ResearchEvidenceDecisionReceipt[] = [];
  const turns = createResearchTurnOperations(createResearchAssistant(model), {
    async append(input) {
      appended.push(input);
      return {
        id: crypto.randomUUID(),
        role: input.role,
        content: input.content,
        createdAt: "2026-09-03T12:00:00.000Z",
      };
    },
  });

  const stream = await turns.answer(
    {
      threadId: "30000000-0000-4000-8000-000000000000",
      componentIdentity: "active:/",
      componentLabel: "Main entry",
      components: [
        {
          identity: "active:/",
          label: "Main entry",
          plainText: "Before.\n\nVerified passage.\n\nAfter.",
          role: "main",
        },
      ],
      derivativeId: "derivative-one",
      question: "What is verified?",
      sourceId: "source-one",
      sourceStateId: "state-one",
      sourceText: "Before.\n\nVerified passage.\n\nAfter.",
      sourceTitle: "Test source",
    },
    { onEvidenceSessionReceipt: (receipt) => receipts.push(receipt) },
  );
  const chunks: UIMessageChunk[] = [];
  for await (const chunk of stream) chunks.push(chunk);

  expect(appended).toMatchObject([
    {
      role: "assistant",
      content: expect.stringMatching(
        /^The claim is grounded\.\[\^[\da-f-]{36}\]$/,
      ),
      references: [
        {
          componentIdentity: "active:/",
          selection: {
            normalizedStartOffset: 9,
            normalizedEndOffset: 26,
            exactText: "Verified passage.",
          },
          occurrences: [
            {
              presentation: "passing",
              relation: "supports",
            },
          ],
        },
      ],
    },
  ]);
  expect(receipts).toMatchObject([
    {
      outcome: "successful",
      sourceStateId: "state-one",
      consumption: {
        discoveries: 1,
        candidates: 1,
        admissions: 1,
        modelSteps: 3,
        evidenceCharacters: 17,
      },
      candidateCount: 1,
    },
  ]);
  expect(JSON.stringify(receipts)).not.toContain("What is verified?");
  expect(JSON.stringify(receipts)).not.toContain("Verified passage.");
  expect(JSON.stringify(receipts)).not.toContain("componentScope");
  const toolProgress = chunks.filter((chunk) => chunk.type.startsWith("tool-"));
  expect(toolProgress).toContainEqual(
    expect.objectContaining({
      type: "tool-output-available",
      toolCallId: "ground",
    }),
  );
  expect(JSON.stringify(toolProgress)).not.toContain("findEvidence");
  expect(JSON.stringify(toolProgress)).not.toContain("admitEvidence");
  expect(JSON.stringify(toolProgress)).not.toContain("candidate_");
  expect(JSON.stringify(toolProgress)).not.toContain("Verified passage.");
  expect(JSON.stringify(toolProgress)).not.toContain("The claim is grounded.");
  expect(JSON.stringify(toolProgress)).not.toContain("normalizedStartOffset");
  expect(chunks).toContainEqual({
    type: "message-metadata",
    messageMetadata: {
      references: expect.arrayContaining([
        expect.objectContaining({ componentIdentity: "active:/" }),
      ]),
    },
  });
});

test("persists only the deliberately selected repeated occurrence", async () => {
  let call = 0;
  const model = new MockLanguageModelV4({
    doStream: async ({ prompt }) => {
      call += 1;
      if (call === 1)
        return toolCallStream("ground", "groundEvidence", {
          componentScope: ["active:/"],
          intent: "repeated evidence",
          limit: 5,
        });
      if (call === 2)
        return toolCallStream("admit", "admitEvidence", {
          candidateHandle: candidateHandleFromPrompt(prompt, 1),
          purpose: "Ground the later occurrence",
        });
      if (call === 3)
        return toolCallStream("prepare", "prepareAnswer", {
          claims: [
            {
              key: "later-occurrence",
              text: "The later occurrence matters.",
              kind: "source-dependent",
              evidence: [{ alias: "ev_1", relation: "supports" }],
            },
          ],
        });
      return textStream(
        "The later occurrence matters.[^ev_1]\n\n:::quote[ev_1]\n:::",
      );
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
        createdAt: "2026-09-03T12:00:00.000Z",
      };
    },
  });

  const sourceText =
    "Repeated evidence.\n\nBetween occurrences.\n\nRepeated evidence.";
  const stream = await turns.answer({
    threadId: "30000000-0000-4000-8000-000000000000",
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    components: [
      {
        identity: "active:/",
        label: "Main entry",
        plainText: sourceText,
        role: "main",
      },
    ],
    derivativeId: "derivative-one",
    question: "Which occurrence matters?",
    sourceId: "source-one",
    sourceStateId: "state-one",
    sourceText,
    sourceTitle: "Test source",
  });
  for await (const _chunk of stream) {
    // Consume the stream so the answer is committed.
  }

  expect(appended).toHaveLength(1);
  expect(appended[0]?.references).toHaveLength(1);
  expect(appended[0]?.references?.[0]).toMatchObject({
    componentIdentity: "active:/",
    selection: {
      normalizedStartOffset: 42,
      normalizedEndOffset: 60,
      exactText: "Repeated evidence.",
    },
    occurrences: [
      { presentation: "passing", relation: "supports" },
      { presentation: "quote", relation: "supports" },
    ],
  });
});

test("answers the trans women and trans men question without exact-text retries", async () => {
  let call = 0;
  const toolNames: string[] = [];
  const model = new MockLanguageModelV4({
    doStream: async () => {
      call += 1;
      if (call === 1) {
        toolNames.push("groundEvidence");
        return toolCallStream("ground-women", "groundEvidence", {
          componentScope: ["active:/", "supplement:notes"],
          intent: "academic positions rejecting trans women identities",
          limit: 5,
        });
      }
      if (call === 2) {
        toolNames.push("groundEvidence");
        return toolCallStream("ground-men", "groundEvidence", {
          componentScope: ["active:/", "supplement:notes"],
          intent: "coverage devoted to transgender males",
          limit: 5,
        });
      }
      if (call === 3)
        return toolCallStream("prepare", "prepareAnswer", {
          claims: [
            {
              key: "women",
              text: "The article presents gender-critical feminism as rejecting trans women's identities.",
              kind: "source-dependent",
              evidence: [{ alias: "ev_1", relation: "supports" }],
            },
            {
              key: "men",
              text: "It does not provide enough evidence to assess its treatment of trans men.",
              kind: "original-reasoning",
              evidence: [],
            },
          ],
        });
      return textStream(
        "The article presents gender-critical feminism as rejecting trans women's identities.[^ev_1] It does not provide enough evidence to assess its treatment of trans men.",
      );
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
        createdAt: "2026-09-03T12:00:00.000Z",
      };
    },
  });
  const canonicalPassage =
    "Gender-critical feminism is typified by its rejection of trans women's identities.";
  const chunks: UIMessageChunk[] = [];

  const stream = await turns.answer({
    threadId: "30000000-0000-4000-8000-000000000000",
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    components: [
      {
        identity: "active:/",
        label: "Main entry",
        plainText: canonicalPassage,
        role: "main",
      },
      {
        identity: "supplement:notes",
        label: "Notes",
        plainText: "The notes discuss the movement's academic context.",
        role: "supplement",
      },
    ],
    derivativeId: "derivative-one",
    question:
      "What does this article say about contemporary views of trans women and trans men?",
    sourceId: "source-one",
    sourceStateId: "state-one",
    sourceText: canonicalPassage,
    sourceTitle: "Test source",
  });
  for await (const chunk of stream) chunks.push(chunk);

  expect(toolNames).toEqual(["groundEvidence", "groundEvidence"]);
  expect(chunks).toContainEqual({
    type: "tool-output-available",
    toolCallId: "ground-men",
    output: {
      kind: "evidence-resolution",
      outcome: "none",
      reasonCode: "no-relevant-passage",
      candidateCount: 0,
    },
  });
  expect(chunks.some(({ type }) => type === "error")).toBe(false);
  expect(appended).toMatchObject([
    {
      content: expect.stringContaining(
        "does not provide enough evidence to assess its treatment of trans men",
      ),
      references: [
        {
          componentIdentity: "active:/",
          selection: { exactText: canonicalPassage },
        },
      ],
    },
  ]);
});
