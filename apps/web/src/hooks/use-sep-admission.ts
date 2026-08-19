import { useMutation } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

import type {
  SepAdmissionPreviewData,
  SepAdmissionPreviewProps,
} from "@/components/sep-admission-preview";
import { inquiry } from "@/clients/inquiry";

function validateSubmittedUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      ? undefined
      : "Enter an HTTPS Stanford Encyclopedia of Philosophy URL.";
  } catch {
    return "Enter a complete URL, including https://.";
  }
}

export type UseSepAdmission = {
  url: string;
  validationError?: string;
  submitPending: boolean;
  submitErrorMessage?: string;
  onUrlChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  preview?: SepAdmissionPreviewData;
  admission: SepAdmissionPreviewProps["admission"];
  lifecycle: SepAdmissionPreviewProps["lifecycle"];
};

export function useSepAdmission(): UseSepAdmission {
  const [url, setUrl] = useState("");
  const [validationError, setValidationError] = useState<string>();
  const [preview, setPreview] = useState<SepAdmissionPreviewData>();
  const [actionError, setActionError] = useState<string>();

  const submitPreview = useMutation({
    ...inquiry.sepAdmission.submit.mutationOptions(),
    onSuccess(data) {
      admitPreview.reset();
      setPreview(data);
      setActionError(undefined);
    },
  });
  const extendPreview = useMutation({
    ...inquiry.sepAdmission.extend.mutationOptions(),
    onSuccess(data) {
      setPreview(data);
      setActionError(undefined);
    },
    onError(error) {
      setActionError(error.message);
    },
  });
  const deletePreview = useMutation({
    ...inquiry.sepAdmission.delete.mutationOptions(),
    onSuccess() {
      admitPreview.reset();
      setPreview(undefined);
      setUrl("");
      setActionError(undefined);
      submitPreview.reset();
    },
    onError(error) {
      setActionError(error.message);
    },
  });
  const retryPreview = useMutation({
    ...inquiry.sepAdmission.retry.mutationOptions(),
    onSuccess(data) {
      admitPreview.reset();
      setPreview(data);
      setActionError(undefined);
    },
    async onError(error) {
      setActionError(error.message);
      if (!preview) return;
      try {
        const refreshed = await inquiry.sepAdmission.get.call({
          previewId: preview.id,
        });
        setPreview(refreshed);
      } catch {
        // Preserve the visible capture error when refreshing state also fails.
      }
    },
  });
  const admitPreview = useMutation({
    ...inquiry.sepAdmission.admit.mutationOptions(),
    onSuccess() {
      setActionError(undefined);
    },
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateSubmittedUrl(url);
    setValidationError(error);
    if (error) {
      return;
    }
    submitPreview.mutate({ url });
  }

  function onUrlChange(value: string) {
    setUrl(value);
    setValidationError(undefined);
    submitPreview.reset();
  }

  const admission: SepAdmissionPreviewProps["admission"] = {
    pending: admitPreview.isPending,
    result: admitPreview.data,
    error: admitPreview.error?.message,
    onAdmit: (observationKeys) => {
      if (!preview) return;
      admitPreview.mutate({ previewId: preview.id, observationKeys });
    },
  };

  const lifecycle: SepAdmissionPreviewProps["lifecycle"] = {
    extendPending: extendPreview.isPending,
    deletePending: deletePreview.isPending,
    retryPending: retryPreview.isPending,
    error: actionError,
    onExtend: () => {
      if (!preview) return;
      extendPreview.mutate({ previewId: preview.id });
    },
    onDelete: () => {
      if (!preview) return;
      deletePreview.mutate({ previewId: preview.id });
    },
    onRetry: () => {
      if (!preview) return;
      retryPreview.mutate({ previewId: preview.id });
    },
  };

  return {
    url,
    validationError,
    submitPending: submitPreview.isPending,
    submitErrorMessage: submitPreview.error?.message,
    onUrlChange,
    onSubmit: handleSubmit,
    preview,
    admission,
    lifecycle,
  };
}
