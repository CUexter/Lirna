import { buttonVariants } from "@lirna/ui/components/button";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";

export function LibraryHeader() {
  return (
    <header className="border-b px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
            Knowledge · Sources
          </p>
          <h1 className="mt-2 font-serif text-4xl tracking-tight">
            Your library
          </h1>
          <p className="mt-3 max-w-xl text-muted-foreground leading-relaxed">
            A quiet shelf for the publications you have chosen to study. Open a
            Source to read its latest state or revisit an earlier capture.
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
  );
}
