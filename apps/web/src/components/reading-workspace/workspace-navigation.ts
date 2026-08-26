import { authoredTarget, componentHasFragment } from "./authored-navigation";
import type { SepReadingData } from "./content";
import {
  type ReadingSceneTopology,
  resolveReadingSceneDestination,
} from "./reading-scene-topology";
import {
  type ReadingReference,
  type ReferenceIndex,
  referenceForAuthoredLink,
} from "./references";

export function navigateAuthoredLink({
  from,
  href,
  label,
  navigateScene,
  onUnavailable,
  openReference,
  reading,
  referenceIndex,
  topology,
}: {
  from: SepReadingData["components"][number];
  href: string;
  label: string;
  navigateScene: (options: {
    destination: Extract<
      ReturnType<typeof resolveReadingSceneDestination>,
      { movement: "move" }
    >;
    from: SepReadingData["components"][number];
    fragment?: string;
  }) => boolean;
  onUnavailable: (target: string) => void;
  openReference: (reference: ReadingReference) => void;
  reading: SepReadingData;
  referenceIndex: ReferenceIndex;
  topology: ReadingSceneTopology;
}) {
  const target = authoredTarget(reading, from, href);
  if (!target) return false;
  if (
    target.fragment &&
    !componentHasFragment(target.component, target.fragment)
  ) {
    onUnavailable(`${target.component.label} passage ${target.fragment}`);
    return true;
  }
  const destination = resolveReadingSceneDestination(topology, {
    sceneIdentity: target.component.identity,
    target: target.fragment ? `fragment:${target.fragment}` : "component",
  });
  if (destination.movement === "none") {
    onUnavailable(target.component.label);
    return true;
  }
  const authoredReference = referenceForAuthoredLink(
    referenceIndex,
    target,
    label,
    topology,
  );
  if (authoredReference && destination.owner !== "publisher-note") {
    openReference(authoredReference);
    return true;
  }
  return navigateScene({ destination, from, fragment: target.fragment });
}
