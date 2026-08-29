import type { RefObject } from "react";

import type { ReadingDerivative } from "./content";
import type { ReadingNavigation } from "./reading-navigation";
import { readingSceneOwnerFor } from "./reading-scene-topology";
import { scrollToPendingFragment } from "./reading-target-navigation";
import {
  type ReferenceIndex,
  referenceForPublisherAuthoredLink,
} from "./references";
import type { WorkspaceSceneTransition } from "./workspace-scene-transitions";

type Component = ReadingDerivative["components"][number];

export interface PublisherAuthoredLink {
  href: string;
  label: string;
}

export function createWorkspaceAuthoredNavigation({
  articleRef,
  component,
  navigation,
  notesIdentity,
  onLeaveReadingWorkspace,
  reading,
  referenceIndex,
  requestTransition,
  toolsScrollRef,
}: {
  articleRef: RefObject<HTMLElement | null>;
  component: ReadingDerivative["components"][number];
  navigation: ReadingNavigation;
  notesIdentity: string | undefined;
  onLeaveReadingWorkspace: (link: PublisherAuthoredLink) => void;
  reading: ReadingDerivative;
  referenceIndex: ReferenceIndex;
  requestTransition: (transition: WorkspaceSceneTransition) => boolean;
  toolsScrollRef: RefObject<HTMLElement | null>;
}) {
  return {
    open(
      from: ReadingDerivative["components"][number],
      href: string,
      label: string,
    ) {
      const resolution = resolvePublisherAuthoredLink(reading, from, href);
      if (resolution.kind === "ambiguous") {
        return requestTransition({
          kind: "unavailable",
          reason: "target-unavailable",
          targetDescription: label,
        });
      }
      if (resolution.kind === "captured") {
        return requestTransition(
          capturedAuthoredTransition({
            articleRef,
            component,
            from,
            label,
            navigation,
            notesIdentity,
            referenceIndex,
            target: resolution.target,
            toolsScrollRef,
          }),
        );
      }
      if (resolution.kind === "external") {
        onLeaveReadingWorkspace({ href: resolution.href, label });
        return true;
      }
      return false;
    },
  };
}

function capturedAuthoredTransition({
  articleRef,
  component,
  from,
  label,
  navigation,
  notesIdentity,
  referenceIndex,
  target,
  toolsScrollRef,
}: {
  articleRef: RefObject<HTMLElement | null>;
  component: Component;
  from: Component;
  label: string;
  navigation: ReadingNavigation;
  notesIdentity: string | undefined;
  referenceIndex: ReferenceIndex;
  target: { component: Component; fragment?: string };
  toolsScrollRef: RefObject<HTMLElement | null>;
}): WorkspaceSceneTransition {
  if (
    target.fragment &&
    !componentHasFragment(target.component, target.fragment)
  ) {
    return {
      kind: "unavailable",
      reason: "target-unavailable",
      targetDescription: `${target.component.label} passage ${target.fragment}`,
    };
  }
  const sceneTarget = target.fragment
    ? `fragment:${target.fragment}`
    : "component";
  const reference = referenceForPublisherAuthoredLink(
    referenceIndex,
    target,
    label,
  );
  if (
    reference &&
    readingSceneOwnerFor(target.component) !== "publisher-note"
  ) {
    return { kind: "reference", reference };
  }
  if (target.component.identity === component.identity) {
    return {
      activate: () => {
        if (!target.fragment) return;
        scrollToPendingFragment(
          { current: target.fragment },
          {
            cause: "pending-fragment",
            highlight: true,
            navigation,
            target: `scene:${target.component.identity}:${sceneTarget}`,
            targetRoot: articleRef,
          },
        );
      },
      ...(target.fragment ? { fragment: target.fragment } : {}),
      kind: "authored-passage",
      sceneIdentity: target.component.identity,
      targetDescription: target.fragment
        ? `${target.component.label} passage ${target.fragment}`
        : target.component.label,
    };
  }
  if (
    target.fragment &&
    readingSceneOwnerFor(target.component) === "publisher-note" &&
    target.component.identity === notesIdentity
  ) {
    return {
      activate: () =>
        scrollToPendingFragment(
          { current: target.fragment },
          {
            cause: "pending-fragment",
            container: toolsScrollRef,
            highlight: true,
            navigation,
            target: `scene:${target.component.identity}:${sceneTarget}`,
            targetRoot: toolsScrollRef,
          },
        ),
      fragment: target.fragment,
      kind: "authored-passage",
      sceneIdentity: target.component.identity,
      targetDescription: `${target.component.label} passage ${target.fragment}`,
    };
  }
  return {
    cause:
      readingSceneOwnerFor(target.component) === "publisher-note"
        ? "publisher-note-navigation"
        : "component-transition",
    ...(target.fragment ? { fragment: target.fragment } : {}),
    kind: "authored-scene",
    originOwner: readingSceneOwnerFor(from),
    sceneIdentity: target.component.identity,
    targetDescription: target.component.label,
  };
}

