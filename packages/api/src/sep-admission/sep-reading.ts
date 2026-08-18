// biome-ignore lint/style/noExcessiveLinesPerFile: The derivative schema and its parser form one cohesive evidence-preserving boundary.
import { type DefaultTreeAdapterTypes, parse } from "parse5";
import { z } from "zod";
import {
  extractSepBibliography,
  resolveSepCitations,
} from "./sep-bibliography";
import { decodeCapturedHtml } from "./sep-html";

type HtmlElement = DefaultTreeAdapterTypes.Element;
type HtmlNode = DefaultTreeAdapterTypes.Node;

const derivativeKind = "sep-reading-v1";
const ignoredElements = new Set(["script", "style", "template", "noscript"]);
const safeLinkProtocols = new Set(["http:", "https:", "mailto:"]);
const safeImageMediaType = /^image\/(?:avif|gif|jpeg|png|webp)(?:;|$)/i;
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

const inlineSchema: z.ZodType<ReadingInline> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1) }),
  z.object({
    kind: z.literal("emphasis"),
    children: z.array(z.lazy(() => inlineSchema)),
  }),
  z.object({
    kind: z.literal("subscript"),
    children: z.array(z.lazy(() => inlineSchema)),
  }),
  z.object({
    kind: z.literal("superscript"),
    children: z.array(z.lazy(() => inlineSchema)),
  }),
  z.object({
    kind: z.literal("tex"),
    source: z.string().min(1),
    display: z.boolean(),
  }),
  z.object({
    kind: z.literal("link"),
    href: z.string().min(1),
    internal: z.boolean(),
    children: z.array(z.lazy(() => inlineSchema)),
  }),
  z.object({
    kind: z.literal("citation"),
    mentionId: z.string().min(1),
    label: z.string().min(1),
    state: z.enum(["resolved", "ambiguous", "unresolved"]),
    candidates: z.array(z.string().min(1)),
    rule: z.string().min(1),
    evidence: z.string().min(1),
    entryId: z.string().min(1).optional(),
  }),
]);
const diagnosticSchema = z.object({
  level: z.enum(["info", "warning"]),
  code: z.string(),
  message: z.string(),
  source: z.object({
    componentIdentity: z.string().min(1),
    locator: z.string().min(1),
  }),
});
const tableRowSchema = z.object({
  cells: z.array(z.array(z.lazy(() => inlineSchema))),
});
const blockSchema: z.ZodType<ReadingBlock> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("paragraph"),
    children: z.array(inlineSchema).min(1),
  }),
  z.object({
    kind: z.literal("statement"),
    label: z.array(inlineSchema).min(1),
    body: z.array(inlineSchema).min(1),
  }),
  z.object({
    kind: z.literal("quotation"),
    children: z.array(inlineSchema).min(1),
  }),
  z.object({
    kind: z.literal("list"),
    ordered: z.boolean(),
    items: z.array(z.array(inlineSchema).min(1)).min(1),
  }),
  z.object({
    kind: z.literal("table"),
    caption: z.array(inlineSchema),
    head: z.array(tableRowSchema),
    body: z.array(tableRowSchema),
  }),
  z.object({ kind: z.literal("diagnostic"), diagnostic: diagnosticSchema }),
]);
const sectionSchema: z.ZodType<ReadingSection> = z.object({
  id: z.string().min(1),
  title: z.array(inlineSchema).min(1),
  level: z.number().int().min(2).max(6),
  blocks: z.array(blockSchema),
  children: z.array(z.lazy(() => sectionSchema)),
});
const figureSchema = z.object({
  id: z.string().min(1),
  caption: z.array(inlineSchema),
  description: z.object({
    text: z.array(inlineSchema),
    componentIdentity: z.string().min(1).optional(),
  }),
  dimensions: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .partial(),
  assetIdentity: z.string().min(1).optional(),
  assetDataUrl: z.string().startsWith("data:image/").optional(),
  diagnostics: z.array(diagnosticSchema),
});
const tocSchema: z.ZodType<ReadingTocItem> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  children: z.array(z.lazy(() => tocSchema)),
});
const componentSchema = z.object({
  identity: z.string().min(1),
  role: z.enum([
    "main",
    "supplement",
    "notes",
    "figure-description",
    "unknown-component",
  ]),
  label: z.string().min(1),
  parentIdentity: z.string().min(1).optional(),
  order: z.number().int().nonnegative(),
  requestedUrl: z.string().url(),
  finalUrl: z.string().url(),
  retrievedAt: z.string().datetime(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  toc: z.array(tocSchema),
  introductoryBlocks: z.array(blockSchema),
  sections: z.array(sectionSchema),
  figures: z.array(figureSchema),
  bibliography: z.array(z.lazy(() => bibliographyGroupSchema)),
  plainText: z.string(),
});

const bibliographyLinkSchema = z.object({
  label: z.string().min(1),
  href: z.string().url(),
  onlineOnly: z.literal(true),
});
const bibliographyEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  text: z.string().min(1),
  anchor: z.string().min(1),
  links: z.array(bibliographyLinkSchema),
  provenance: z.object({
    componentIdentity: z.string().min(1),
    locator: z.string().min(1),
  }),
});
const bibliographyGroupSchema: z.ZodType<ReadingBibliographyGroup> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  entries: z.array(bibliographyEntrySchema),
  provenance: z.object({
    componentIdentity: z.string().min(1),
    locator: z.string().min(1),
  }),
});

