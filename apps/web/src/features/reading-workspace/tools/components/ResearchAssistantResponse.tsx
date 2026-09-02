import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@lirna/ui/components/ai-elements/sources";
import {
  Task,
  TaskContent,
  TaskItem,
  TaskTrigger,
} from "@lirna/ui/components/ai-elements/task";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@lirna/ui/components/ai-elements/tool";
import type { ReactNode } from "react";
import type { ArticlePassage } from "../../navigation/hooks/useShowInArticle";
import type {
  ResearchAssistantMessage,
  ResearchPassageReference,
} from "../researchAssistantTransport";
import { ResearchAnswer } from "./ResearchAnswer";

type MessagePart = ResearchAssistantMessage["parts"][number];

export function ResearchAssistantResponse({
  message,
  passageForReference,
}: {
  message: ResearchAssistantMessage;
  passageForReference: (reference: ResearchPassageReference) => ArticlePassage;
}) {
  const { activity, answer } = separateResponseSteps(message.parts);
  const references = responseReferences(message);

  return (
    <div className="flex flex-col gap-3">
      {activity.length ? <ResearchActivity parts={activity} /> : null}
      {answer ? (
        <ResearchAnswer
          answer={answer}
          passageForReference={passageForReference}
          references={references}
        />
      ) : null}
      {references.length ? (
        <Sources>
          <SourcesTrigger count={references.length}>
            <span className="font-medium">
              Used {references.length}{" "}
              {references.length === 1 ? "source" : "sources"}
            </span>
          </SourcesTrigger>
          <SourcesContent>
            {references.map((reference) => {
              const passage = passageForReference(reference);
              return (
                <Source
                  aria-label={`Show ${reference.componentLabel} in article`}
                  href={`#source-passage-${reference.componentIdentity}-${reference.selection.normalizedStartOffset}`}
                  key={referenceKey(reference)}
                  onClick={(event) => {
                    event.preventDefault();
                    passage.show();
                  }}
                  target="_self"
                  title={reference.componentLabel}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium text-foreground">
                      {reference.componentLabel}
                    </span>
                    <span className="line-clamp-2 text-muted-foreground">
                      {passage.text}
                    </span>
                  </span>
                </Source>
              );
            })}
          </SourcesContent>
        </Sources>
      ) : null}
    </div>
  );
}

function ResearchActivity({ parts }: { parts: MessagePart[] }) {
  return (
    <Task>
      <TaskTrigger title="Research process" />
      <TaskContent>
        {parts.map((part, index) => {
          if (part.type === "text")
            return <TaskItem key={`text:${index}`}>{part.text}</TaskItem>;
          if (isToolPart(part))
            return <ResearchTool key={part.toolCallId} part={part} />;
          return null;
        })}
      </TaskContent>
    </Task>
  );
}

function ResearchTool({ part }: { part: ToolPart }) {
  return (
    <Tool>
      {part.type === "dynamic-tool" ? (
        <ToolHeader
          state={part.state}
          statusLabel={evidenceStatus(part)}
          title={toolTitle(part)}
          toolName={part.toolName}
          type={part.type}
        />
      ) : (
        <ToolHeader
          state={part.state}
          statusLabel={evidenceStatus(part)}
          title={toolTitle(part)}
          type={part.type}
        />
      )}
      <ToolContent>
        <ToolInput input={part.input} />
        <ToolOutput
          errorText={"errorText" in part ? part.errorText : undefined}
          output={toolOutput(part)}
        />
      </ToolContent>
    </Tool>
  );
}

function separateResponseSteps(parts: MessagePart[]) {
  const steps: MessagePart[][] = [[]];
  for (const part of parts) {
    if (part.type === "step-start") {
      if (steps.at(-1)?.length) steps.push([]);
      continue;
    }
    steps.at(-1)?.push(part);
  }
  const populated = steps.filter((step) => step.length);
  const finalStep = populated.at(-1) ?? [];
  const finalCallsTool = finalStep.some(isToolPart);
  return {
    activity: (finalCallsTool ? populated : populated.slice(0, -1)).flat(),
    answer: finalCallsTool
      ? ""
      : finalStep
          .filter((part) => part.type === "text")
          .map((part) => part.text)
          .join(""),
  };
}

