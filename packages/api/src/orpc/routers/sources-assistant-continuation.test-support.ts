import type {
  ResearchThreadMessage,
  ResearchThreadOperations,
} from "../../research-assistant/research-thread-contract";
import { sourceId, stateId } from "./sep-admission.test-fixtures";

export const threadId = "30000000-0000-4000-8000-000000000000";
export const questionId = "40000000-0000-4000-8000-000000000000";
export const answerId = "50000000-0000-4000-8000-000000000000";
export const siblingAnswerId = "60000000-0000-4000-8000-000000000000";
export const followUpQuestionId = "70000000-0000-4000-8000-000000000000";
export const followUpAnswerId = "80000000-0000-4000-8000-000000000000";

export class BranchingThreads implements ResearchThreadOperations {
  selectedLeafId = siblingAnswerId;
  messages: ResearchThreadMessage[] = [
    message(questionId, "user", "What does the evidence establish?"),
    {
      ...message(
        answerId,
        "assistant",
        "The ancestor answer cites evidence.[^91000000-0000-4000-8000-000000000000]",
        questionId,
      ),
      model: "z-ai/glm-5.3-flash",
      references: [historyReference()],
    },
    message(
      followUpQuestionId,
      "user",
      "What follows from that answer?",
      answerId,
    ),
    {
      ...message(
        followUpAnswerId,
        "assistant",
        "The existing downstream answer.",
        followUpQuestionId,
      ),
      model: "z-ai/glm-5.3-flash",
    },
    {
      ...message(
        siblingAnswerId,
        "assistant",
        "An unselected sibling answer.",
        questionId,
      ),
      model: "z-ai/glm-5.3-flash",
    },
  ];

  async projectSelectedPath() {
    return { ...thread(), messages: this.pathThrough(this.selectedLeafId) };
  }

  async lineage() {
    return { relatedThreads: [] };
  }

  async appendQuestion(
    input: Parameters<ResearchThreadOperations["appendQuestion"]>[0],
  ) {
    if (this.selectedLeafId !== input.expectedSelectedLeafMessageId)
      return undefined;
    const question = message(
      crypto.randomUUID(),
      "user",
      input.content,
      this.selectedLeafId,
    );
    this.messages.push(question);
    this.selectedLeafId = question.id;
    return question;
  }

  async commitAnswer(
    input: Parameters<ResearchThreadOperations["commitAnswer"]>[0],
  ) {
    const answer = {
      ...message(
        input.answerMessageId,
        "assistant" as const,
        input.content,
        input.questionMessageId,
      ),
      model: input.model,
      references: input.references,
    };
    this.messages.push(answer);
    if (this.selectedLeafId === input.expectedSelectedLeafMessageId)
      this.selectedLeafId = answer.id;
    return answer;
  }

  async historyThroughQuestion({
    questionMessageId,
  }: Parameters<ResearchThreadOperations["historyThroughQuestion"]>[0]) {
    return this.messages.some(({ id }) => id === questionMessageId)
      ? this.pathThrough(questionMessageId)
      : undefined;
  }

  async listChildren({
    parentMessageId,
  }: Parameters<ResearchThreadOperations["listChildren"]>[0]) {
    return this.messages.filter(
      (message) => message.parentMessageId === parentMessageId,
    );
  }

  async selectAnswerAlternative(
    input: Parameters<ResearchThreadOperations["selectAnswerAlternative"]>[0],
  ) {
    if (this.selectedLeafId !== input.expectedSelectedLeafMessageId)
      return false;
    const answer = this.messages.find(
      ({ id, role }) => id === input.answerMessageId && role === "assistant",
    );
    if (!answer) return false;
    this.selectedLeafId = this.latestDescendant(answer.id);
    return true;
  }

  async create(): Promise<never> {
    throw new Error("Unexpected create");
  }

  async list() {
    return [];
  }

  async createRelatedThread(): Promise<never> {
    throw new Error("Unexpected related thread");
  }

  private latestDescendant(answerMessageId: string) {
    const descendants = new Set([answerMessageId]);
    let leafId = answerMessageId;
    for (const message of this.messages) {
      if (message.parentMessageId && descendants.has(message.parentMessageId)) {
        descendants.add(message.id);
        leafId = message.id;
      }
    }
    return leafId;
  }

  private pathThrough(leafId: string) {
    const byId = new Map(this.messages.map((item) => [item.id, item]));
    const path: ResearchThreadMessage[] = [];
    let current = byId.get(leafId);
    while (current) {
      path.push(current);
      current = current.parentMessageId
        ? byId.get(current.parentMessageId)
        : undefined;
    }
    return path.reverse();
  }
}

function message(
  id: string,
  role: "user" | "assistant",
  content: string,
  parentMessageId?: string,
): ResearchThreadMessage {
  return {
    id,
    role,
    content,
    ...(parentMessageId ? { parentMessageId } : {}),
    createdAt: "2026-09-04T12:00:00.000Z",
  };
}

function historyReference() {
  const referenceId = "90000000-0000-4000-8000-000000000000";
  return {
    id: referenceId,
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    occurrences: [
      {
        id: "91000000-0000-4000-8000-000000000000",
        answerTarget: { startOffset: 35, endOffset: 75 },
        presentation: "passing" as const,
        relation: "supports" as const,
        referenceId,
      },
    ],
    selection: {
      offsetBasis: "normalized-derivative-text-v1" as const,
      normalizedStartOffset: 0,
      normalizedEndOffset: 9,
      exactText: "Synthetic",
      prefix: "",
      suffix: " reading text.",
    },
  };
}

function thread() {
  return {
    id: threadId,
    sourceId,
    stateId,
    componentIdentity: "active:/",
    componentLabel: "Main entry",
    title: "Existing inquiry",
    createdAt: "2026-09-04T12:00:00.000Z",
    updatedAt: "2026-09-04T12:00:00.000Z",
  };
}
