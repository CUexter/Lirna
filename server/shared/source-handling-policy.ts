export const sensitivityLevels = ["ordinary-cloud", "restricted-cloud", "local-only"] as const;

export const rightsBases = [
  "owned",
  "lawfully-acquired",
  "publicly-accessible",
  "explicitly-licensed",
  "reference-only",
  "inaccessible",
] as const;

export type SensitivityLevel = (typeof sensitivityLevels)[number];
export type RightsBasis = (typeof rightsBases)[number];

export interface SourceHandlingPolicy {
  readonly sensitivity: SensitivityLevel;
  readonly rightsBasis: RightsBasis;
}
