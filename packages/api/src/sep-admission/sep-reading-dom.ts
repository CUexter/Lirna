import type { DefaultTreeAdapterTypes } from "parse5";

export type HtmlElement = DefaultTreeAdapterTypes.Element;
export type HtmlNode = DefaultTreeAdapterTypes.Node;

export const ignoredElements = new Set([
  "script",
  "style",
  "template",
  "noscript",
]);

export function attribute(
  element: HtmlElement,
  name: string,
): string | undefined {
  return element.attrs.find((attribute) => attribute.name === name)?.value;
}

export function hasClass(element: HtmlElement, className: string) {
  return (attribute(element, "class") ?? "").split(/\s+/).includes(className);
}

export function elementId(element: HtmlElement): string | undefined {
  return (
    attribute(element, "id") ??
    (element.tagName === "a" ? attribute(element, "name") : undefined)
  );
}

export function findElement(
  node: HtmlNode,
  tagName: string,
): HtmlElement | undefined {
  if ("tagName" in node && node.tagName === tagName) return node;
  return "childNodes" in node
    ? node.childNodes.map((child) => findElement(child, tagName)).find(Boolean)
    : undefined;
}

export function findElementById(
  root: HtmlNode,
  id: string,
): HtmlElement | undefined {
  return descendants(root).find((element) => elementId(element) === id);
}

export function childElements(node: HtmlNode | undefined): HtmlElement[] {
  return node && "childNodes" in node
    ? node.childNodes.filter(
        (child): child is HtmlElement => "tagName" in child,
      )
    : [];
}

export function descendants(node: HtmlNode | undefined): HtmlElement[] {
  return childElements(node).flatMap((child) => [child, ...descendants(child)]);
}

export function textContent(node: HtmlNode): string {
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

export function nestedAnchorId(element: HtmlElement): string | undefined {
  const anchor = descendants(element).find(
    (child) => child.tagName === "a" && elementId(child),
  );
  return anchor ? elementId(anchor) : undefined;
}

export function isStandaloneAnchor(element: HtmlElement) {
  return (
    element.tagName === "a" &&
    Boolean(elementId(element)) &&
    textContent(element) === ""
  );
}

export function ancestorsContain(
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
