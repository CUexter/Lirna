import { useState } from "react";

import type { ReadingDerivative } from "./content";

export function useCitationOpening(
  component: ReadingDerivative["components"][number],
  components: ReadingDerivative["components"],
  mainComponentIdentity: string,
  openCitation: (entryId: string | undefined, mentionId: string) => void,
) {
  const [citationComponentIdentity, setCitationComponentIdentity] =
    useState<string>();
  const openCitationFrom = (
    citationComponent: ReadingDerivative["components"][number],
    entryId: string | undefined,
    mentionId: string,
  ) => {
    const bibliographyComponent = entryId
      ? citationComponent.bibliography.some((group) =>
          group.entries.some((entry) => entry.id === entryId),
        )
        ? citationComponent
        : components.find(
            (candidate) => candidate.identity === mainComponentIdentity,
          )
      : undefined;
    setCitationComponentIdentity(
      bibliographyComponent?.identity ?? citationComponent.identity,
    );
    openCitation(entryId, mentionId);
  };
  return {
    citationComponentIdentity,
    openCitationFrom,
    openCurrentCitation: (entryId: string | undefined, mentionId: string) =>
      openCitationFrom(component, entryId, mentionId),
  };
}