export const sepReadingContractSchema = z.object({
  version: z.literal(1),
  source: z.object({
    id: z.string().uuid(),
    stateId: z.string().uuid(),
    title: z.string().min(1),
    authors: z.array(z.string()),
    publisher: z.string().min(1),
    publicationHistory: z.array(z.string()),
    canonicalUrl: z.string().url(),
    observation: z.enum(["submitted", "recommended-archive"]),
    admittedAt: z.string().datetime(),
  }),
  mainComponent: z.object({
    identity: z.string().min(1),
    requestedUrl: z.string().url(),
    finalUrl: z.string().url(),
    retrievedAt: z.string().datetime(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  }),
  components: z.array(componentSchema).min(1),
  capture: z.object({
    completeness: z.enum(["complete", "partial", "stopped"]),
    readingReadiness: z.enum(["ready", "degraded"]),
    readinessReasons: z.array(z.string()),
    diagnostics: z.array(diagnosticSchema),
  }),
  toc: z.array(tocSchema),
  introductoryBlocks: z.array(blockSchema),
  sections: z.array(sectionSchema),
  plainText: z.string(),
  provenance: z.object({
    adapter: z.object({ id: z.literal("sep"), version: z.literal("1") }),
    parser: z.object({ id: z.literal("parse5"), version: z.literal("7.3.0") }),
    inputResourceHashes: z.array(
      z.object({
        identity: z.string().min(1),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    ),
  }),
});

export type SepReadingContract = z.infer<typeof sepReadingContractSchema>;
export type ReadingInline =
  | { kind: "text"; text: string }
  | {
      kind: "emphasis" | "subscript" | "superscript";
      children: ReadingInline[];
    }
  | { kind: "tex"; source: string; display: boolean }
  | {
      kind: "link";
      href: string;
      internal: boolean;
      children: ReadingInline[];
    }
  | {
      kind: "citation";
      mentionId: string;
      label: string;
      state: "resolved" | "ambiguous" | "unresolved";
      candidates: string[];
      rule: string;
      evidence: string;
      entryId?: string;
    };
export interface ReadingBibliographyGroup {
  id: string;
  title: string;
  entries: Array<{
    id: string;
    label: string;
    text: string;
    anchor: string;
    links: Array<{ label: string; href: string; onlineOnly: true }>;
    provenance: { componentIdentity: string; locator: string };
  }>;
  provenance: { componentIdentity: string; locator: string };
}
export type ReadingBlock =
  | { kind: "paragraph" | "quotation"; children: ReadingInline[] }
  | { kind: "statement"; label: ReadingInline[]; body: ReadingInline[] }
  | { kind: "list"; ordered: boolean; items: ReadingInline[][] }
  | {
      kind: "table";
      caption: ReadingInline[];
      head: Array<{ cells: ReadingInline[][] }>;
      body: Array<{ cells: ReadingInline[][] }>;
    }
  | { kind: "diagnostic"; diagnostic: ReadingDiagnostic };
export interface ReadingDiagnostic {
  level: "info" | "warning";
  code: string;
  message: string;
  source: { componentIdentity: string; locator: string };
}
export interface ReadingSection {
  id: string;
  title: ReadingInline[];
  level: number;
  blocks: ReadingBlock[];
  children: ReadingSection[];
}
export interface ReadingTocItem {
  id: string;
  title: string;
  children: ReadingTocItem[];
}
export interface ReadingFigure {
  id: string;
  caption: ReadingInline[];
  description: { text: ReadingInline[]; componentIdentity?: string };
  dimensions: { width?: number; height?: number };
  assetIdentity?: string;
  assetDataUrl?: string;
  diagnostics: ReadingDiagnostic[];
}
export interface ReadingComponent {
  identity: string;
  role:
    | "main"
    | "supplement"
    | "notes"
    | "figure-description"
    | "unknown-component";
  label: string;
  parentIdentity?: string;
  order: number;
  requestedUrl: string;
  finalUrl: string;
  retrievedAt: string;
  sha256: string;
  toc: ReadingTocItem[];
  introductoryBlocks: ReadingBlock[];
  sections: ReadingSection[];
  figures: ReadingFigure[];
  bibliography: ReadingBibliographyGroup[];
  plainText: string;
}
type SepReadingResource = NonNullable<
  Parameters<typeof createSepReadingDerivative>[0]["components"]
>[number];
type ReadingComponentResource = SepReadingResource & {
  role: ReadingComponent["role"];
};

export function createSepReadingDerivative(options: {
  source: SepReadingContract["source"];
  main: {
    identity: string;
    requestedUrl: string;
    finalUrl: string;
    retrievedAt: Date;
    sha256: string;
    mediaType?: string;
    charset?: string | null;
    body: Buffer;
  };
  resources: Array<{ identity: string; sha256: string }>;
  components?: Array<{
    identity: string;
    role:
      | "main"
      | "supplement"
      | "notes"
      | "figure-description"
      | "unknown-component"
      | "semantic-asset"
      | "citation-information";
    requestedUrl: string;
    finalUrl: string;
    retrievedAt: Date;
    sha256: string;
    mediaType?: string;
    charset?: string | null;
    body: Buffer;
    discoveryEdge: string;
  }>;
  capture: Omit<SepReadingContract["capture"], "diagnostics"> & {
    diagnostics: Array<{
      level: "info" | "warning";
      code: string;
      message: string;
    }>;
  };
}): SepReadingContract {
  const document = parse(
    decodeCapturedHtml(
      options.main.body,
      options.main.charset ?? undefined,
      "main",
    ),
  );
  const article = findElement(document, "main");
  const readingRoot =
    article ??
    findElementById(document, "aueditable") ??
    findElementById(document, "article-content") ??
    document;
  const targets = collectTargets(readingRoot, options.main.identity);
  const extraction = extractArticle(
    readingRoot,
    options.main.identity,
    targets.ids,
    readingArticleExclusions(readingRoot),
  );
  extraction.diagnostics.unshift(...targets.diagnostics);
  const captureDiagnostics = options.capture.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    source: { componentIdentity: options.main.identity, locator: "capture" },
  }));
  const componentResources = options.components ?? [
    {
      ...options.main,
      role: "main" as const,
      discoveryEdge: "submitted-entry",
    },
  ];
  const components = componentResources
    .filter(
      (resource): resource is ReadingComponentResource =>
        resource.role !== "semantic-asset" &&
        resource.role !== "citation-information",
    )
    .map((resource, order) =>
      createReadingComponent(resource, componentResources, order),
    );
  const mainComponent = components.find(
    (component) => component.identity === options.main.identity,
  );
  if (!mainComponent)
    throw new Error("SEP Reading derivative is missing its main component");
  const contract = {
    version: 1 as const,
    source: options.source,
    mainComponent: {
      identity: options.main.identity,
      requestedUrl: options.main.requestedUrl,
      finalUrl: options.main.finalUrl,
      retrievedAt: options.main.retrievedAt.toISOString(),
      sha256: options.main.sha256,
    },
    capture: {
      ...options.capture,
      diagnostics: [...captureDiagnostics, ...extraction.diagnostics],
    },
    components,
    toc: mainComponent.toc,
    introductoryBlocks: mainComponent.introductoryBlocks,
    sections: mainComponent.sections,
    plainText: mainComponent.plainText,
    provenance: {
      adapter: { id: "sep" as const, version: "1" as const },
      parser: { id: "parse5" as const, version: "7.3.0" as const },
      inputResourceHashes: [...options.resources].sort((left, right) =>
        left.identity.localeCompare(right.identity),
      ),
    },
  };
  return sepReadingContractSchema.parse(contract);
}

