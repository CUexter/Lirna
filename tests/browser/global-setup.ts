import { type ChildProcess, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { FullConfig } from "@playwright/test";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";

const humanAccessToken = "synthetic-human-access-token-for-browser";
const serviceAccessToken = "synthetic-service-access-token-for-browser";

export default async function globalSetup(_config: FullConfig): Promise<() => Promise<void>> {
  let container: StartedPostgreSqlContainer | undefined;
  let stateRoot: string | undefined;
  let api: ChildProcess | undefined;
  let worker: ChildProcess | undefined;

  const cleanup = async () => {
    await Promise.all([api && stop(api), worker && stop(worker)]);
    await container?.stop();
    if (stateRoot) await rm(stateRoot, { recursive: true, force: true });
  };

  try {
    container = process.env.TEST_DATABASE_URL
      ? undefined
      : await new PostgreSqlContainer("postgres:16-alpine").start();
    const databaseUrl = process.env.TEST_DATABASE_URL ?? container?.getConnectionUri();
    if (!databaseUrl) throw new Error("Browser tests require a PostgreSQL connection");

    stateRoot = await mkdtemp(join(tmpdir(), "lirna-browser-"));
    const environment = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      HOST: "127.0.0.1",
      PORT: "4173",
      HUMAN_ACCESS_TOKEN: humanAccessToken,
      SERVICE_ACCESS_TOKEN: serviceAccessToken,
      ARTIFACT_ROOT: join(stateRoot, "artifacts"),
      SYNTHETIC_RESULT_ROOT: join(stateRoot, "synthetic-results"),
    };

    await runToCompletion("dist/database/migrate.js", environment);
    api = start("dist/entrypoints/api.js", environment);
    worker = start("dist/entrypoints/worker.js", environment);
    await waitForApi();
    return cleanup;
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function start(entrypoint: string, environment: NodeJS.ProcessEnv): ChildProcess {
  return spawn(process.execPath, [entrypoint], { env: environment, stdio: "inherit" });
}

async function runToCompletion(entrypoint: string, environment: NodeJS.ProcessEnv): Promise<void> {
  const child = start(entrypoint, environment);
  const code = await new Promise<number | null>((resolve) => child.once("exit", resolve));
  if (code !== 0) throw new Error(`${entrypoint} exited with code ${code}`);
}

async function waitForApi(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if ((await fetch("http://127.0.0.1:4173/").catch(() => undefined))?.ok) return;
    await delay(100);
  }
  throw new Error("Lirna API did not become ready");
}

async function stop(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    delay(5_000).then(() => child.kill("SIGKILL")),
  ]);
}
