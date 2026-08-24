import { parse } from "parse5";
import {
  extractSepBibliography,
  resolveSepCitations,
} from "./sep-bibliography";
import { decodeCapturedHtml } from "./sep-html";
import { extractArticle, readingArticleExclusions } from "./sep-reading-blocks";
import {
  type ReadingComponent,
  type ReadingDiagnostic,
  type SepReadingContract,
  sepReadingContractSchema,
} from "./sep-reading-contract";
import {
  attribute,
  descendants,
  findElement,
  findElementById,
  textContent,
} from "./sep-reading-dom";
import { extractFigures } from "./sep-reading-figures";
import { readingArticleText } from "./sep-reading-text";
import { collectTargets } from "./sep-reading-toc";

interface SepReadingResource {
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
}
type ReadingComponentResource = SepReadingResource & {
  role: ReadingComponent["role"];
};

interface CreateSepReadingDerivativeOptions {
  source: SepReadingContract["source"];
  main: Omit<SepReadingResource, "role" | "discoveryEdge">;
  resources: Array<{ identity: string; sha256: string }>;
  components?: SepReadingResource[];
  capture: Omit<SepReadingContract["capture"], "diagnostics"> & {
    diagnostics: Array<{
      level: "info" | "warning";
      code: string;
      message: string;
    }>;
  };
}

export function createSepReadingDerivative(
  options: CreateSepReadingDerivativeOptions,
): SepReadingContract {
  const componentResources: SepReadingResource[] = options.components ?? [
    {
      ...options.main,
      role: "main" as const,
      discoveryEdge: "submitted-entry",
    },
  ];
  const mainDiagnostics = mainExtractionDiagnostics(
    options.main,
    componentResources,
  );
  const captureDiagnostics = options.capture.diagnostics.map((diagnostic) => ({
    ...diagnostic,
    source: { componentIdentity: options.main.identity, locator: "capture" },
  }));
  const canonicalResources = [...componentResources].sort((left, right) =>
    left.identity.localeCompare(right.identity),
  );
  const components = canonicalResources
    .filter(isReadingComponentResource)
    .map((resource, order) =>
      createReadingComponent(resource, canonicalResources, order),
    );
  const mainComponent = resolveMainComponent(components, options.main.identity);
  for (const component of components) {
    const bibliographyComponent =
      component.bibliography.length === 0 ? mainComponent : component;
    resolveSepCitations(
      component.introductoryBlocks,
      component.sections,
      bibliographyComponent.bibliography,
      {
        current: component.finalUrl,
        bibliography: bibliographyComponent.finalUrl,
      },
    );
  }
  return buildReadingContract(options, components, mainComponent, [
    ...captureDiagnostics,
    ...mainDiagnostics,
  ]);
}

function mainExtractionDiagnostics(
  main: CreateSepReadingDerivativeOptions["main"],
  resources: SepReadingResource[],
): ReadingDiagnostic[] {
  const document = parse(
    decodeCapturedHtml(main.body, main.charset ?? undefined, "main"),
  );
  const article = findElement(document, "main");
  const readingRoot =
    article ??
    findElementById(document, "aueditable") ??
    findElementById(document, "article-content") ??
    document;
  const targets = collectTargets(readingRoot, main.identity);
  const diagnostics = [...targets.diagnostics];
  const figures = extractFigures({
    root: readingRoot,
    resource: main,
    resources,
    ids: targets.ids,
    diagnostics,
  });
  const extraction = extractArticle(readingRoot, main.identity, targets.ids, {
    excludedElements: readingArticleExclusions(readingRoot),
    figures: figures.byElement,
  });
  return [...diagnostics, ...extraction.diagnostics];
}

function isReadingComponentResource(
  resource: SepReadingResource,
): resource is ReadingComponentResource {
  return (
    resource.role !== "semantic-asset" &&
    resource.role !== "citation-information"
  );
}

function resolveMainComponent(
  components: ReadingComponent[],
  identity: string,
): ReadingComponent {
  const mainComponent = components.find(
    (component) => component.identity === identity,
  );
  if (!mainComponent)
    throw new Error("SEP Reading derivative is missing its main component");
  return mainComponent;
}

function buildReadingContract(
  options: CreateSepReadingDerivativeOptions,
  components: ReadingComponent[],
  mainComponent: ReadingComponent,
  diagnostics: ReadingDiagnostic[],
): SepReadingContract {
  return sepReadingContractSchema.parse({
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
      diagnostics,
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
  });
}

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
  const figureExtraction = extractFigures({
    root: readingRoot,
    resource,
    resources,
    ids: targets.ids,
    diagnostics: targets.diagnostics,
  });
  const extraction = extractArticle(
    readingRoot,
    resource.identity,
    targets.ids,
    { excludedElements, figures: figureExtraction.byElement },
  );
  extraction.diagnostics.unshift(...targets.diagnostics);
  const parentIdentity = resource.discoveryEdge.startsWith("authored:")
    ? resource.discoveryEdge.slice("authored:".length)
    : undefined;
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
    figures: figureExtraction.figures,
    bibliography: bibliography.groups,
    plainText: readingArticleText(
      extraction.introductoryBlocks,
      extraction.sections,
    ),
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
