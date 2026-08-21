export type LibrarySource = {
  id: string;
  title: string;
  admittedAt: string;
  states: Array<{
    id: string;
    sequence: number;
    observationKey: string;
  }>;
};