export function readSepReadingDerivative(value: unknown): SepReadingContract {
  return sepReadingContractSchema.parse(value);
}
export { derivativeKind as sepReadingDerivativeKind };

function createReadingComponent(
  resource: ReadingComponentResource,
  resources: SepReadingResource[],
  order: number,
): ReadingComponent {
  const document = parse(
    decodeCapturedHtml(
      resource.body,
      resource.charset ?? undefined,
      resource.role,
    ),
  );
  const article = findElement(document, "main");
  const readingRoot =
    article ??
    findElementById(document, "aueditable") ??
    findElementById(document, "article-content") ??
    document;
  const targets = collectTargets(readingRoot, resource.identity);
  const bibliography = extractSepBibliography(document, resource.identity);
  const excludedElements = new Set([
    ...readingArticleExclusions(readingRoot),
    ...bibliography.excludedElements,
  ]);
  const extraction = extractArticle(
    readingRoot,
    resource.identity,
    targets.ids,
    excludedElements,
  );
  extraction.diagnostics.unshift(...targets.diagnostics);
  resolveSepCitations(
    extraction.introductoryBlocks,
    extraction.sections,
    bibliography.groups,
  );
  const parentIdentity = resource.discoveryEdge.startsWith("authored:")
    ? resource.discoveryEdge.slice("authored:".length)
    : undefined;
  const figures = extractFigures({
    root: readingRoot,
    resource,
    resources,
    ids: targets.ids,
    diagnostics: extraction.diagnostics,
  });
  return {
    identity: resource.identity,
    role: resource.role,
    label:
      componentLabel(resource, resources, parentIdentity) ??
      roleLabel(resource.role),
    ...(parentIdentity ? { parentIdentity } : {}),
    order,
    requestedUrl: resource.requestedUrl,
    finalUrl: resource.finalUrl,
    retrievedAt: resource.retrievedAt.toISOString(),
    sha256: resource.sha256,
    toc: extraction.toc,
    introductoryBlocks: extraction.introductoryBlocks,
    sections: extraction.sections,
    figures,
    bibliography: bibliography.groups,
    plainText: [
      ...blocksText(extraction.introductoryBlocks),
      ...sectionsText(extraction.sections),
    ].join("\n\n"),
  };
}

