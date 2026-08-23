export type LibrarySource = {
  id: string;
  title: string;
  admittedAt: string;
  authors: string[];
  publisher: string;
  publicationHistory: string[];
  states: Array<{
    id: string;
    sequence: number;
    observationKey: string;
  }>;
};
