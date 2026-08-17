import { type DefaultTreeAdapterTypes, parse } from "parse5";
import {
  type ClassifiedSepResourceUrl,
  classifySepResourceUrl,
  type SepPublicationScope,
} from "./sep-url";

type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlNode = DefaultTreeAdapterTypes.Node;

const excludedElements = new Set([
  "script",
  "style",
  "template",
  "noscript",
  "nav",
  "header",
  "footer",
  "form",
]);

export type SepResourceRole =
  | "main"
  | "citation-information"
  | "supplement"
  | "notes"
  | "figure-description"
  | "unknown-component"
  | "semantic-asset";

export interface SepCaptureLimits {
  maxComponents: number;
  maxAssets: number;
  maxResourceBytes: number;
  maxTotalBytes: number;
  maxDepth: number;
  maxRedirects: number;
  timeoutMilliseconds: number;
  maxConcurrency: number;
}

export const standardSepCaptureLimits: SepCaptureLimits = {
  maxComponents: 64,
  maxAssets: 256,
  maxResourceBytes: 50 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
  maxDepth: 8,
  maxRedirects: 5,
  timeoutMilliseconds: 15_000,
  maxConcurrency: 4,
};

export const expandedSepCaptureLimits: SepCaptureLimits = {
  maxComponents: 128,
  maxAssets: 512,
  maxResourceBytes: 100 * 1024 * 1024,
  maxTotalBytes: 500 * 1024 * 1024,
  maxDepth: 16,
  maxRedirects: 5,
  timeoutMilliseconds: 30_000,
  maxConcurrency: 4,
};

export interface SepDiscoveredResource {
  target: ClassifiedSepResourceUrl;
  role: Exclude<SepResourceRole, "main" | "citation-information">;
}

export interface SepRejectedDiscovery {
  url: string;
  reason: string;
}

export function discoverAuthoredResources(options: {
  html: string;
  parentUrl: string;
  scope: SepPublicationScope;
}): {
  resources: SepDiscoveredResource[];
  rejected: SepRejectedDiscovery[];
} {
  const resources: SepDiscoveredResource[] = [];
  const rejected: SepRejectedDiscovery[] = [];
  const document = parse(options.html);
  const root = findElement(document, "main") ?? document;
  visitElements(root, (element) => {
    if (element.tagName === "a") {
      addComponent(attribute(element, "href"), "link", {
        ...options,
        resources,
        rejected,
      });
      return;
    }
    if (element.tagName !== "img" && element.tagName !== "source") {
      return;
    }
    addComponent(attribute(element, "longdesc"), "longdesc", {
      ...options,
      resources,
      rejected,
    });
    addAsset(attribute(element, "src"), options, resources, rejected);
    for (const candidate of parseSrcset(attribute(element, "srcset"))) {
      addAsset(candidate, options, resources, rejected);
    }
  });
  return { resources, rejected };
}

function visitElements(node: HtmlNode, visit: (element: HtmlElement) => void) {
  if ("tagName" in node) {
    if (excludedElements.has(node.tagName)) {
      return;
    }
    visit(node);
  }
  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      visitElements(child, visit);
    }
  }
}

function findElement(node: HtmlNode, tagName: string): HtmlElement | undefined {
  if ("tagName" in node && node.tagName === tagName) {
    return node;
  }
  if ("childNodes" in node) {
    for (const child of node.childNodes) {
      const found = findElement(child, tagName);
      if (found) return found;
    }
  }
  return undefined;
}

function attribute(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((item) => item.name === name)?.value;
}

function parseSrcset(value: string | undefined): string[] {
  return value
    ? value
        .split(",")
        .map((item) => item.trim().split(/\s+/)[0])
        .filter((item): item is string => Boolean(item))
    : [];
}

function addComponent(
  value: string | undefined,
  source: "link" | "longdesc",
  options: {
    parentUrl: string;
    scope: SepPublicationScope;
    resources: SepDiscoveredResource[];
    rejected: SepRejectedDiscovery[];
  },
) {
  if (!value || value.startsWith("#")) {
    return;
  }
  let target: ClassifiedSepResourceUrl;
  try {
    target = classifySepResourceUrl(
      value,
      options.parentUrl,
      options.scope,
      "component",
    );
  } catch {
    return;
  }
  if (target.identity.endsWith(":/")) {
    return;
  }
  if (!/\.(?:html?|xhtml)$/i.test(target.url.pathname)) {
    return;
  }
  options.resources.push({
    target,
    role: componentRole(target.url.pathname, source),
  });
}

function componentRole(pathname: string, source: "link" | "longdesc") {
  const file = pathname.split("/").at(-1) ?? "";
  if (source === "longdesc") {
    return "figure-description" as const;
  }
  if (/notes?/i.test(file)) {
    return "notes" as const;
  }
  if (/(?:supp|appendix)/i.test(file)) {
    return "supplement" as const;
  }
  return "unknown-component" as const;
}

function addAsset(
  value: string | undefined,
  options: { parentUrl: string; scope: SepPublicationScope },
  resources: SepDiscoveredResource[],
  rejected: SepRejectedDiscovery[],
) {
  if (!value || value.startsWith("data:")) {
    return;
  }
  let target: ClassifiedSepResourceUrl;
  try {
    target = classifySepResourceUrl(
      value,
      options.parentUrl,
      options.scope,
      "asset",
    );
  } catch (error) {
    rejected.push({
      url: resolveDiscoveryUrl(value, options.parentUrl),
      reason:
        error instanceof Error
          ? error.message
          : "Semantic asset is outside the admitted publication scope",
    });
    return;
  }
  if (/\.(?:svg|html?|xhtml|js|mjs|css)$/i.test(target.url.pathname)) {
    rejected.push({
      url: target.url.href,
      reason: "Active or non-semantic asset types are not captured",
    });
    return;
  }
  resources.push({ target, role: "semantic-asset" });
}

function resolveDiscoveryUrl(value: string, parentUrl: string) {
  try {
    return new URL(value, parentUrl).href;
  } catch {
    return value;
  }
}
