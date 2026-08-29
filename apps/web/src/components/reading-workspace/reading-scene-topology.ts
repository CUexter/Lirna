import type { ReadingDerivative } from "./content";
import type { ReadingScrollOwner } from "./navigation-observations";

type SourceComponent = ReadingDerivative["components"][number];

export type ReadingScenePresentationRegion =
  | "article"
  | "reading-tools:supplementary";
export type ReadingSceneScrollOwner = Extract<
  ReadingScrollOwner,
  "article" | "publisher-note"
>;

export interface ReadingScene {
  childSceneIdentities: string[];
  componentIdentity: string;
  identity: string;
  nextSceneIdentity?: string;
  order: number;
  parentSceneIdentity?: string;
  presentationRegion: ReadingScenePresentationRegion;
  previousSceneIdentity?: string;
  scrollOwner: ReadingSceneScrollOwner;
}

export interface ReadingSceneTopology {
  mainSceneIdentity: string;
  scenes: ReadingScene[];
  unavailableSceneIdentities: string[];
}

export type ReadingSceneDestinationResult =
  | {
      movement: "move";
      owner: ReadingSceneScrollOwner;
      scene: ReadingScene;
      target: string;
    }
  | {
      movement: "none";
      reason:
        | "ambiguous-scene"
        | "malformed-destination"
        | "scene-unavailable"
        | "unknown-scene";
    };

export function createReadingSceneTopology(
  reading: ReadingDerivative,
): ReadingSceneTopology {
  const components = [...reading.components].sort(compareComponents);
  const identities = new Set(components.map((component) => component.identity));
  const unavailableSceneIdentities = new Set<string>();
  if (!identities.has(reading.mainComponent.identity)) {
    unavailableSceneIdentities.add(reading.mainComponent.identity);
  }
  for (const component of components) {
    if (component.parentIdentity && !identities.has(component.parentIdentity)) {
      unavailableSceneIdentities.add(component.parentIdentity);
      unavailableSceneIdentities.add(component.identity);
    }
  }
  let previousSize = -1;
  while (previousSize !== unavailableSceneIdentities.size) {
    previousSize = unavailableSceneIdentities.size;
    for (const component of components) {
      if (
        component.parentIdentity &&
        unavailableSceneIdentities.has(component.parentIdentity)
      ) {
        unavailableSceneIdentities.add(component.identity);
      }
    }
  }

  return {
    mainSceneIdentity: reading.mainComponent.identity,
    scenes: components.map((component) =>
      createReadingScene(component, components),
    ),
    unavailableSceneIdentities: [...unavailableSceneIdentities].sort(),
  };
}

export function resolveReadingSceneDestination(
  topology: ReadingSceneTopology,
  destination: unknown,
): ReadingSceneDestinationResult {
  if (!isReadingSceneDestination(destination)) {
    return { movement: "none", reason: "malformed-destination" };
  }
  const matches = topology.scenes.filter(
    (scene) => scene.identity === destination.sceneIdentity,
  );
  if (matches.length > 1) {
    return { movement: "none", reason: "ambiguous-scene" };
  }
  if (topology.unavailableSceneIdentities.includes(destination.sceneIdentity)) {
    return { movement: "none", reason: "scene-unavailable" };
  }
  const scene = matches[0];
  if (!scene) {
    return { movement: "none", reason: "unknown-scene" };
  }
  return {
    movement: "move",
    owner: scene.scrollOwner,
    scene,
    target: `scene:${scene.identity}:${destination.target}`,
  };
}

function createReadingScene(
  component: SourceComponent,
  components: SourceComponent[],
): ReadingScene {
  const presentation = scenePresentation(component);
  const siblings = components.filter(
    (candidate) =>
      candidate.parentIdentity === component.parentIdentity &&
      scenePresentation(candidate).presentationRegion ===
        presentation.presentationRegion,
  );
  const siblingIndex = siblings.indexOf(component);
  return {
    childSceneIdentities: components
      .filter((candidate) => candidate.parentIdentity === component.identity)
      .map((candidate) => candidate.identity),
    componentIdentity: component.identity,
    identity: component.identity,
    ...(siblings[siblingIndex + 1]
      ? { nextSceneIdentity: siblings[siblingIndex + 1]?.identity }
      : {}),
    order: component.order,
    ...(component.parentIdentity
      ? { parentSceneIdentity: component.parentIdentity }
      : {}),
    presentationRegion: presentation.presentationRegion,
    ...(siblings[siblingIndex - 1]
      ? { previousSceneIdentity: siblings[siblingIndex - 1]?.identity }
      : {}),
    scrollOwner: presentation.scrollOwner,
  };
}

function compareComponents(left: SourceComponent, right: SourceComponent) {
  return (
    left.order - right.order || left.identity.localeCompare(right.identity)
  );
}

function scenePresentation(component: SourceComponent): {
  presentationRegion: ReadingScenePresentationRegion;
  scrollOwner: ReadingSceneScrollOwner;
} {
  return readingSceneOwnerFor(component) === "publisher-note"
    ? {
        presentationRegion: "reading-tools:supplementary",
        scrollOwner: "publisher-note",
      }
    : { presentationRegion: "article", scrollOwner: "article" };
}

export function readingSceneOwnerFor(
  component: ReadingDerivative["components"][number],
): ReadingSceneScrollOwner {
  return component.role === "notes" ? "publisher-note" : "article";
}

function hasOnlyPrintableCharacters(value: string) {
  return [...value].every((character) => {
    const code = character.charCodeAt(0);
    return code > 31 && code !== 127;
  });
}

function isReadingSceneDestination(
  value: unknown,
): value is { sceneIdentity: string; target: string } {
  if (!value || typeof value !== "object") return false;
  const destination = value as Record<string, unknown>;
  const target = destination.target;
  return (
    typeof destination.sceneIdentity === "string" &&
    destination.sceneIdentity.length > 0 &&
    typeof target === "string" &&
    (target === "component" ||
      ["citation:", "fragment:", "reference:"].some(
        (prefix) => target.startsWith(prefix) && target.length > prefix.length,
      )) &&
    hasOnlyPrintableCharacters(target)
  );
}