function componentLabel(
  resource: SepReadingResource,
  resources: SepReadingResource[],
  parentIdentity: string | undefined,
) {
  const parent = resources.find(
    (candidate) => candidate.identity === parentIdentity,
  );
  if (!parent) return undefined;
  const document = parse(
    decodeCapturedHtml(parent.body, parent.charset ?? undefined, parent.role),
  );
  const link = descendants(findElement(document, "main") ?? document).find(
    (element) =>
      element.tagName === "a" &&
      attribute(element, "href") &&
      resolvesTo(
        attribute(element, "href") as string,
        parent.finalUrl,
        resource,
      ),
  );
  const label = link ? textContent(link) : "";
  return label || undefined;
}

function resolvesTo(
  href: string,
  parentUrl: string,
  resource: SepReadingResource,
) {
  try {
    const target = new URL(href, parentUrl).href;
    return target === resource.requestedUrl || target === resource.finalUrl;
  } catch {
    return false;
  }
}

function roleLabel(role: ReadingComponent["role"]) {
  return role === "main"
    ? "Article"
    : role === "figure-description"
      ? "Figure description"
      : role === "unknown-component"
        ? "Additional component"
        : role[0]?.toUpperCase() + role.slice(1);
}

function extractFigures({
  root,
  resource,
  resources,
  ids,
  diagnostics,
}: {
  root: HtmlNode | undefined;
  resource: SepReadingResource;
  resources: SepReadingResource[];
  ids: Set<string>;
  diagnostics: ReadingDiagnostic[];
}): ReadingFigure[] {
  let count = 0;
  return descendants(root)
    .filter(
      (element) => element.tagName === "figure" || element.tagName === "img",
    )
    .filter(
      (element) =>
        element.tagName === "figure" ||
        !ancestorsContain(root, element, "figure"),
    )
    .map((element) => {
      count += 1;
      return createFigure({
        element,
        fallbackId: `figure-${count}`,
        resource,
        resources,
        ids,
        diagnostics,
      });
    });
}

function createFigure({
  element,
  fallbackId,
  resource,
  resources,
  ids,
  diagnostics,
}: {
  element: HtmlElement;
  fallbackId: string;
  resource: SepReadingResource;
  resources: SepReadingResource[];
  ids: Set<string>;
  diagnostics: ReadingDiagnostic[];
}): ReadingFigure {
  const image = figureImage(element);
  const asset =
    image && resourceForAttribute(image, "src", resource, resources);
  const descriptionResource =
    image && resourceForAttribute(image, "longdesc", resource, resources);
  const figureDiagnostics = missingFigureDiagnostics({
    image,
    asset,
    descriptionResource,
    resource,
  });
  diagnostics.push(...figureDiagnostics);
  const caption = figureCaption(element, resource.identity, ids, diagnostics);
  const altText = image ? attribute(image, "alt") : undefined;
  const width = image ? positiveInteger(attribute(image, "width")) : undefined;
  const height = image
    ? positiveInteger(attribute(image, "height"))
    : undefined;
  const assetDataUrl = retainedImageDataUrl(asset);
  return {
    id: elementId(element) ?? fallbackId,
    caption,
    description: {
      text: altText ? textInline(altText) : [],
      ...(descriptionResource
        ? { componentIdentity: descriptionResource.identity }
        : {}),
    },
    dimensions: {
      ...(width ? { width } : {}),
      ...(height ? { height } : {}),
    },
    ...(asset ? { assetIdentity: asset.identity } : {}),
    ...(assetDataUrl ? { assetDataUrl } : {}),
    diagnostics: figureDiagnostics,
  };
}

function retainedImageDataUrl(resource: SepReadingResource | undefined) {
  if (!resource?.mediaType || !safeImageMediaType.test(resource.mediaType)) {
    return undefined;
  }
  const mediaType = resource.mediaType.split(";", 1)[0]?.toLowerCase();
  return mediaType
    ? `data:${mediaType};base64,${resource.body.toString("base64")}`
    : undefined;
}

