import { useChat } from "@ai-sdk/react";
import {
  defaultResearchAssistantModel,
  type ResearchAssistantModel,
} from "@lirna/api/client";
import { Button } from "@lirna/ui/components/button";
import type { ChatTransport } from "ai";
import { XIcon } from "lucide-react";
import {
  type FormEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  type SelectionDraft,
  selectionDraftForText,
} from "../../annotations/domUtils";
import type { ArticlePassage } from "../../navigation/hooks/useShowInArticle";
import { useResearchThreads } from "../hooks/useResearchThreads";
import {
  createResearchAssistantTransport,
  type ResearchAssistantMessage,
  type ResearchPassageReference,
  type TemporaryEvidenceAttachment,
} from "../researchAssistantTransport";
import { QuestionComposer } from "./ResearchAssistantComposer";
import { ResearchAssistantTranscript } from "./ResearchAssistantTranscript";
import { ResearchThreadPicker } from "./ResearchThreadPicker";

// fallow-ignore-next-line complexity
export function ReadingResearchAssistant({
  onClose,
  open,
  reading: {
    componentIdentity,
    componentLabel,
    plainText,
    sourceId,
    sourceTitle,
    stateId,
  },
  passageForReference,
  passageForSelection,
  selection,
  transport,
  triggerRef,
}: {
  onClose: () => void;
  open: boolean;
  reading: {
    componentIdentity: string;
    componentLabel: string;
    plainText: string;
    sourceId: string;
    sourceTitle: string;
    stateId: string;
  };
  passageForReference: (reference: ResearchPassageReference) => ArticlePassage;
  passageForSelection: (selection: SelectionDraft) => ArticlePassage;
  selection?: SelectionDraft;
  transport?: ChatTransport<ResearchAssistantMessage>;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const [question, setQuestion] = useState("");
  const [attachments, setAttachments] = useState<TemporaryEvidenceAttachment[]>(
    [],
  );
  const [composerError, setComposerError] = useState<string>();
  const [model, setModel] = useState<ResearchAssistantModel>(
    defaultResearchAssistantModel,
  );
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const draftThreadIdRef = useRef<string | undefined>(undefined);
  const scope = { sourceId, stateId };
  const researchThreads = useResearchThreads({
    disabled: Boolean(transport),
    open,
    preferNew: Boolean(selection),
    scope,
  });
  const initialMessages: ResearchAssistantMessage[] =
    researchThreads.activeThread?.messages.map((message) => {
      const messageSelection = message.selectedText
        ? selectionDraftForText(plainText, message.selectedText)
        : undefined;
      return {
        id: message.id,
        role: message.role,
        parts: [{ type: "text", text: message.content }],
        ...(messageSelection || message.references?.length
          ? {
              metadata: {
                ...(messageSelection ? { selection: messageSelection } : {}),
                ...(message.references?.length
                  ? { references: message.references }
                  : {}),
              },
            }
          : {}),
      };
    }) ?? [];
  const { clearError, error, messages, sendMessage, status, stop } =
    useChat<ResearchAssistantMessage>({
      id: researchThreads.activeThread?.id ?? `new:${sourceId}:${stateId}`,
      messages: initialMessages,
      transport:
        transport ??
        createResearchAssistantTransport({
          componentIdentity,
          model,
          selection,
          sourceId,
          stateId,
          threadId:
            researchThreads.activeThread?.id ?? draftThreadIdRef.current,
          onThreadAllocated: (threadId) => {
            draftThreadIdRef.current = threadId;
          },
          onThreadCreated: (threadId) => {
            void researchThreads.threadCreated(threadId);
          },
        }),
    });
  const pending = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (open) questionRef.current?.focus({ preventScroll: Boolean(selection) });
  }, [open, selection]);

  useEffect(
    () => () => {
      void stop();
    },
    [stop],
  );

  function close() {
    void stop();
    onClose();
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function submitQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextQuestion = question.trim();
    if (!nextQuestion || pending) return;
    const submittedAttachments = attachments;
    setQuestion("");
    setComposerError(undefined);
    clearError();
    setAttachments([]);
    void sendMessage({
      role: "user",
      parts: [
        { type: "text", text: nextQuestion },
        ...submittedAttachments.map(({ dataUrl, filename, mediaType }) => ({
          type: "file" as const,
          filename,
          mediaType,
          url: dataUrl,
        })),
      ],
      ...(submittedAttachments.length || selection
        ? {
            metadata: {
              ...(submittedAttachments.length
                ? { attachments: submittedAttachments }
                : {}),
              ...(selection ? { selection } : {}),
            },
          }
        : {}),
    });
  }

  return open ? (
    <aside
      aria-label="Research assistant"
      className="h-[calc(100vh-1rem)] w-full"
      id="reading-research-assistant"
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <div className="flex h-full flex-col overflow-hidden bg-popover text-popover-foreground">
        <header className="flex items-start gap-3 border-b px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold font-serif text-lg">
              Research assistant
            </h2>
            <p className="truncate text-muted-foreground text-xs">
              {sourceTitle} · {componentLabel}
            </p>
            {!transport ? (
              <ResearchThreadPicker
                activeThreadId={researchThreads.activeThread?.id}
                disabled={pending || researchThreads.loading}
                onNew={() => {
                  draftThreadIdRef.current = undefined;
                  researchThreads.startNew();
                }}
                onResume={(threadId) => {
                  void researchThreads.resume(threadId);
                }}
                threads={researchThreads.threads}
              />
            ) : null}
          </div>
          <Button
            aria-label="Close assistant"
            onClick={close}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <XIcon />
          </Button>
        </header>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ResearchAssistantTranscript
            error={composerError ?? error?.message ?? researchThreads.error}
            messages={messages}
            passageForReference={passageForReference}
            passageForSelection={passageForSelection}
            pending={pending}
            selection={selection}
          />
        </div>
        <div className="border-t p-4">
          <QuestionComposer
            attachment={{
              attachments,
              onAttachmentsChange: setAttachments,
              onError: setComposerError,
            }}
            onQuestionChange={setQuestion}
            model={{ onChange: setModel, value: model }}
            onSubmit={submitQuestion}
            pending={pending}
            question={question}
            questionRef={questionRef}
            selection={selection}
          />
        </div>
      </div>
    </aside>
  ) : null;
}
