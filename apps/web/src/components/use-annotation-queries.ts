import { useMutation, useQuery } from "@tanstack/react-query";

import { library } from "@/clients/library";
import { queryClient } from "@/utils/query-client";
import type { Annotation } from "./annotation-dom-utils";

export interface AnnotationInput {
  sourceId: string;
  stateId: string;
}

export function useAnnotationQueries({ sourceId, stateId }: AnnotationInput) {
  const input: AnnotationInput = { sourceId, stateId };
  const annotationsQuery = useQuery(
    library.annotations.list.queryOptions({ input }),
  );
  const annotations: Annotation[] = annotationsQuery.data ?? [];

  const refresh = () =>
    queryClient.invalidateQueries({
      queryKey: library.annotations.list.key({ input }),
    });

  const create = useMutation(library.annotations.create.mutationOptions());
  const update = useMutation(library.annotations.update.mutationOptions());
  const remove = useMutation(library.annotations.delete.mutationOptions());

  const pending = create.isPending || update.isPending || remove.isPending;
  const error =
    create.error ?? update.error ?? remove.error ?? annotationsQuery.error;

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