function figureImage(element: HtmlElement) {
  return element.tagName === "img"
    ? element
    : descendants(element).find((child) => child.tagName === "img");
}

function figureCaption(
  element: HtmlElement,
  componentIdentity: string,
  ids: Set<string>,
  diagnostics: ReadingDiagnostic[],
) {
  const caption =
    element.tagName === "figure"
      ? childElements(element).find((child) => child.tagName === "figcaption")
      : undefined;
  return caption
    ? inlineNodes(caption, componentIdentity, ids, diagnostics)
    : [];
}

function missingFigureDiagnostics({
  image,
  asset,
  descriptionResource,
  resource,
}: {
  image: HtmlElement | undefined;
  asset: SepReadingResource | undefined;
  descriptionResource: SepReadingResource | undefined;
  resource: SepReadingResource;
}) {
  if (!image) return [];
  const diagnostics: ReadingDiagnostic[] = [];
  if (attribute(image, "src") && !asset) {
    diagnostics.push(
      diagnostic(
        resource.identity,
        image,
        "missing-semantic-asset",
        "The semantic figure asset was not retained in this Source state.",
      ),
    );
  }
  if (attribute(image, "longdesc") && !descriptionResource) {
    diagnostics.push(
      diagnostic(
        resource.identity,
        image,
        "missing-figure-description",
        "The authored figure description component was not retained in this Source state.",
      ),
    );
  }
  return diagnostics;
}

function ancestorsContain(
  root: HtmlNode | undefined,
  target: HtmlElement,
  tagName: string,
) {
  return descendants(root).some(
    (element) =>
      element.tagName === tagName &&
      element !== target &&
      descendants(element).includes(target),
  );
}

function resourceForAttribute(
  element: HtmlElement,
  name: string,
  resource: SepReadingResource,
  resources: SepReadingResource[],
) {
  const value = attribute(element, name);
  if (!value) return undefined;
  try {
    const target = new URL(value, resource.finalUrl).href;
    return resources.find(
      (candidate) =>
        candidate.requestedUrl === target || candidate.finalUrl === target,
    );
  } catch {
    return undefined;
  }
}

function positiveInteger(value: string | undefined) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function extractArticle(
  root: HtmlNode | undefined,
  componentIdentity: string,
  ids: Set<string>,
  excludedElements: Set<HtmlElement> = new Set(),
) {
  const introductoryBlocks: ReadingBlock[] = [];
  const sections: ReadingSection[] = [];
  const diagnostics: ReadingDiagnostic[] = [];
  const stack: ReadingSection[] = [];
  let pendingAnchor: string | undefined;
  let generatedSectionCount = 0;
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Recursive heading and anchor dispatch preserves authored navigation through structural wrappers.
  const visit = (element: HtmlElement) => {
    if (excludedElements.has(element)) return;
    if (isStandaloneAnchor(element)) {
      pendingAnchor = elementId(element);
      return;
    }
    if (/^h[2-6]$/.test(element.tagName)) {
      const title = inlineNodes(element, componentIdentity, ids, diagnostics);
      if (title.length === 0) return;
      const level = Number(element.tagName.slice(1));
      while ((stack.at(-1)?.level ?? 0) >= level) stack.pop();
      generatedSectionCount += 1;
      const section = {
        id:
          elementId(element) ??
          nestedAnchorId(element) ??
          pendingAnchor ??
          `section-${generatedSectionCount}`,
        title,
        level,
        blocks: [],
        children: [],
      } satisfies ReadingSection;
      pendingAnchor = undefined;
      const parent = stack.at(-1);
      if (parent) parent.children.push(section);
      else sections.push(section);
      stack.push(section);
      return;
    }
    if (
      ["html", "body", "article", "section", "div"].includes(element.tagName)
    ) {
      for (const child of childElements(element)) visit(child);
      return;
    }
    const target = stack.at(-1)?.blocks ?? introductoryBlocks;
    appendBlock(element, target, componentIdentity, ids, diagnostics);
  };
  for (const element of childElements(root)) {
    visit(element);
  }
  const toc = extractToc(root, sections);
  validateTocTargets(
    toc,
    new Set([...ids, ...sectionIds(sections)]),
    componentIdentity,
    diagnostics,
  );
  return {
    toc,
    introductoryBlocks,
    sections,
    diagnostics,
  };
}

