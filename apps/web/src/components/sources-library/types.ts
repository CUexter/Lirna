export type LibrarySource = {
  id: string;
  title: string;
  admittedAt: string;
  authors: string[];
  publisher: string;
  publicationHistory: string[];
  kind: "sep" | "legacy-sep-text";
  replacement?: { id: string; title: string; currentStateId: string };
  states: Array<{
    id: string;
    sequence: number;
    observationKey: string;
    canonicalUrl?: string;
    title?: string;
    publisher?: string;
    admittedAt?: string;
  }>;
};
