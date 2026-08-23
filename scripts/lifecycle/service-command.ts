import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { inspectCheckoutDetails } from "./checkout";
import {
  databaseName,
  environmentPorts,
  type ManagedEnvironment,
  postgresAdminUrl,
} from "./environment";

const serviceDefinitions = {
  server: {
    command: (_port, checkoutPath) => [
      "bun",
      "--cwd",
      join(checkoutPath, "apps/server"),
      "--watch",
      "src/index.ts",
    ],
    port: (environment) => environment.ports.server,
  },
  studio: {
    command: (port, _checkoutPath) => [
      "bun",
      "run",
      "--cwd",
      "packages/db",
      "db:studio",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    port: (environment) => environment.ports.tools.studio,
  },
  web: {
    command: (port, _checkoutPath) => [
      "bun",
      "x",
      "vite",
      "apps/web",
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--strictPort",
    ],
    port: (environment) => environment.ports.web,
  },
};

async function runtimeEnvironment() {
  const checkout = await inspectCheckoutDetails();
  const path = join(checkout.checkoutPath, ".lirna", "environment.json");
  let environment: ManagedEnvironment;
  try {
    environment = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new Error(
      "This checkout has no readable generated lifecycle environment. Run lifecycle registration or allocation from the primary checkout.",
    );
  }
  if (
    environment.checkoutPath !== checkout.checkoutPath ||
    !environmentPorts(environment)
  ) {
    throw new Error(
      "This checkout has an invalid generated lifecycle environment.",
    );
  }

  const serverUrl = `http://127.0.0.1:${environment.ports.server}`;
  const webUrl = `http://127.0.0.1:${environment.ports.web}`;
  const databaseUrl = postgresAdminUrl();
  databaseUrl.pathname = `/${databaseName(environment.identity)}`;
  return {
    checkoutPath: checkout.checkoutPath,
    environment,
    values: {
      BETTER_AUTH_URL: serverUrl,
      CORS_ORIGIN: webUrl,
      DATABASE_URL: databaseUrl.toString(),
      SERVER_URL: serverUrl,
      VITE_SERVER_URL: serverUrl,
    },
  };
}

export async function runService(args: string[]) {
  const name = args[0];
  if (args.length !== 1 || !name || !Object.hasOwn(serviceDefinitions, name)) {
    throw new Error("usage: bun run lifecycle run <server|web|studio>");
  }
  const service = serviceDefinitions[name];
  const { checkoutPath, environment, values } = await runtimeEnvironment();
  const port = service.port(environment);
  if (!port) {
    throw new Error(
      "The generated lifecycle environment has no allocated studio port. Allocate one from the primary checkout with `bun run lifecycle allocate <checkout-path> --tool studio`.",
    );
  }
  const child = Bun.spawn(service.command(port, checkoutPath), {
    cwd: checkoutPath,
    env: { ...process.env, ...values, PORT: String(port) },
    stderr: "inherit",
    stdin: "inherit",
    stdout: "inherit",
  });
  const signalHandlers = [
    ["SIGINT", () => child.kill("SIGINT")],
    ["SIGTERM", () => child.kill("SIGTERM")],
  ] as const;
  for (const [signal, handler] of signalHandlers) process.once(signal, handler);
  try {
    process.exitCode = await child.exited;
  } finally {
    for (const [signal, handler] of signalHandlers)
      process.off(signal, handler);
  }
}