function readingArticleExclusions(root: HtmlNode | undefined) {
  const excludedElements = new Set<HtmlElement>();
  const toc = descendants(root).find(
    (element) => elementId(element) === "toc" || hasClass(element, "toc"),
  );
  if (toc) excludedElements.add(toc);

  const mainText = descendants(root).find(
    (element) => elementId(element) === "main-text",
  );
  const articleContainer = mainText
    ? [...(root && "tagName" in root ? [root] : []), ...descendants(root)].find(
        (element) => childElements(element).includes(mainText),
      )
    : undefined;
  const children = childElements(articleContainer ?? mainText ?? root);
  const cutoff = children.findIndex(isReadingUtilityBoundary);
  if (cutoff >= 0) {
    for (const child of children.slice(cutoff)) excludedElements.add(child);
  }
  return excludedElements;
}

function isReadingUtilityBoundary(element: HtmlElement) {
  if (elementId(element) === "main-text") return false;
  if (
    ["academic-tools", "other-internet-resources", "related-entries"].includes(
      elementId(element) ?? "",
    )
  )
    return true;
  if (isReadingUtilityHeading(element)) return true;
  return descendants(element).some(
    (child) =>
      ["Aca", "Oth", "Rel"].includes(elementId(child) ?? "") ||
      isReadingUtilityHeading(child),
  );
}

function isReadingUtilityHeading(element: HtmlElement) {
  return (
    /^h[2-6]$/.test(element.tagName) &&
    ["academic tools", "other internet resources", "related entries"].includes(
      normalizeHeading(textContent(element)),
    )
  );
}

