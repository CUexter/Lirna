import { Button } from "@lirna/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import { Input } from "@lirna/ui/components/input";
import { Label } from "@lirna/ui/components/label";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";
import { type FormEvent, useState } from "react";

import {
  SepAdmissionPreview,
  type SepAdmissionPreviewData,
} from "@/components/sep-admission-preview";
import { trpc, trpcClient } from "@/utils/trpc";

export const Route = createFileRoute("/sources/admission")({
  component: RouteComponent,
});

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

function RouteComponent() {
  const [url, setUrl] = useState("");
  const [validationError, setValidationError] = useState<string>();
  const [preview, setPreview] = useState<SepAdmissionPreviewData>();
  const [actionError, setActionError] = useState<string>();
  const submitPreview = useMutation({
    ...trpc.sepAdmission.submit.mutationOptions(),
    onSuccess(data) {
      admitPreview.reset();
      setPreview(data);
      setActionError(undefined);
    },
  });
  const extendPreview = useMutation({
    ...trpc.sepAdmission.extend.mutationOptions(),
    onSuccess(data) {
      setPreview(data);
      setActionError(undefined);
    },
    onError(error) {
      setActionError(error.message);
    },
  });
  const deletePreview = useMutation({
    ...trpc.sepAdmission.delete.mutationOptions(),
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
    ...trpc.sepAdmission.retry.mutationOptions(),
    onSuccess(data) {
      admitPreview.reset();
      setPreview(data);
      setActionError(undefined);
    },
    async onError(error) {
      setActionError(error.message);
      if (!preview) return;
      try {
        const refreshed = await trpcClient.sepAdmission.get.query({
          previewId: preview.id,
        });
        setPreview(refreshed);
      } catch {
        // Preserve the visible capture error when refreshing state also fails.
      }
    },
  });
  const admitPreview = useMutation({
    ...trpc.sepAdmission.admit.mutationOptions(),
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

  return (
    <main className="min-h-full bg-background">
      <header className="border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3">
          <Button render={<Link to="/" />} size="sm" variant="ghost">
            <ArrowLeftIcon data-icon="inline-start" />
            Back
          </Button>
          <span className="ml-auto font-semibold font-serif text-xl">
            Lirna
          </span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <div className="flex max-w-3xl flex-col gap-2">
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
            Sources · Admission
          </p>
          <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
            Preview an SEP Source
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            Capture the publication identity, policy, and local cost before you
            decide whether to create a Source. Previews expire after seven days.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="font-serif text-xl">SEP location</CardTitle>
            <CardDescription>
              Use an active entry, archived entry, or citation-information URL
              from plato.stanford.edu.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="sep-url">SEP URL</Label>
                <Input
                  aria-describedby={
                    validationError || submitPreview.error
                      ? "sep-url-error"
                      : "sep-url-description"
                  }
                  aria-invalid={Boolean(validationError || submitPreview.error)}
                  disabled={submitPreview.isPending}
                  id="sep-url"
                  inputMode="url"
                  onChange={(event) => {
                    setUrl(event.target.value);
                    setValidationError(undefined);
                    submitPreview.reset();
                  }}
                  placeholder="https://plato.stanford.edu/entries/.../"
                  type="text"
                  value={url}
                />
                <p
                  className="text-muted-foreground text-xs"
                  id="sep-url-description"
                >
                  Lirna validates every redirect and retains exact response
                  bytes locally for this temporary preview.
                </p>
                {validationError || submitPreview.error ? (
                  <p
                    className="text-destructive text-sm"
                    id="sep-url-error"
                    role="alert"
                  >
                    {validationError ?? submitPreview.error?.message}
                  </p>
                ) : null}
              </div>
              <Button
                className="self-start"
                disabled={submitPreview.isPending}
                type="submit"
              >
                <SearchIcon data-icon="inline-start" />
                {submitPreview.isPending
                  ? "Creating preview…"
                  : "Create preview"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {preview ? (
          <SepAdmissionPreview
            admission={{
              pending: admitPreview.isPending,
              result: admitPreview.data,
              error: admitPreview.error?.message,
              onAdmit: (observationKeys) =>
                admitPreview.mutate({ previewId: preview.id, observationKeys }),
            }}
            lifecycle={{
              extendPending: extendPreview.isPending,
              deletePending: deletePreview.isPending,
              retryPending: retryPreview.isPending,
              error: actionError,
              onExtend: () => extendPreview.mutate({ previewId: preview.id }),
              onDelete: () => deletePreview.mutate({ previewId: preview.id }),
              onRetry: () => retryPreview.mutate({ previewId: preview.id }),
            }}
            preview={preview}
          />
        ) : null}
      </div>
    </main>
  );
}
