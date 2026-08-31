import type { ReactNode } from "react";

export function AssistantMarkdown({ children }: { children: string }) {
  return (
    <div className="flex flex-col gap-2 text-sm [&_a]:underline [&_blockquote]:border-l-2 [&_blockquote]:pl-3 [&_code]:font-mono [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-muted [&_pre]:p-3 [&_ul]:list-disc [&_ul]:pl-5">
      {renderBlocks(children)}
    </div>
  );
}

function renderBlocks(markdown: string): ReactNode[] {
  const blocks: ReactNode[] = [];
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length; ) {
    if (!lines[index]?.trim()) {
      index += 1;
      continue;
    }
    const parsed =
      parseCodeBlock(lines, index) ??
      parseHeading(lines, index) ??
      parseQuote(lines, index) ??
      parseList(lines, index) ??
      parseParagraph(lines, index);
    blocks.push(parsed.node);
    index = parsed.next;
  }
  return blocks;
}

interface ParsedBlock {
  next: number;
  node: ReactNode;
}

function parseCodeBlock(
  lines: string[],
  index: number,
): ParsedBlock | undefined {
  if (!lines[index]?.startsWith("```")) return undefined;
  const code: string[] = [];
  let next = index + 1;
  while (next < lines.length && !lines[next]?.startsWith("```")) {
    code.push(lines[next] ?? "");
    next += 1;
  }
  return {
    next: next + 1,
    node: (
      <pre key={`code-${index}`}>
        <code>{code.join("\n")}</code>
      </pre>
    ),
  };
}

function parseHeading(lines: string[], index: number): ParsedBlock | undefined {
  const heading = /^(#{1,3})\s+(.+)$/.exec(lines[index] ?? "");
  if (!heading) return undefined;
  const content = renderInline(heading[2] ?? "");
  const level = heading[1]?.length;
  return {
    next: index + 1,
    node:
      level === 1 ? (
        <h1 key={`heading-${index}`}>{content}</h1>
      ) : level === 2 ? (
        <h2 key={`heading-${index}`}>{content}</h2>
      ) : (
        <h3 key={`heading-${index}`}>{content}</h3>
      ),
  };
}

function parseQuote(lines: string[], index: number): ParsedBlock | undefined {
  if (!/^>\s?/.test(lines[index] ?? "")) return undefined;
  const quote: string[] = [];
  let next = index;
  while (next < lines.length && /^>\s?/.test(lines[next] ?? "")) {
    quote.push((lines[next] ?? "").replace(/^>\s?/, ""));
    next += 1;
  }
  return {
    next,
    node: (
      <blockquote key={`quote-${index}`}>
        {renderInline(quote.join(" "))}
      </blockquote>
    ),
  };
}

const listItem = /^\s*(?:[-*+]|(\d+)\.)\s+(.+)$/;

function parseList(lines: string[], index: number): ParsedBlock | undefined {
  const first = listItem.exec(lines[index] ?? "");
  if (!first) return undefined;
  const ordered = Boolean(first[1]);
  const items: ReactNode[] = [];
  let next = index;
  while (next < lines.length) {
    const item = listItem.exec(lines[next] ?? "");
    if (!item || Boolean(item[1]) !== ordered) break;
    items.push(<li key={next}>{renderInline(item[2] ?? "")}</li>);
    next += 1;
  }
  return {
    next,
    node: ordered ? (
      <ol key={`list-${index}`}>{items}</ol>
    ) : (
      <ul key={`list-${index}`}>{items}</ul>
    ),
  };
}

const blockStart = /^(?:#{1,3}\s|```|>\s?|\s*(?:[-*+]|\d+\.)\s)/;

function parseParagraph(lines: string[], index: number): ParsedBlock {
  const paragraph = [lines[index] ?? ""];
  let next = index + 1;
  while (next < lines.length && lines[next]?.trim()) {
    if (blockStart.test(lines[next] ?? "")) break;
    paragraph.push(lines[next] ?? "");
    next += 1;
  }
  return {
    next,
    node: <p key={`paragraph-${index}`}>{renderInline(paragraph.join(" "))}</p>,
  };
}

const inlineMarkdown =
  /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|\[[^\]]+\]\([^\s)]+\))/g;

function renderInline(markdown: string): ReactNode[] {
  return markdown
    .split(inlineMarkdown)
    .filter(Boolean)
    .map((part, index) => {
      if (part.startsWith("`") && part.endsWith("`"))
        return <code key={index}>{part.slice(1, -1)}</code>;
      if (
        (part.startsWith("**") && part.endsWith("**")) ||
        (part.startsWith("__") && part.endsWith("__"))
      )
        return <strong key={index}>{part.slice(2, -2)}</strong>;
      if (
        (part.startsWith("*") && part.endsWith("*")) ||
        (part.startsWith("_") && part.endsWith("_"))
      )
        return <em key={index}>{part.slice(1, -1)}</em>;
      const link = /^\[([^\]]+)\]\(([^\s)]+)\)$/.exec(part);
      if (link) {
        const href = safeLink(link[2] ?? "");
        return href ? (
          <a href={href} key={index} rel="noreferrer" target="_blank">
            {link[1]}
          </a>
        ) : (
          link[1]
        );
      }
      return part;
    });
}

function safeLink(href: string): string | undefined {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}
