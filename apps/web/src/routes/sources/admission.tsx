import { Button, buttonVariants } from "@lirna/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import { Input } from "@lirna/ui/components/input";
import { Label } from "@lirna/ui/components/label";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";
import { z } from "zod";
import { SepAdmissionPreview } from "@/features/source-admission/components/Preview";
import { useSepAdmission } from "@/features/source-admission/hooks/useSepAdmission";
import { ServerErrorMessage } from "@/infrastructure/server/components/ErrorMessage";

export const Route = createFileRoute("/sources/admission")({
  validateSearch: z.object({ replacesSourceId: z.string().uuid().optional() }),
  component: RouteComponent,
});

function RouteComponent() {
  const { replacesSourceId } = Route.useSearch();
  const {
    url,
    validationError,
    submitPending,
    submitErrorMessage,
    onUrlChange,
    onSubmit,
    preview,
    admission,
    lifecycle,
  } = useSepAdmission(replacesSourceId);

  return (
    <main className="min-h-full bg-background">
      <header className="border-b px-4 sm:px-6 lg:px-10">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3">
          <Link
            className={buttonVariants({ size: "sm", variant: "ghost" })}
            to="/"
          >
            <ArrowLeftIcon data-icon="inline-start" />
            Back
          </Link>
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
            {replacesSourceId
              ? "Capture a related replacement"
              : "Preview an SEP Source"}
          </h1>
          <p className="text-muted-foreground text-sm leading-6">
            {replacesSourceId
              ? "The legacy Source remains unchanged. Admission records an explicit related replacement Source."
              : "Capture the publication identity, policy, and local cost before you decide whether to create a Source. Previews expire after seven days."}
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
            <form className="flex flex-col gap-4" onSubmit={onSubmit}>
              <div className="flex flex-col gap-2">
                <Label htmlFor="sep-url">SEP URL</Label>
                <Input
                  aria-describedby={
                    validationError || submitErrorMessage
                      ? "sep-url-error"
                      : "sep-url-description"
                  }
                  aria-invalid={Boolean(validationError || submitErrorMessage)}
                  disabled={submitPending}
                  id="sep-url"
                  inputMode="url"
                  onChange={(event) => onUrlChange(event.target.value)}
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
                {validationError ? (
                  <p
                    className="text-destructive text-sm"
                    id="sep-url-error"
                    role="alert"
                  >
                    {validationError}
                  </p>
                ) : submitErrorMessage ? (
                  <ServerErrorMessage
                    error={submitErrorMessage}
                    id="sep-url-error"
                  />
                ) : null}
              </div>
              <Button
                className="self-start"
                disabled={submitPending}
                type="submit"
              >
                <SearchIcon data-icon="inline-start" />
                {submitPending ? "Creating preview…" : "Create preview"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {preview ? (
          <SepAdmissionPreview
            admission={admission}
            lifecycle={lifecycle}
            preview={preview}
          />
        ) : null}
      </div>
    </main>
  );
}
