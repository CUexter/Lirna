export function ReadingEmptyState({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-md border border-dashed p-4 text-muted-foreground text-xs">
      {children}
    </p>
  );
}