function normalizeHeading(value: string) {
  return value
    .replace(/[\s\u00a0]+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is the explicit allowlist for supported block structures.
// biome-ignore lint/complexity/useMaxParams: The parser state is deliberately explicit at the recursive extraction boundary.
function appendBlock(
  element: HtmlElement,
  blocks: ReadingBlock[],
  componentIdentity: string,
  ids: Set<string>,
  diagnostics: ReadingDiagnostic[],
) {
  const inline = () =>
    inlineNodes(element, componentIdentity, ids, diagnostics);
  if (element.tagName === "p") {
    const children = inline();
    if (children.length) blocks.push({ kind: "paragraph", children });
    return;
  }
  if (element.tagName === "blockquote") {
    const children = inline();
    if (children.length) blocks.push({ kind: "quotation", children });
    return;
  }
  if (element.tagName === "ul" || element.tagName === "ol") {
    const items = childElements(element)
      .filter((child) => child.tagName === "li")
      .map((item) => inlineNodes(item, componentIdentity, ids, diagnostics))
      .filter((item) => item.length > 0);
    if (items.length)
      blocks.push({ kind: "list", ordered: element.tagName === "ol", items });
    return;
  }
  if (element.tagName === "table") {
    appendTable(element, blocks, componentIdentity, ids, diagnostics);
    return;
  }
  if (element.tagName === "dl") {
    const terms = childElements(element);
    for (let index = 0; index < terms.length; index += 2) {
      const label = terms[index];
      const body = terms[index + 1];
      if (label?.tagName === "dt" && body?.tagName === "dd")
        blocks.push({
          kind: "statement",
          label: inlineNodes(label, componentIdentity, ids, diagnostics),
          body: inlineNodes(body, componentIdentity, ids, diagnostics),
        });
    }
    return;
  }
  if (element.tagName === "div" && hasClass(element, "statement")) {
    const label = childElements(element).find((child) =>
      hasClass(child, "label"),
    );
    const body = element.childNodes
      .filter((child) => child !== label)
      .flatMap((child) =>
        inlineNodes(child, componentIdentity, ids, diagnostics),
      );
    const labelNodes = label
      ? inlineNodes(label, componentIdentity, ids, diagnostics)
      : [];
    if (labelNodes.length && body.length)
      blocks.push({
        kind: "statement",
        label: labelNodes,
        body,
      });
    return;
  }
  if (["div", "figure", "pre", "aside"].includes(element.tagName))
    addDiagnostic(
      blocks,
      diagnostics,
      componentIdentity,
      element,
      "unsupported-structure",
      `The authored ${element.tagName} structure could not be rendered without changing its meaning.`,
    );
}

// biome-ignore lint/complexity/useMaxParams: Table conversion needs the same explicit parser state as other blocks.
function appendTable(
  table: HtmlElement,
  blocks: ReadingBlock[],
  componentIdentity: string,
  ids: Set<string>,
  diagnostics: ReadingDiagnostic[],
) {
  const rows = descendants(table).filter((element) => element.tagName === "tr");
  const isGenuine =
    rows.some((row) =>
      childElements(row).some((cell) => cell.tagName === "th"),
    ) || childElements(table).some((child) => child.tagName === "caption");
  const cells = rows.map((row) => ({
    cells: childElements(row)
      .filter((cell) => cell.tagName === "td" || cell.tagName === "th")
      .map((cell) => inlineNodes(cell, componentIdentity, ids, diagnostics)),
  }));
  if (!isGenuine) {
    for (const row of cells) {
      const children = row.cells.flat();
      if (children.length) blocks.push({ kind: "paragraph", children });
    }
    return;
  }
  const caption = childElements(table).find(
    (child) => child.tagName === "caption",
  );
  const headerCount = rows.filter((row) =>
    childElements(row).some((cell) => cell.tagName === "th"),
  ).length;
  blocks.push({
    kind: "table",
    caption: caption
      ? inlineNodes(caption, componentIdentity, ids, diagnostics)
      : [],
    head: cells.slice(0, headerCount),
    body: cells.slice(headerCount),
  });
}

function inlineNodes(
  node: HtmlNode,
  componentIdentity: string,
  ids: Set<string>,
  diagnostics: ReadingDiagnostic[],
): ReadingInline[] {
  return trimInlineEdges(
    collectInlineNodes(node, componentIdentity, ids, diagnostics),
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This is the explicit allowlist for supported inline structures.
function collectInlineNodes(
  node: HtmlNode,
  componentIdentity: string,
  ids: Set<string>,
  diagnostics: ReadingDiagnostic[],
): ReadingInline[] {
  if ("value" in node) return textInline(node.value);
  if (!("childNodes" in node)) return [];
  if ("tagName" in node) {
    const tex = texSource(node);
    if (tex) {
      diagnoseTex(
        tex.source,
        tex.display,
        componentIdentity,
        node,
        diagnostics,
      );
      return [{ kind: "tex", ...tex }];
    }
    if (ignoredElements.has(node.tagName)) return [];
    const children = node.childNodes.flatMap((child) =>
      collectInlineNodes(child, componentIdentity, ids, diagnostics),
    );
    if (["em", "i", "strong", "b"].includes(node.tagName))
      return children.length ? [{ kind: "emphasis", children }] : [];
    if (node.tagName === "sub")
      return children.length ? [{ kind: "subscript", children }] : [];
    if (node.tagName === "sup")
      return children.length ? [{ kind: "superscript", children }] : [];
    if (node.tagName === "a") {
      const href = attribute(node, "href");
      if (!href) return children;
      const internal = href.startsWith("#");
      if (
        (internal && ids.has(href.slice(1))) ||
        (!internal && isSafeLink(href))
      )
        return children.length
          ? [{ kind: "link", href, internal, children }]
          : [];
      diagnostics.push(
        diagnostic(
          componentIdentity,
          node,
          internal ? "missing-internal-target" : "unsafe-link",
          internal
            ? `The authored link target ${href} was not captured.`
            : `The authored link ${href} is not safe to open.`,
        ),
      );
      return children;
    }
    return children;
  }
  return node.childNodes.flatMap((child) =>
    collectInlineNodes(child, componentIdentity, ids, diagnostics),
  );
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

function extractToc(
  root: HtmlNode | undefined,
  sections: ReadingSection[],
): ReadingTocItem[] {
  const toc = descendants(root).find(
    (element) => elementId(element) === "toc" || hasClass(element, "toc"),
  );
  const list =
    toc &&
    descendants(toc).find(
      (element) => element.tagName === "ol" || element.tagName === "ul",
    );
  if (list) return tocItems(list);
  return sections.map((section) => ({
    id: section.id,
    title: inlineText(section.title),
    children: section.children.map(toTocItem),
  }));
}
function tocItems(list: HtmlElement): ReadingTocItem[] {
  return childElements(list)
    .filter((item) => item.tagName === "li")
    .flatMap((item) => {
      const link = descendants(item).find(
        (child) =>
          child.tagName === "a" && attribute(child, "href")?.startsWith("#"),
      );
      const nested = childElements(item).find(
        (child) => child.tagName === "ol" || child.tagName === "ul",
      );
      const id = link && attribute(link, "href")?.slice(1);
      const title = link && textContent(link);
      return id && title && !isReadingUtilityTocItem(id, title)
        ? [{ id, title, children: nested ? tocItems(nested) : [] }]
        : [];
    });
}
function isReadingUtilityTocItem(id: string, title: string) {
  return (
    ["Bib", "Aca", "Oth", "Rel"].includes(id) ||
    [
      "bibliography",
      "academic tools",
      "other internet resources",
      "related entries",
    ].includes(normalizeHeading(title))
  );
}
function toTocItem(section: ReadingSection): ReadingTocItem {
  return {
    id: section.id,
    title: inlineText(section.title),
    children: section.children.map(toTocItem),
  };
}
function sectionIds(sections: ReadingSection[]): string[] {
  return sections.flatMap((section) => [
    section.id,
    ...sectionIds(section.children),
  ]);
}
function validateTocTargets(
  items: ReadingTocItem[],
  ids: Set<string>,
  componentIdentity: string,
  diagnostics: ReadingDiagnostic[],
) {
  for (const item of items) {
    if (!ids.has(item.id)) {
      diagnostics.push({
        level: "warning",
        code: "missing-toc-target",
        message: `The authored table of contents target #${item.id} was not captured.`,
        source: { componentIdentity, locator: `#${item.id}` },
      });
    }
    validateTocTargets(item.children, ids, componentIdentity, diagnostics);
  }
}

// biome-ignore lint/complexity/useMaxParams: Diagnostic blocks retain both output and source location.
function addDiagnostic(
  blocks: ReadingBlock[],
  diagnostics: ReadingDiagnostic[],
  componentIdentity: string,
  element: HtmlElement,
  code: string,
  message: string,
) {
  const value = diagnostic(componentIdentity, element, code, message);
  diagnostics.push(value);
  blocks.push({ kind: "diagnostic", diagnostic: value });
}
function diagnostic(
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
// biome-ignore lint/complexity/useMaxParams: TeX diagnostics retain the original source and element location.
function diagnoseTex(
  source: string,
  _display: boolean,
  componentIdentity: string,
  element: HtmlElement,
  diagnostics: ReadingDiagnostic[],
) {
  for (const macro of source.matchAll(/\\([A-Za-z]+)/g))
    if (!supportedTexMacros.has(macro[1] ?? ""))
      diagnostics.push(
        diagnostic(
          componentIdentity,
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
function collectTargets(root: HtmlNode, componentIdentity: string) {
  const ids = new Set<string>();
  const diagnostics: ReadingDiagnostic[] = [];
  for (const element of descendants(root)) {
    const id = elementId(element);
    if (!id) continue;
    if (ids.has(id)) {
      diagnostics.push(
        diagnostic(
          componentIdentity,
          element,
          "duplicate-internal-target",
          `The authored internal target #${id} occurs more than once.`,
        ),
      );
    }
    ids.add(id);
  }
  return { ids, diagnostics };
}
function elementId(element: HtmlElement): string | undefined {
  return (
    attribute(element, "id") ??
    (element.tagName === "a" ? attribute(element, "name") : undefined)
  );
}
function findElementById(root: HtmlNode, id: string): HtmlElement | undefined {
  return descendants(root).find((element) => elementId(element) === id);
}
function nestedAnchorId(element: HtmlElement): string | undefined {
  const anchor = descendants(element).find(
    (child) => child.tagName === "a" && elementId(child),
  );
  return anchor ? elementId(anchor) : undefined;
}
function isStandaloneAnchor(element: HtmlElement) {
  return (
    element.tagName === "a" &&
    Boolean(elementId(element)) &&
    textContent(element) === ""
  );
}
function attribute(element: HtmlElement, name: string): string | undefined {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}
function hasClass(element: HtmlElement, className: string) {
  return (attribute(element, "class") ?? "").split(/\s+/).includes(className);
}
function isSafeLink(href: string) {
  try {
    return safeLinkProtocols.has(
      new URL(href, "https://plato.stanford.edu").protocol,
    );
  } catch {
    return false;
  }
}
function findElement(node: HtmlNode, tagName: string): HtmlElement | undefined {
  if ("tagName" in node && node.tagName === tagName) return node;
  return "childNodes" in node
    ? node.childNodes.map((child) => findElement(child, tagName)).find(Boolean)
    : undefined;
}
function childElements(node: HtmlNode | undefined): HtmlElement[] {
  return node && "childNodes" in node
    ? node.childNodes.filter(
        (child): child is HtmlElement => "tagName" in child,
      )
    : [];
}
function descendants(node: HtmlNode | undefined): HtmlElement[] {
  return childElements(node).flatMap((child) => [child, ...descendants(child)]);
}
function textContent(node: HtmlNode): string {
  return rawTextContent(node).replace(/\s+/g, " ").trim();
}
function rawTextContent(node: HtmlNode): string {
  if ("value" in node) return node.value;
  if (
    !("childNodes" in node) ||
    ("tagName" in node && ignoredElements.has(node.tagName))
  )
    return "";
  return node.childNodes.map(rawTextContent).join("");
}
function textInline(value: string): ReadingInline[] {
  const text = value.replace(/\s+/g, " ");
  return text ? [{ kind: "text", text }] : [];
}
function inlineText(value: ReadingInline[]): string {
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
function blocksText(blocks: ReadingBlock[]): string[] {
  return blocks.map((block) =>
    block.kind === "statement"
      ? `${inlineText(block.label)} ${inlineText(block.body)}`
      : block.kind === "list"
        ? block.items.map(inlineText).join(" ")
        : block.kind === "table"
          ? block.body.flatMap((row) => row.cells.map(inlineText)).join(" ")
          : block.kind === "diagnostic"
            ? block.diagnostic.message
            : inlineText(block.children),
  );
}
function sectionsText(sections: ReadingSection[]): string[] {
  return sections.flatMap((section) => [
    inlineText(section.title),
    ...blocksText(section.blocks),
    ...sectionsText(section.children),
  ]);
}
