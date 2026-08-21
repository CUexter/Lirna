import type { ReadingDiagnostic, ReadingFigure } from "./sep-reading-contract";
import {
  ancestorsContain,
  attribute,
  childElements,
  descendants,
  elementId,
  type HtmlElement,
  type HtmlNode,
} from "./sep-reading-dom";
import {
  diagnostic,
  type InlineContext,
  inlineNodes,
  textInline,
} from "./sep-reading-inline";

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
      return figure ? [figure] : [];
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
  resource: FigureResource;
  resources: FigureResource[];
  ids: Set<string>;
  diagnostics: ReadingDiagnostic[];
}): ReadingFigure | undefined {
  const image = figureImage(element);
  const asset =
    image && resourceForAttribute(image, "src", resource, resources);
  if (element.tagName === "img" && !asset) return undefined;
  const descriptionResource =
    image && resourceForAttribute(image, "longdesc", resource, resources);
  const figureDiagnostics = missingFigureDiagnostics({
    image,
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
      : undefined;
  return caption ? inlineNodes(caption, context) : [];
}

function missingFigureDiagnostics({
  image,
  descriptionResource,
  resource,
}: {
  image: HtmlElement | undefined;
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
  return diagnostics;
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
