import { expect, test } from "bun:test";
import type { UIMessageChunk } from "ai";
import { MockLanguageModelV4 } from "ai/test";

import { activeReadingStub } from "../annotations/annotation-store.test-support";
import type { EvidenceResolutionObservation } from "./evidence-resolution";
import { createResearchAssistant } from "./research-assistant";
import { createResearchEvidenceSessionCore } from "./research-evidence-session";

test("a derivative change expires remaining handles and restarts discovery", async () => {
  let derivativeId = "derivative-one";
  const session = createResearchEvidenceSessionCore({
    components: [
      {
        identity: "article",
        label: "Article",
        plainText:
          "Repeated evidence.\n\nBetween occurrences.\n\nRepeated evidence.",
        role: "main",
      },
    ],
    sourceStateId: "state-one",
    derivativeId,
    currentDerivativeId: async () => derivativeId,
  });
  const discovery = await session.discover({
    componentScope: ["article"],
    intent: "repeated evidence",
    limit: 5,
  });
  if (discovery.outcome !== "candidates" && discovery.outcome !== "ambiguous")
    throw new Error("Expected evidence candidates");
  const [firstHandle, secondHandle] = discovery.candidates.map(
    ({ handle }) => handle,
  );
  if (!firstHandle || !secondHandle)
    throw new Error("Expected two evidence candidates");
  expect(await session.admit({ candidateHandle: firstHandle })).toMatchObject({
    outcome: "admitted",
    evidenceAlias: "ev_1",
  });

  derivativeId = "derivative-two";
  expect(await session.admit({ candidateHandle: secondHandle })).toMatchObject({
    outcome: "stale",
    reasonCode: "derivative-changed",
  });
  expect(await session.admit({ candidateHandle: firstHandle })).toMatchObject({
    outcome: "refused",
    reasonCode: "outside-session-scope",
  });

  const rediscovered = await session.discover({
    componentScope: ["article"],
    intent: "repeated evidence",
    limit: 5,
  });
  if (
    rediscovered.outcome !== "candidates" &&
    rediscovered.outcome !== "ambiguous"
  )
    throw new Error("Expected discovery to restart");
  const readmitted = await session.admit({
    candidateHandle: rediscovered.candidates[0]?.handle ?? "",
  });
  expect(readmitted).toMatchObject({
    outcome: "admitted",
    evidenceAlias: "ev_1",
  });
});

import { toolCallStream } from "./research-model-stream.test-support";

test("cancellation interrupts an admission awaiting Derivative validation", async () => {
  const activeReading = activeReadingStub(true);
  let readCount = 0;
  let admissionStarted: (() => void) | undefined;
  let releaseValidation: (() => void) | undefined;
  const admissionPending = new Promise<void>((resolve) => {
    admissionStarted = resolve;
  });
  const validationGate = new Promise<void>((resolve) => {
    releaseValidation = resolve;
  });
  const observations: EvidenceResolutionObservation[] = [];
  const model = new MockLanguageModelV4({
    doStream: async () =>
      toolCallStream("ground", "groundEvidence", {
        componentScope: ["article:main"],
        intent: "readevidence carefully",
        limit: 5,
      }),
  });
  const answer = await createResearchAssistant(model, {
    async read(input) {
      readCount += 1;
      if (readCount > 1) {
        admissionStarted?.();
        await validationGate;
      }
      return activeReading.read(input);
    },
  }).answer(
    {
      componentIdentity: "article:main",
      componentLabel: "Article",
      components: [
        {
          identity: "article:main",
          label: "Article",
          plainText: "Readevidence carefully.",
          role: "main",
        },
      ],
      question: "What does the evidence say?",
      sourceId: "source-one",
      sourceStateId: "state-one",
      sourceText: "Readevidence carefully.",
      sourceTitle: "Test source",
    },
    { onEvidenceResolution: (observation) => observations.push(observation) },
  );
  const reader = answer.getReader();
  const consume = consumeUntilClosed(reader);

  await admissionPending;
  const cancelled = reader.cancel("client disconnected");
  releaseValidation?.();
  await cancelled;
  await consume;

  expect(readCount).toBe(2);
  expect(observations.some(({ outcome }) => outcome === "admitted")).toBe(
    false,
  );
});

async function consumeUntilClosed(
  reader: ReadableStreamDefaultReader<UIMessageChunk>,
) {
  while (!(await reader.read()).done) {
    // Keep pulling until cancellation closes the stream.
  }
}
