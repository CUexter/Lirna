import type { Context } from "../../context";
import { researchAnswerHistoryContent } from "../../research-assistant/research-answer-markers";
import type { ResearchAssistantModel } from "../../research-assistant/research-assistant-contract";
import type { ResearchThreadMessage } from "../../research-assistant/research-thread-contract";
import { researchAssistantAnswerOptions } from "./research-assistant-answer-options";
import { notFound, requireReading } from "./source-router-support";

export type Reading = NonNullable<
  Awaited<ReturnType<Context["admittedSourceStates"]["getReading"]>>
>;

export async function requireReadingComponent(
  context: Context,
  input: { sourceId: string; stateId: string; componentIdentity: string },
) {
  const reading = await requireReading(context, input);
  const component = reading.components.find(
    ({ identity }) => identity === input.componentIdentity,
  );
  if (!component) throw notFound("SEP Reading component is unavailable");
  return { reading, component };
}

export async function answerQuestion(
  context: Context,
  input: {
    attachments?: Array<{ data: URL; filename: string; mediaType: string }>;
    component: Reading["components"][number];
    history: ResearchThreadMessage[];
    model: ResearchAssistantModel;
    question: ResearchThreadMessage;
    reading: Reading;
    sourceId: string;
    sourceStateId: string;
    threadId: string;
  },
) {
  const { component, history, question, reading } = input;
  if (!context.researchTurns) throw new Error("Research turns unavailable");
  return context.researchTurns.answer(
    {
      questionMessageId: question.id,
      threadId: input.threadId,
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
      history: history
        .slice(0, -1)
        .map(({ role, content, references, selectedText }) => ({
          role,
          content:
            role === "assistant" && references?.length
              ? researchAnswerHistoryContent(content, references)
              : content,
          ...(selectedText ? { selectedText } : {}),
        })),
      model: input.model,
      question: question.content,
      sourceId: input.sourceId,
      sourceStateId: input.sourceStateId,
      sourceTitle: reading.source.title,
      componentIdentity: component.identity,
      componentLabel: component.label,
      ...(question.selectedText ? { selectedText: question.selectedText } : {}),
      sourceText: component.plainText,
      components: reading.components.map(
        ({ identity, label, plainText, role }) => ({
          identity,
          label,
          plainText,
          role,
        }),
      ),
    },
    researchAssistantAnswerOptions(context),
  );
}
