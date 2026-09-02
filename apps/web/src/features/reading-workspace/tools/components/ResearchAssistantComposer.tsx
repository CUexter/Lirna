import {
  type ResearchAssistantModel,
  researchAssistantModelIds,
  researchAssistantModelLabels,
} from "@lirna/api/client";
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
} from "@lirna/ui/components/attachment";
import { Input } from "@lirna/ui/components/input";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@lirna/ui/components/input-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lirna/ui/components/select";
import { Spinner } from "@lirna/ui/components/spinner";
import { FileTextIcon, PaperclipIcon, SendIcon, XIcon } from "lucide-react";
import { type FormEvent, type RefObject, useRef } from "react";

import type { SelectionDraft } from "../../annotations/domUtils";
import type {
  TemporaryEvidenceAttachment,
  TemporaryEvidenceMediaType,
} from "../researchAssistantTransport";

const acceptedAttachmentTypes = new Set([
  "application/json",
  "application/pdf",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/csv",
  "text/markdown",
  "text/plain",
]);
const maxAttachmentCount = 3;
const maxAttachmentSize = 5 * 1024 * 1024;

export function QuestionComposer({
  attachment,
  model,
  onQuestionChange,
  onSubmit,
  pending,
  question,
  questionRef,
  selection,
}: {
  attachment: {
    attachments: TemporaryEvidenceAttachment[];
    onAttachmentsChange: (attachments: TemporaryEvidenceAttachment[]) => void;
    onError: (error?: string) => void;
  };
  model: {
    value: ResearchAssistantModel;
    onChange: (model: ResearchAssistantModel) => void;
  };
  onQuestionChange: (question: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  question: string;
  questionRef: RefObject<HTMLTextAreaElement | null>;
  selection?: SelectionDraft;
}) {
  const { attachments, onAttachmentsChange, onError } = attachment;
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function addAttachments(files: FileList | null) {
    if (!files?.length) return;
    const available = maxAttachmentCount - attachments.length;
    const selected = Array.from(files).slice(0, available);
    if (files.length > available) {
      onError(`Attach no more than ${maxAttachmentCount} files.`);
      return;
    }
    const invalid = selected.find(
      (file) =>
        !acceptedAttachmentTypes.has(file.type) ||
        file.size > maxAttachmentSize,
    );
    if (invalid) {
      onError(
        invalid.size > maxAttachmentSize
          ? `${invalid.name} is larger than 5 MB.`
          : `${invalid.name} is not a supported attachment type.`,
      );
      return;
    }
    const next = await Promise.all(selected.map(temporaryAttachmentFromFile));
    onError(undefined);
    onAttachmentsChange([...attachments, ...next]);
  }

  return (
    <form className="w-full" onSubmit={onSubmit}>
      <Input
        accept=".csv,.gif,.jpeg,.jpg,.json,.md,.pdf,.png,.txt,.webp,application/json,application/pdf,image/gif,image/jpeg,image/png,image/webp,text/csv,text/markdown,text/plain"
        aria-label="Attach files"
        className="sr-only"
        multiple
        onChange={(event) => {
          void addAttachments(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
        ref={fileInputRef}
        type="file"
      />
      {attachments.length ? (
        <MessageAttachments
          attachments={attachments}
          className="mb-3"
          onRemove={(dataUrl) =>
            onAttachmentsChange(
              attachments.filter(
                (attachment) => attachment.dataUrl !== dataUrl,
              ),
            )
          }
        />
      ) : null}
      <label className="sr-only" htmlFor="reading-research-question">
        Question
      </label>
      <InputGroup>
        <InputGroupTextarea
          id="reading-research-question"
          onChange={(event) => onQuestionChange(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              event.shiftKey ||
              event.nativeEvent.isComposing
            ) {
              return;
            }
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          placeholder={
            selection
              ? "Ask about the selected passage…"
              : "Ask a question about this Source…"
          }
          rows={3}
          ref={questionRef}
          value={question}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          <InputGroupButton
            aria-label="Add attachments"
            disabled={attachments.length >= maxAttachmentCount || pending}
            onClick={() => fileInputRef.current?.click()}
            size="icon-sm"
            type="button"
            variant="ghost"
          >
            <PaperclipIcon data-icon="inline-start" />
          </InputGroupButton>
          <Select
            disabled={pending}
            onValueChange={(value) =>
              model.onChange(value as ResearchAssistantModel)
            }
            value={model.value}
          >
            <SelectTrigger aria-label="Model" className="mr-auto border-0 px-1">
              <SelectValue>
                {researchAssistantModelLabels[model.value]}
              </SelectValue>
            </SelectTrigger>
            <SelectContent align="start">
              {researchAssistantModelIds.map((modelId) => (
                <SelectItem key={modelId} value={modelId}>
                  {researchAssistantModelLabels[modelId]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="sr-only">Temporary evidence only.</span>
          <InputGroupButton
            aria-label="Send question"
            disabled={!question.trim() || pending}
            size="icon-sm"
            type="submit"
            variant="default"
          >
            {pending ? (
              <Spinner aria-hidden="true" data-icon="inline-start" />
            ) : (
              <SendIcon data-icon="inline-start" />
            )}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  );
}

export function MessageAttachments({
  attachments,
  className,
  onRemove,
}: {
  attachments: TemporaryEvidenceAttachment[];
  className?: string;
  onRemove?: (dataUrl: string) => void;
}) {
  return (
    <AttachmentGroup className={className}>
      {attachments.map((attachment) => (
        <Attachment className="rounded-xl" key={attachment.dataUrl} size="sm">
          <AttachmentMedia
            variant={
              attachment.mediaType.startsWith("image/") ? "image" : "icon"
            }
          >
            {attachment.mediaType.startsWith("image/") ? (
              <img alt="" src={attachment.dataUrl} />
            ) : (
              <FileTextIcon />
            )}
          </AttachmentMedia>
          <AttachmentContent>
            <AttachmentTitle>{attachment.filename}</AttachmentTitle>
            <AttachmentDescription>
              {formatAttachmentSize(attachment.size)}
            </AttachmentDescription>
          </AttachmentContent>
          {onRemove ? (
            <AttachmentActions>
              <AttachmentAction
                aria-label={`Remove ${attachment.filename}`}
                onClick={() => onRemove(attachment.dataUrl)}
              >
                <XIcon />
              </AttachmentAction>
            </AttachmentActions>
          ) : null}
        </Attachment>
      ))}
    </AttachmentGroup>
  );
}

function temporaryAttachmentFromFile(
  file: File,
): Promise<TemporaryEvidenceAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve({
        dataUrl: String(reader.result),
        filename: file.name,
        mediaType: file.type as TemporaryEvidenceMediaType,
        size: file.size,
      });
    reader.onerror = () =>
      reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function formatAttachmentSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
