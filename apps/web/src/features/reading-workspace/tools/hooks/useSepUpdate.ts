import { useMutation } from "@tanstack/react-query";
import { useState } from "react";

import { inquiry } from "@/clients/inquiry";
import type {
  SepAdmissionPreviewData,
  SepAdmissionPreviewProps,
} from "@/features/source-admission/components/Preview";
import { formatServerError } from "@/infrastructure/server/error";

export function useSepUpdate(sourceId: string) {
  const [preview, setPreview] = useState<SepAdmissionPreviewData>();
  const check = useMutation({
    ...inquiry.sepAdmission.checkUpdate.mutationOptions(),
    onSuccess(data) {
      admit.reset();
      setPreview(data);
    },
  });
  const extend = useMutation({
    ...inquiry.sepAdmission.extend.mutationOptions(),
    onSuccess: setPreview,
  });
  const remove = useMutation({
    ...inquiry.sepAdmission.delete.mutationOptions(),
    onSuccess() {
      admit.reset();
      setPreview(undefined);
    },
  });
  const retry = useMutation({
    ...inquiry.sepAdmission.retry.mutationOptions(),
    onSuccess(data) {
      admit.reset();
      setPreview(data);
    },
  });
  const admit = useMutation(inquiry.sepAdmission.admit.mutationOptions());

  const admission: SepAdmissionPreviewProps["admission"] = {
    pending: admit.isPending,
    result: admit.data,
    error: admit.error ? formatServerError(admit.error) : undefined,
    onAdmit: (observationKeys) => {
      if (preview) admit.mutate({ previewId: preview.id, observationKeys });
    },
  };
  const lifecycle: SepAdmissionPreviewProps["lifecycle"] = {
    extendPending: extend.isPending,
    deletePending: remove.isPending,
    retryPending: retry.isPending,
    error: [extend.error, remove.error, retry.error].find(Boolean)
      ? formatServerError(
          [extend.error, remove.error, retry.error].find(Boolean) as Error,
        )
      : undefined,
    onExtend: () => preview && extend.mutate({ previewId: preview.id }),
    onDelete: () => preview && remove.mutate({ previewId: preview.id }),
    onRetry: () => preview && retry.mutate({ previewId: preview.id }),
  };

  return {
    preview,
    admission,
    lifecycle,
    checkPending: check.isPending,
    checkError: check.error ? formatServerError(check.error) : undefined,
    check: () => check.mutate({ sourceId }),
  };
}
