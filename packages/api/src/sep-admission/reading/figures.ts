import type { ReadingDiagnostic, ReadingFigure } from "./contract";
import {
  attribute,
  childElements,
  descendants,
  elementId,
  type HtmlElement,
  type HtmlNode,
  hasClass,
} from "./dom";
import {
  diagnostic,
  type InlineContext,
  inlineNodes,
  textInline,
} from "./inline";

const safeImageMediaType = /^image\/(?:avif|gif|jpeg|png|webp)(?:;|$)/i;

/**
 * The minimal capture-resource shape figure extraction relies on. The
 * orchestrator's richer SepReadingResource is structurally assignable, so this
 * module stays decoupled from the capture contract.
 */
interface FigureResource {
  identity: string;
  requestedUrl: string;
  finalUrl: string;
  mediaType?: string;
  body: Buffer;
}

export function extractFigures({
  root,
  resource,
  resources,
  ids,
  diagnostics,
}: {
  root: HtmlNode | undefined;
  resource: FigureResource;
  resources: FigureResource[];
  ids: Set<string>;
  diagnostics: ReadingDiagnostic[];
}): {
  figures: ReadingFigure[];
  byElement: Map<HtmlElement, ReadingFigure>;
} {
  let count = 0;
  const byElement = new Map<HtmlElement, ReadingFigure>();
  const elements = descendants(root);
  const containers = elements.filter(
    (element) =>
      element.tagName === "figure" ||
      (element.tagName === "div" && hasClass(element, "figure")),
  );
  const nestedImages = new Set(
    containers.flatMap((container) =>
      descendants(container).filter((element) => element.tagName === "img"),
    ),
  );
  const figures = elements
    .filter(
      (element) =>
        containers.includes(element) ||
        (element.tagName === "img" && !nestedImages.has(element)),
    )
    .flatMap((element) => {
      count += 1;
      const figure = createFigure({
        element,
        fallbackId: `figure-${count}`,
        resource,
        resources,
        ids,
        diagnostics,
      });
      if (!figure) return [];
      byElement.set(element, figure);
      return [figure];
    });
  return { figures, byElement };
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
  resource: FigureResource;
  resources: FigureResource[];
  ids: Set<string>;
  diagnostics: ReadingDiagnostic[];
}): ReadingFigure | undefined {
  const image = figureImage(element);
  const asset =
    image && resourceForAttribute(image, "src", resource, resources);
  if (!isSemanticFigure(element, asset)) return undefined;
  const descriptionResource =
    image && resourceForAttribute(image, "longdesc", resource, resources);
  const figureDiagnostics = missingFigureDiagnostics({
    element,
    image,
    asset,
    descriptionResource,
    resource,
  });
  diagnostics.push(...figureDiagnostics);
  const caption = figureCaption(element, {
    componentIdentity: resource.identity,
    ids,
    diagnostics,
  });
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

function retainedImageDataUrl(resource: FigureResource | undefined) {
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

function figureCaption(element: HtmlElement, context: InlineContext) {
  const caption =
    element.tagName === "figure"
      ? childElements(element).find((child) => child.tagName === "figcaption")
      : element.tagName === "div" && hasClass(element, "figure")
        ? descendants(element).find(
            (child) =>
              child.tagName === "p" &&
              !descendants(child).some((nested) => nested.tagName === "img"),
          )
        : undefined;
  return caption ? inlineNodes(caption, context) : [];
}

function missingFigureDiagnostics({
  element,
  image,
  asset,
  descriptionResource,
  resource,
}: {
  element: HtmlElement;
  image: HtmlElement | undefined;
  asset: FigureResource | undefined;
  descriptionResource: FigureResource | undefined;
  resource: FigureResource;
}) {
  if (!image) return [];
  const diagnostics: ReadingDiagnostic[] = [];
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
  if (attribute(image, "src") && !asset) {
    diagnostics.push(
      diagnostic(
        resource.identity,
        element,
        "missing-semantic-asset",
        "The authored semantic figure asset was not retained in this Source state.",
      ),
    );
  } else if (asset && !retainedImageDataUrl(asset)) {
    diagnostics.push(
      diagnostic(
        resource.identity,
        element,
        "unsupported-semantic-asset",
        "The retained semantic figure asset uses an unsupported media type.",
      ),
    );
  }
  return diagnostics;
}

function isDecorativeImage(image: HtmlElement) {
  return (
    attribute(image, "alt") === "" ||
    attribute(image, "role")?.toLowerCase() === "presentation" ||
    attribute(image, "aria-hidden")?.toLowerCase() === "true"
  );
}

function isPublisherIcon(image: HtmlElement) {
  return /\bicon\s*$/i.test(attribute(image, "alt") ?? "");
}

function isSemanticFigure(
  element: HtmlElement,
  asset: FigureResource | undefined,
) {
  if (element.tagName !== "img") return true;
  if (isDecorativeImage(element) || isPublisherIcon(element)) return false;
  return Boolean(
    asset ||
      attribute(element, "alt")?.trim() ||
      attribute(element, "longdesc")?.trim(),
  );
}

function resourceForAttribute(
  element: HtmlElement,
  name: string,
  resource: FigureResource,
  resources: FigureResource[],
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
