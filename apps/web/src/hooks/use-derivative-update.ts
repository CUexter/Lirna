import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { type InquiryOutputs, inquiry } from "@/clients/inquiry";

type Candidate = InquiryOutputs["sources"]["derivatives"]["generate"];
type ActivationPreview =
  InquiryOutputs["sources"]["derivatives"]["previewActivation"];

export function useDerivativeUpdate(sourceId: string, stateId: string) {
  const queryClient = useQueryClient();
  const stateKey = `${sourceId}:${stateId}`;
  const [generated, setGenerated] = useState<{
    stateKey: string;
    candidate: Candidate;
  }>();
  const generate = useMutation(
    inquiry.sources.derivatives.generate.mutationOptions({
      onSuccess: (candidate) => setGenerated({ stateKey, candidate }),
    }),
  );
  const activate = useMutation(
    inquiry.sources.derivatives.activate.mutationOptions({
      onSuccess: async () => {
        setGenerated(undefined);
        await queryClient.invalidateQueries({
          queryKey: inquiry.sources.readingWorkspace.key({
            input: { sourceId, stateId },
          }),
        });
      },
    }),
  );
  const preview = useMutation(
    inquiry.sources.derivatives.previewActivation.mutationOptions(),
  );
  return {
    candidate:
      generated?.stateKey === stateKey ? generated.candidate : undefined,
    generate: () => generate.mutate({ sourceId, stateId }),
    generateError: generate.error,
    generatePending: generate.isPending,
    previewActivation: (derivativeId: string) =>
      preview.mutateAsync({ sourceId, stateId, derivativeId }),
    activate: (
      derivativeId: string,
      reason: string,
      preview: ActivationPreview,
    ) =>
      activate.mutate({
        sourceId,
        stateId,
        derivativeId,
        reason,
        expectedBaselineSequence: preview.baselineSequence,
        expectedConsequences: preview.consequences,
      }),
    activateError: activate.error ?? preview.error,
    activatePending: activate.isPending || preview.isPending,
  };
}
