import type { ReadingDiagnostic, ReadingInline } from "./contract";
import {
  attribute,
  elementId,
  type HtmlElement,
  type HtmlNode,
  hasClass,
  ignoredElements,
  textContent,
} from "./dom";

const safeLinkProtocols = new Set(["http:", "https:", "mailto:"]);
const supportedTexMacros = new Set([
  "alpha",
  "beta",
  "cdot",
  "delta",
  "epsilon",
  "frac",
  "gamma",
  "geq",
  "in",
  "infty",
  "lambda",
  "leq",
  "left",
  "log",
  "mathbb",
  "mathcal",
  "mathit",
  "mathrm",
  "neq",
  "not",
  "pi",
  "quad",
  "rightarrow",
  "right",
  "sigma",
  "sqrt",
  "sum",
  "text",
  "theta",
  "times",
  "to",
]);

const inlineWrapperKinds: Record<
  string,
  "emphasis" | "subscript" | "superscript"
> = {
  b: "emphasis",
  em: "emphasis",
  i: "emphasis",
  strong: "emphasis",
  sub: "subscript",
  sup: "superscript",
};

export type InlineContext = {
  componentIdentity: string;
  ids: Set<string>;
  diagnostics: ReadingDiagnostic[];
};

export function inlineNodes(
  node: HtmlNode,
  context: InlineContext,
): ReadingInline[] {
  return trimInlineEdges(collectInlineNodes(node, context));
}

function collectInlineNodes(
  node: HtmlNode,
  context: InlineContext,
): ReadingInline[] {
  if ("value" in node) return textInline(node.value);
  if (!("childNodes" in node)) return [];
  if (!("tagName" in node))
    return node.childNodes.flatMap((child) =>
      collectInlineNodes(child, context),
    );
  const tex = texSource(node);
  if (tex) {
    diagnoseTex(tex.source, node, context);
    return [{ kind: "tex", ...tex }];
  }
  if (ignoredElements.has(node.tagName)) return [];
  const children = node.childNodes.flatMap((child) =>
    collectInlineNodes(child, context),
  );
  const wrapperKind = inlineWrapperKinds[node.tagName];
  if (wrapperKind)
    return children.length ? [{ kind: wrapperKind, children }] : [];
  const values =
    node.tagName === "a" ? inlineFromLink(node, children, context) : children;
  const id = node.tagName === "a" ? elementId(node) : undefined;
  return id ? [{ kind: "anchor", id, children: values }] : values;
}

function inlineFromLink(
  node: HtmlElement,
  children: ReadingInline[],
  context: InlineContext,
): ReadingInline[] {
  const href = attribute(node, "href");
  if (!href) return children;
  const authoredInternal = href.startsWith("#");
  const fragment = authoredInternal
    ? href.slice(1)
    : safeUrl(href)?.hash.slice(1);
  const internal = Boolean(fragment && context.ids.has(fragment));
  if ((authoredInternal && internal) || (!authoredInternal && isSafeLink(href)))
    return children.length ? [{ kind: "link", href, internal, children }] : [];
  context.diagnostics.push(
    diagnostic(
      context.componentIdentity,
      node,
      authoredInternal ? "missing-internal-target" : "unsafe-link",
      authoredInternal
        ? `The authored link target ${href} was not captured.`
        : `The authored link ${href} is not safe to open.`,
    ),
  );
  return children;
}

function trimInlineEdges(values: ReadingInline[]): ReadingInline[] {
  const first = values[0];
  const last = values.at(-1);
  if (first?.kind === "text") first.text = first.text.trimStart();
  if (last?.kind === "text") last.text = last.text.trimEnd();
  return values.filter(
    (value) => value.kind !== "text" || value.text.length > 0,
  );
}

function diagnoseTex(
  source: string,
  element: HtmlElement,
  context: InlineContext,
) {
  for (const macro of source.matchAll(/\\([A-Za-z]+)/g))
    if (!supportedTexMacros.has(macro[1] ?? ""))
      context.diagnostics.push(
        diagnostic(
          context.componentIdentity,
          element,
          "unsupported-tex-macro",
          `The TeX macro \\${macro[1]} is retained for inspection but may not render.`,
        ),
      );
}

function texSource(
  element: HtmlElement,
): { source: string; display: boolean } | undefined {
  const source =
    attribute(element, "data-tex") ??
    (element.tagName === "script" &&
    /math\/tex/.test(attribute(element, "type") ?? "")
      ? textContent(element)
      : undefined);
  if (!source) return undefined;
  return {
    source,
    display:
      attribute(element, "data-display") === "true" ||
      /display/.test(attribute(element, "type") ?? "") ||
      hasClass(element, "display"),
  };
}

function isSafeLink(href: string) {
  return Boolean(safeUrl(href));
}

function safeUrl(href: string) {
  try {
    const url = new URL(href, "https://plato.stanford.edu");
    return safeLinkProtocols.has(url.protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}

export function textInline(value: string): ReadingInline[] {
  const text = value.replace(/\s+/g, " ");
  return text ? [{ kind: "text", text }] : [];
}

export function inlineText(value: ReadingInline[]): string {
  return value
    .map((part) =>
      part.kind === "text"
        ? part.text
        : part.kind === "tex"
          ? part.source
          : part.kind === "citation"
            ? part.label
            : inlineText(part.children),
    )
    .join("");
}

export function diagnostic(
  componentIdentity: string,
  element: HtmlElement,
  code: string,
  message: string,
): ReadingDiagnostic {
  return {
    level: "warning",
    code,
    message,
    source: {
      componentIdentity,
      locator: elementId(element)
        ? `#${elementId(element)}`
        : `<${element.tagName}>`,
    },
  };
}
