import { randomUUID } from "node:crypto";
import {
  mkdir,
  readFile,
  rename,
  rmdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import {
  environmentPorts,
  environmentReport,
  identityPattern,
  type ManagedEnvironment,
} from "./environment";

export function registryPath() {
  const configuredStateHome = process.env.XDG_STATE_HOME;
  if (configuredStateHome && !isAbsolute(configuredStateHome)) {
    throw new Error("XDG_STATE_HOME must be an absolute path.");
  }
  const stateHome = configuredStateHome || join(homedir(), ".local", "state");
  return join(stateHome, "lirna", "lifecycle.json");
}

function validEnvironments(registry) {
  if (!Array.isArray(registry.environments)) return false;
  const identities = new Set();
  const paths = new Set();
  const ports = new Set();
  for (const environment of registry.environments) {
    const allocatedPorts = environmentPorts(environment);
    if (
      !allocatedPorts ||
      identities.has(environment.identity) ||
      paths.has(environment.checkoutPath) ||
      allocatedPorts.some((port) => ports.has(port))
    ) {
      return false;
    }
    identities.add(environment.identity);
    paths.add(environment.checkoutPath);
    for (const port of allocatedPorts) ports.add(port);
  }
  return registry.environments.some(
    (environment) =>
      environment.identity === registry.primary.identity &&
      environment.checkoutPath === registry.primary.checkoutPath,
  );
}

export async function readRegistry(path) {
  try {
    const registry = JSON.parse(await readFile(path, "utf8"));
    if (
      ![1, 2].includes(registry?.version) ||
      !identityPattern.test(registry.primary?.identity) ||
      typeof registry.primary?.checkoutPath !== "string" ||
      !isAbsolute(registry.primary.checkoutPath) ||
      (registry.version === 2 && !validEnvironments(registry))
    ) {
      throw new Error("unsupported lifecycle registry structure");
    }
    return registry;
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function assertPrimaryOwnership(registry, checkoutPath) {
  if (registry?.primary.checkoutPath === checkoutPath) return;
  if (!registry) throw new Error("The lifecycle registry could not be read.");
  throw new Error(
    `A different primary checkout is already registered at ${registry.primary.checkoutPath}.`,
  );
}

export function nextPort(registry) {
  const usedPorts = new Set(
    registry.environments.flatMap(({ ports }) => [
      ports.server,
      ports.web,
      ...Object.values(ports.tools),
    ]),
  );
  for (let port = 3000; port <= 65_535; port += 1) {
    if (!usedPorts.has(port)) return port;
  }
  throw new Error("No lifecycle ports remain available.");
}

export function addEnvironment(
  registry,
  checkoutPath,
  identity = randomUUID(),
) {
  const environment = {
    checkoutPath,
    identity,
    ports: { server: nextPort(registry), tools: {}, web: 0 },
  };
  registry.environments.push(environment);
  environment.ports.web = nextPort(registry);
  return environment;
}

export function upgradeRegistry(registry) {
  if (registry.version === 2) return false;
  registry.environments = [];
  registry.version = 2;
  addEnvironment(
    registry,
    registry.primary.checkoutPath,
    registry.primary.identity,
  );
  return true;
}

export async function writeRegistry(path, registry) {
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(registry, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  try {
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}

export async function withRegistryLock(path, mutate) {
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const lockPath = `${path}.lock`;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await mkdir(lockPath, { mode: 0o700 });
      break;
    } catch (error) {
      if (error.code !== "EEXIST" || attempt === 499) {
        throw new Error(`The lifecycle registry is locked at ${lockPath}.`);
      }
      await delay(10);
    }
  }
  try {
    return await mutate(await readRegistry(path));
  } finally {
    await rmdir(lockPath);
  }
}

export async function writeEnvironmentConfig(environment: ManagedEnvironment) {
  const path = join(environment.checkoutPath, ".lirna", "environment.json");
  await mkdir(dirname(path), { mode: 0o700, recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(environmentReport(environment), null, 2)}\n`,
    { flag: "wx", mode: 0o600 },
  );
  try {
    await rename(temporaryPath, path);
  } finally {
    await unlink(temporaryPath).catch(() => {});
  }
}
