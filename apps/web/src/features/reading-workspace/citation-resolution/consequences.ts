import type { CitationResolution } from "../annotations/domUtils";

declare const citationResolutionKeyBrand: unique symbol;
export type CitationResolutionKey = string & {
  readonly [citationResolutionKeyBrand]: true;
};

export interface ConfirmedCitationResolutionConsequence {
  key: CitationResolutionKey;
  resolution?: CitationResolution;
  sequence: number;
}

export function citationResolutionKey({
  componentIdentity,
  mentionId,
}: {
  componentIdentity: string;
  mentionId: string;
}) {
  return JSON.stringify([
    componentIdentity,
    mentionId,
  ]) as CitationResolutionKey;
}

export function projectCitationResolutionConsequences(
  resolutions: CitationResolution[],
  consequences: ConfirmedCitationResolutionConsequence[],
) {
  const replaced = new Set(consequences.map((item) => item.key));
  return [
    ...resolutions.filter(
      (resolution) => !replaced.has(citationResolutionKey(resolution)),
    ),
    ...consequences.flatMap((item) =>
      item.resolution ? [item.resolution] : [],
    ),
  ];
}

export function sameCitationResolutionTarget(
  left: { derivativeId: string; sourceId: string; stateId: string },
  right: { derivativeId: string; sourceId: string; stateId: string },
) {
  return (
    left.sourceId === right.sourceId &&
    left.stateId === right.stateId &&
    left.derivativeId === right.derivativeId
  );
}
