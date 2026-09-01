import type { UIMessageChunk } from "ai";
import { z } from "zod";
import { authoredTargetInputSchema } from "../authored-targets/authored-target";
import type { ResearchPassageReference } from "./research-thread-contract";

// fallow-ignore-next-line complexity
export async function persistAssistantAnswer(
  stream: ReadableStream<UIMessageChunk>,
  persist: (
    content: string,
    references: ResearchPassageReference[],
  ) => Promise<unknown>,
): Promise<void> {
  const reader = stream.getReader();
  let currentStepContent = "";
  let finalStepContent = "";
  let hasStepBoundaries = false;
  const references: ResearchPassageReference[] = [];
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    if (next.value.type === "start-step") {
      hasStepBoundaries = true;
      currentStepContent = "";
    }
    if (next.value.type === "text-delta")
      currentStepContent += next.value.delta;
    if (next.value.type === "finish-step")
      finalStepContent = currentStepContent;
    if (next.value.type === "tool-output-available") {
      const reference = researchPassageReference(next.value.output);
      if (reference) references.push(reference);
    }
  }
  const content = hasStepBoundaries ? finalStepContent : currentStepContent;
  if (content.trim()) await persist(content, references);
}

function researchPassageReference(
  output: unknown,
): ResearchPassageReference | undefined {
  if (!output || typeof output !== "object" || !("kind" in output)) return;
  if (output.kind !== "source-passage-reference") return;
  const candidate = output as Omit<ResearchPassageReference, never> & {
    kind: string;
  };
  const parsed = z
    .object({
      componentIdentity: z.string(),
      componentLabel: z.string(),
      selection: authoredTargetInputSchema,
    })
    .safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}
