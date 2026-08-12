import { resolve } from "node:path";

export interface RuntimeConfig {
  databaseUrl: string;
  artifactRoot: string;
  syntheticResultRoot: string;
  port: number;
}

export interface ApiRuntimeConfig extends RuntimeConfig {
  humanAccessToken: string;
  serviceAccessToken: string;
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
    syntheticResultRoot: resolve(
      environment.SYNTHETIC_RESULT_ROOT ?? ".lirna/synthetic-results",
    ),
    port,
  };
}

export function loadApiConfig(environment = process.env): ApiRuntimeConfig {
  const config = loadConfig(environment);
  const humanAccessToken = requireToken(environment.HUMAN_ACCESS_TOKEN, "HUMAN_ACCESS_TOKEN");
  const serviceAccessToken = requireToken(environment.SERVICE_ACCESS_TOKEN, "SERVICE_ACCESS_TOKEN");
  if (humanAccessToken === serviceAccessToken) {
    throw new Error("HUMAN_ACCESS_TOKEN and SERVICE_ACCESS_TOKEN must be different");
  }
  return {
    ...config,
    humanAccessToken,
    serviceAccessToken,
  };
}

function requireToken(value: string | undefined, name: string): string {
  if (!value || value.length < 32) {
    throw new Error(`${name} must contain at least 32 characters`);
  }
  return value;
}
