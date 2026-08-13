import { type FormEvent, useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useSyntheticOperation } from "@/lib/use-synthetic-operation";

const DEFAULT_FIXTURE = "A synthetic, non-sensitive fixture";

/**
 * The application shell's tracer view. It preserves the executable skeleton's
 * public behaviour — submit one synthetic fixture, observe the worker's result,
 * open the stored artifact — on the new React foundation.
 */
export function TracerRoute() {
  const fixtureId = useId();
  const [fixture, setFixture] = useState(DEFAULT_FIXTURE);
  const operation = useSyntheticOperation();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    operation.run(fixture);
  }

  const completed =
    operation.operation?.status === "completed" ? operation.operation.result : undefined;

  return (
    <main className="mx-auto w-[min(44rem,calc(100%-2rem))] py-[clamp(3rem,10vw,8rem)]">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
        Executable skeleton / synthetic data only
      </p>
      <h1 className="mt-2 mb-4 max-w-[12ch] text-5xl font-normal leading-[0.92] tracking-tight sm:text-6xl">
        Trace the whole system.
      </h1>
      <p className="max-w-xl leading-relaxed text-muted-foreground">
        Submit a non-sensitive fixture through Lirna's public control plane. PostgreSQL records it,
        the worker processes it, and replaceable adapters preserve the result.
      </p>

      <form onSubmit={onSubmit} className="mt-12 border-t border-border pt-6">
        <label
          htmlFor={fixtureId}
          className="mb-2 block text-sm font-semibold uppercase tracking-wide"
        >
          Synthetic fixture
        </label>
        <Textarea
          id={fixtureId}
          required
          maxLength={1000}
          value={fixture}
          onChange={(event) => setFixture(event.target.value)}
        />
        <div className="mt-3 flex items-center gap-4">
          <Button type="submit" disabled={operation.isRunning}>
            Run operation
          </Button>
          <span className="font-mono text-xs text-muted-foreground">
            Status: <strong data-operation-status>{operation.status}</strong>
          </span>
        </div>
        <div className="mt-5 min-h-6 text-sm" aria-live="polite">
          {completed ? (
            <a className="text-primary underline underline-offset-2" href={completed.artifactUrl}>
              Open the stored synthetic artifact
            </a>
          ) : operation.errorMessage ? (
            <span className="text-destructive">{operation.errorMessage}</span>
          ) : null}
        </div>
      </form>
    </main>
  );
}
