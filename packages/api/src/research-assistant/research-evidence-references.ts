import {
  type AuthoredTargetInput,
  authoredTargetSelectionEquals,
} from "../authored-targets/authored-target";
import type { EvidenceComponent } from "./evidence-resolution";
import type { AliasedResearchPassageReference } from "./research-thread-contract";

export interface AdmittedEvidenceReference {
  id: string;
  componentIdentity: string;
  selection: AuthoredTargetInput;
}

/**
 * Commit-time revalidation of every persisted reference: it must match the
 * admitted evidence byte-for-byte and still resolve against the active
 * Reading Derivative.
 */
export function createReferenceValidator({
  components,
  isExpired,
  currentDerivativeId,
  activeDerivativeId,
  admittedReference,
}: {
  components: EvidenceComponent[];
  isExpired: () => boolean;
  currentDerivativeId?: () => Promise<string | undefined>;
  activeDerivativeId: () => string;
  admittedReference: (alias: string) => AdmittedEvidenceReference | undefined;
}) {
  return async (references: AliasedResearchPassageReference[]) => {
    if (isExpired()) return false;
    if (
      currentDerivativeId &&
      (await currentDerivativeId()) !== activeDerivativeId()
    )
      return false;
    return references.every((reference) => {
      const admitted = admittedReference(reference.evidenceAlias);
      const component = components.find(
        ({ identity }) => identity === reference.componentIdentity,
      );
      return (
        admitted?.id === reference.id &&
        admitted.componentIdentity === reference.componentIdentity &&
        authoredTargetSelectionEquals(
          admitted.selection,
          reference.selection,
        ) &&
        component?.plainText.slice(
          reference.selection.normalizedStartOffset,
          reference.selection.normalizedEndOffset,
        ) === reference.selection.exactText
      );
    });
  };
}
