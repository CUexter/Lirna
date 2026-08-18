import { useMutation, useQuery } from "@tanstack/react-query";

import { queryClient, trpc } from "@/utils/trpc";
import type { Annotation } from "./annotation-dom-utils";

export interface AnnotationInput {
  sourceId: string;
  stateId: string;
}

export function useAnnotationQueries({ sourceId, stateId }: AnnotationInput) {
  const input: AnnotationInput = { sourceId, stateId };
  const annotationsQuery = useQuery(trpc.annotations.list.queryOptions(input));
  const annotations: Annotation[] = annotationsQuery.data ?? [];

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: trpc.annotations.list.queryOptions(input).queryKey,
    });

  const create = useMutation(trpc.annotations.create.mutationOptions());
  const update = useMutation(trpc.annotations.update.mutationOptions());
  const remove = useMutation(trpc.annotations.delete.mutationOptions());

  const pending = create.isPending || update.isPending || remove.isPending;
  const error = create.error ?? update.error ?? remove.error;

  return {
    annotations,
    input,
    create,
    update,
    remove,
    pending,
    error,
    refresh,
  };
}

export type AnnotationQueries = ReturnType<typeof useAnnotationQueries>;
