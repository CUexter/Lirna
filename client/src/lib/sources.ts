export interface Source {
  id: string;
  title: string;
  admittedAt: string;
  state: {
    id: string;
    normalizedText: string;
    rightsBasis: string;
    sensitivityLevel: string;
    admittedAt: string;
  };
}

export async function admitTextSource(input: {
  title: string;
  text: string;
  rightsBasis: string;
  sensitivityLevel: string;
}): Promise<Source> {
  const response = await fetch("/api/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("The Source could not be admitted");
  return response.json() as Promise<Source>;
}

export async function readAuthoritativeEvidence(id: string): Promise<string> {
  const response = await fetch(`/api/sources/${id}/evidence`);
  if (!response.ok) throw new Error("The authoritative evidence could not be read");
  const evidence = await response.json() as { authoritativeText: string };
  return evidence.authoritativeText;
}

export async function readSource(id: string): Promise<Source> {
  const response = await fetch(`/api/sources/${id}`);
  if (!response.ok) throw new Error("The Source could not be read");
  return response.json() as Promise<Source>;
}