export function authoredTarget(
  reading: ReadingDerivative,
  from: ReadingDerivative["components"][number],
  href: string,
) {
  const resolution = resolvePublisherAuthoredLink(reading, from, href);
  return resolution.kind === "captured" ? resolution.target : undefined;
}

function resolvePublisherAuthoredLink(
  reading: ReadingDerivative,
  from: ReadingDerivative["components"][number],
  href: string,
) {
  try {
    const url = new URL(href, from.finalUrl);
    const components = reading.components.filter((candidate) =>
      [candidate.requestedUrl, candidate.finalUrl].some(
        (value) =>
          comparableComponentUrl(value) === comparableComponentUrl(url),
      ),
    );
    if (components.length > 1) return { kind: "ambiguous" } as const;
    const component = components[0];
    if (!component) return { href: url.href, kind: "external" } as const;
    return {
      kind: "captured",
      target: { component, fragment: fragmentFromUrl(url) },
    } as const;
  } catch {
    return { kind: "malformed" } as const;
  }
}

export function componentHasFragment(
  component: ReadingDerivative["components"][number],
  fragment: string,
) {
  const ids = new Set<string>(component.figures.map((figure) => figure.id));
  const visitInlines = (
    values: ReadingDerivative["components"][number]["sections"][number]["title"],
  ) => {
    for (const value of values) {
      if (value.kind === "anchor") ids.add(value.id);
      if ("children" in value) visitInlines(value.children);
    }
  };
  const visitBlocks = (blocks: typeof component.introductoryBlocks) => {
    for (const block of blocks) visitBlock(block);
  };
  const visitBlock = (block: (typeof component.introductoryBlocks)[number]) => {
    if (block.kind === "statement") {
      visitInlines(block.label);
      visitInlines(block.body);
      return;
    }
    if (block.kind === "list") {
      for (const item of block.items) visitInlines(item);
      return;
    }
    if (block.kind === "table") {
      visitInlines(block.caption);
      for (const row of [...block.head, ...block.body])
        for (const cell of row.cells) visitInlines(cell);
      return;
    }
    if (block.kind === "figure") {
      ids.add(block.figure.id);
      visitInlines(block.figure.caption);
      visitInlines(block.figure.description.text);
      return;
    }
    if (block.kind !== "diagnostic") visitInlines(block.children);
  };
  const visitSections = (sections: typeof component.sections) => {
    for (const section of sections) {
      ids.add(section.id);
      visitInlines(section.title);
      visitBlocks(section.blocks);
      visitSections(section.children);
    }
  };
  visitBlocks(component.introductoryBlocks);
  visitSections(component.sections);
  return ids.has(fragment);
}

function comparableComponentUrl(value: string | URL) {
  const url = new URL(value);
  url.hash = "";
  url.search = "";
  url.pathname = url.pathname
    .replace(/(?:\/index)?\.html$/, "")
    .replace(/\/$/, "");
  return url.href;
}

function fragmentFromUrl(url: URL) {
  if (!url.hash) return undefined;
  try {
    return decodeURIComponent(url.hash.slice(1));
  } catch {
    return url.hash.slice(1);
  }
}
