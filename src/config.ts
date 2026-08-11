import { resolve } from "node:path";

export interface RuntimeConfig {
  databaseUrl: string;
  artifactRoot: string;
  syntheticVaultRoot: string;
  port: number;
}

export function loadConfig(environment = process.env): RuntimeConfig {
  const port = Number(environment.PORT ?? "3000");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be an integer between 1 and 65535");
  }
  return {
    databaseUrl:
      environment.DATABASE_URL ?? "postgres://lirna:lirna@127.0.0.1:5432/lirna",
    artifactRoot: resolve(environment.ARTIFACT_ROOT ?? ".lirna/artifacts"),
    syntheticVaultRoot: resolve(
      environment.SYNTHETIC_VAULT_ROOT ?? ".lirna/synthetic-vault",
    ),
    port,
  };
}
