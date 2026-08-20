import { Badge } from "@lirna/ui/components/badge";
import { buttonVariants } from "@lirna/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BookOpenIcon, PlusIcon } from "lucide-react";

import { library } from "@/clients/library";

export const Route = createFileRoute("/sources/")({
  component: RouteComponent,
});

function RouteComponent() {
  const sources = useQuery(library.sources.list.queryOptions({ input: {} }));

  if (sources.isPending) {
    return <main className="p-6 text-muted-foreground">Loading Sources…</main>;
  }
  if (sources.isError) {
    return (
      <main className="p-6">
        <h1 className="font-serif text-3xl">Source library unavailable</h1>
        <p className="mt-2 text-destructive" role="alert">
          {sources.error.message}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-full bg-background">
      <header className="border-b px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        <div className="mx-auto flex max-w-5xl items-end justify-between gap-6">
          <div>
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
              Knowledge · Sources
            </p>
            <h1 className="mt-2 font-serif text-4xl tracking-tight">
              Your library
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              Admitted publications and the immutable Source states you can
              read.
            </p>
          </div>
          <Link
            className={buttonVariants({ size: "sm" })}
            to="/sources/admission"
          >
            <PlusIcon data-icon="inline-start" />
            Add Source
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
        {sources.data.length === 0 ? <EmptyLibrary /> : null}
        <section
          aria-label="Admitted Sources"
          className="grid gap-4 md:grid-cols-2"
        >
          {sources.data.map((source) => {
            const currentState = source.states[0];
            return (
              <Card key={source.id} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">SEP</Badge>
                    <span className="text-muted-foreground text-xs">
                      {source.states.length}{" "}
                      {source.states.length === 1 ? "state" : "states"}
                    </span>
                  </div>
                  <CardTitle className="font-serif text-2xl">
                    {source.title}
                  </CardTitle>
                  <CardDescription>
                    Admitted {formatDate(source.admittedAt)}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="mt-auto flex-wrap gap-2">
                  {currentState ? (
                    <Link
                      className={buttonVariants({ size: "sm" })}
                      params={{ sourceId: source.id, stateId: currentState.id }}
                      to="/sources/$sourceId/$stateId"
                    >
                      <BookOpenIcon data-icon="inline-start" />
                      Open reading workspace
                    </Link>
                  ) : null}
                  {source.states.length > 1 ? (
                    <span className="text-muted-foreground text-xs">
                      Latest state · {formatState(currentState?.observationKey)}
                    </span>
                  ) : null}
                </CardFooter>
              </Card>
            );
          })}
        </section>
      </div>
    </main>
  );
}

function EmptyLibrary() {
  return (
    <Card className="mb-4 border-dashed">
      <CardHeader>
        <CardTitle className="font-serif text-2xl">No Sources yet</CardTitle>
        <CardDescription>
          Admit a publication to make it available in your reading library.
        </CardDescription>
      </CardHeader>
      <CardFooter>
        <Link
          className={buttonVariants({ variant: "outline" })}
          to="/sources/admission"
        >
          Add your first Source
        </Link>
      </CardFooter>
    </Card>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

function formatState(value: string | undefined) {
  return value === "recommended-archive" ? "recommended archive" : "active";
}
