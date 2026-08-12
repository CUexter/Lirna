import {
  rightsBases,
  sensitivityLevels,
  type RightsBasis,
  type SensitivityLevel,
} from "../../../server/shared/source-handling-policy";

export type { RightsBasis, SensitivityLevel };

const policyLabels: Record<RightsBasis | SensitivityLevel, string> = {
  owned: "Nathan-created or owned",
  "lawfully-acquired": "Lawfully acquired for personal use",
  "publicly-accessible": "Publicly accessible",
  "explicitly-licensed": "Explicitly licensed",
  "reference-only": "Reference-only",
  inaccessible: "Inaccessible",
  "ordinary-cloud": "Ordinary cloud",
  "restricted-cloud": "Restricted cloud",
  "local-only": "Local only",
};

export const rightsBasisOptions = rightsBases.map((value) => [value, policyLabels[value]] as const);
export const sensitivityLevelOptions = sensitivityLevels.map((value) => [value, policyLabels[value]] as const);

export interface Source {
  id: string;
  title: string;
  admittedAt: string;
  state: {
    id: string;
    normalizedText: string;
    rightsBasis: RightsBasis;
    sensitivityLevel: SensitivityLevel;
    admittedAt: string;
  };
}

export async function admitTextSource(input: {
  accessToken: string;
  title: string;
  text: string;
  rightsBasis: RightsBasis;
  sensitivityLevel: SensitivityLevel;
}): Promise<Source> {
  const { accessToken, ...source } = input;
  const response = await fetch("/api/sources", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(source),
  });
  if (!response.ok) throw new Error("The Source could not be admitted");
  return response.json() as Promise<Source>;
}

export async function readAuthoritativeEvidence(id: string, accessToken: string): Promise<string> {
  const response = await fetch(`/api/sources/${id}/evidence`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("The authoritative evidence could not be read");
  const evidence = await response.json() as { authoritativeText: string };
  return evidence.authoritativeText;
}

export async function readSource(id: string, accessToken: string): Promise<Source> {
  const response = await fetch(`/api/sources/${id}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error("The Source could not be read");
  return response.json() as Promise<Source>;
}
