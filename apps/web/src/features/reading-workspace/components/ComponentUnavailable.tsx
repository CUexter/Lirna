import { Button } from "@lirna/ui/components/button";

export function ComponentUnavailable({
  componentIdentity,
  mainComponentIdentity,
  onComponentChange,
}: {
  componentIdentity: string | undefined;
  mainComponentIdentity: string;
  onComponentChange: (identity: string) => void;
}) {
  return (
    <main className="min-h-full bg-background px-4 py-16 sm:px-6">
      <div className="mx-auto max-w-xl rounded-md border p-6">
        <h1 className="font-serif text-2xl">Component unavailable</h1>
        <p className="mt-3 text-muted-foreground">
          This Source state does not contain the requested component:{" "}
          <code>{componentIdentity}</code>.
        </p>
        <Button
          className="mt-6"
          onClick={() => onComponentChange(mainComponentIdentity)}
          type="button"
        >
          Open main article
        </Button>
      </div>
    </main>
  );
}
