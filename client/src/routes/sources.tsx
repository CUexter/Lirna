import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { admitTextSource, readAuthoritativeEvidence, readSource } from "@/lib/sources";

const fieldClass = "mt-2 w-full rounded-md border border-input bg-card px-3 py-2 text-foreground";

export function SourcesRoute() {
  const navigate = useNavigate();
  const admission = useMutation({ mutationFn: admitTextSource });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const source = await admission.mutateAsync({
      title: String(form.get("title")),
      text: String(form.get("text")),
      rightsBasis: String(form.get("rightsBasis")),
      sensitivityLevel: String(form.get("sensitivityLevel")),
    });
    await navigate({ to: "/sources/$sourceId", params: { sourceId: source.id } });
  }

  return (
    <main className="mx-auto w-[min(48rem,calc(100%-2rem))] py-12 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Sources</p>
      <h1 className="mt-2 text-4xl tracking-tight sm:text-5xl">Admit a text publication</h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Admission is a deliberate library commitment. Choose the policy for this exact Source state.
      </p>
      <form onSubmit={submit} className="mt-10 grid gap-6 border-t border-border pt-8">
        <label className="text-sm font-semibold">Title
          <input className={fieldClass} name="title" required maxLength={300} />
        </label>
        <label className="text-sm font-semibold">Publication text
          <Textarea className="mt-2" name="text" required maxLength={12_000} />
        </label>
        <div className="grid gap-6 sm:grid-cols-2">
          <label className="text-sm font-semibold">Rights basis
            <select className={fieldClass} name="rightsBasis" defaultValue="" required>
              <option value="" disabled>Select a basis</option>
              <option value="owned">Nathan-created or owned</option>
              <option value="lawfully-acquired">Lawfully acquired for personal use</option>
              <option value="publicly-accessible">Publicly accessible</option>
              <option value="explicitly-licensed">Explicitly licensed</option>
              <option value="reference-only">Reference-only</option>
              <option value="inaccessible">Inaccessible</option>
            </select>
          </label>
          <label className="text-sm font-semibold">Sensitivity level
            <select className={fieldClass} name="sensitivityLevel" defaultValue="ordinary-cloud" required>
              <option value="ordinary-cloud">Ordinary cloud</option>
              <option value="restricted-cloud">Restricted cloud</option>
              <option value="local-only">Local only</option>
            </select>
          </label>
        </div>
        <div>
          <Button type="submit" disabled={admission.isPending}>Admit Source</Button>
          {admission.error ? <p className="mt-3 text-sm text-destructive">{admission.error.message}</p> : null}
        </div>
      </form>
    </main>
  );
}

export function SourceReaderRoute({ sourceId }: { sourceId: string }) {
  const source = useQuery({ queryKey: ["source", sourceId], queryFn: () => readSource(sourceId) });
  const [evidenceRequested, setEvidenceRequested] = useState(false);
  const evidence = useQuery({
    queryKey: ["source", sourceId, "evidence"],
    queryFn: () => readAuthoritativeEvidence(sourceId),
    enabled: evidenceRequested,
  });
  if (source.isPending) return <main className="p-8">Opening Source...</main>;
  if (source.error) return <main className="p-8 text-destructive">{source.error.message}</main>;

  return (
    <main className="mx-auto w-[min(56rem,calc(100%-2rem))] py-12 sm:py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Normalized reading</p>
      <h1 className="mt-2 text-4xl tracking-tight sm:text-5xl">{source.data.title}</h1>
      <article data-normalized-text className="mt-10 max-w-[68ch] whitespace-pre-line text-lg leading-8">
        {source.data.state.normalizedText}
      </article>
      <aside className="mt-12 border-t border-border pt-6">
        <Button variant="secondary" onClick={() => setEvidenceRequested(true)}>
          View authoritative evidence
        </Button>
        {evidence.data ? (
          <pre data-authoritative-evidence className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-md border border-border bg-card p-5 text-sm">
            {evidence.data}
          </pre>
        ) : null}
      </aside>
    </main>
  );
}