function responseReferences(message: ResearchAssistantMessage) {
  const references = [
    ...(message.metadata?.references ?? []),
    ...message.parts.flatMap(referenceFromToolPart),
  ];
  return references.filter(
    (reference, index) =>
      references.findIndex(
        (candidate) => referenceKey(candidate) === referenceKey(reference),
      ) === index,
  );
}

function referenceFromToolPart(part: MessagePart): ResearchPassageReference[] {
  if (
    !isReferencePassagePart(part) ||
    part.state !== "output-available" ||
    !part.output ||
    typeof part.output !== "object"
  )
    return [];
  const output = part.output as Partial<ResearchPassageReference> & {
    kind?: string;
  };
  return output.kind === "source-passage-reference" &&
    typeof output.componentIdentity === "string" &&
    typeof output.componentLabel === "string" &&
    output.selection
    ? [output as ResearchPassageReference]
    : [];
}

function isReferencePassagePart(part: MessagePart): part is ToolPart {
  return (
    isToolPart(part) &&
    (part.type === "tool-referencePassage" ||
      (part.type === "dynamic-tool" && part.toolName === "referencePassage"))
  );
}

function isToolPart(part: MessagePart): part is ToolPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function toolTitle(part: ToolPart) {
  const name =
    part.type === "dynamic-tool"
      ? part.toolName
      : part.type.slice("tool-".length);
  return (
    {
      readSourceComponent: "Read Source component",
      referencePassage: "Reference passage",
    }[name] ?? name
  );
}

function evidenceStatus(part: ToolPart) {
  if (part.state !== "output-available") return;
  const output = part.output;
  if (!output || typeof output !== "object" || !("outcome" in output)) return;
  if (typeof output.outcome !== "string") return;
  return evidenceOutcomeText(output.outcome);
}

function evidenceOutcomeText(outcome: string) {
  return {
    found: "Verified passage",
    none: "No relevant passage found",
    ambiguous: "Several passages may apply",
    stale: "Source representation changed",
    refused: "Evidence could not be admitted",
    "budget-exhausted": "Evidence budget exhausted",
  }[outcome];
}

// fallow-ignore-next-line complexity
function toolOutput(part: ToolPart): ReactNode {
  if (part.state !== "output-available") return null;
  const output = part.output;
  if (!output || typeof output !== "object") return output as ReactNode;
  if (part.type === "tool-readSourceComponent" && "found" in output) {
    if (!output.found) return "Source component was unavailable.";
    const result = output as {
      componentLabel?: string;
      offset?: number;
      endOffset?: number;
    };
    return `Read ${result.componentLabel ?? "Source component"}, characters ${result.offset ?? 0}-${result.endOffset ?? 0}.`;
  }
  if (isReferencePassagePart(part) && "kind" in output) {
    if ("outcome" in output && typeof output.outcome === "string")
      return (
        evidenceOutcomeText(output.outcome) ?? "Evidence outcome recorded."
      );
    if (output.kind === "source-passage-reference")
      return "Verified an exact passage for the Sources list.";
    if ("reason" in output && typeof output.reason === "string")
      return output.reason;
  }
  return "Tool completed.";
}

function referenceKey(reference: ResearchPassageReference) {
  if (reference.id) return reference.id;
  const liveReference = reference as ResearchPassageReference & {
    evidenceAlias?: string;
  };
  if (liveReference.evidenceAlias) return liveReference.evidenceAlias;
  return `${reference.componentIdentity}:${reference.selection.normalizedStartOffset}:${reference.selection.normalizedEndOffset}`;
}
