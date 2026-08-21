export const identityPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const toolNamePattern = /^[a-z][a-z0-9-]*$/;
const databaseNamePattern = /^lirna_[0-9a-f]{32}$/;
export const databaseEndpoint = "127.0.0.1:5433";

export type ManagedEnvironment = {
  checkoutPath: string;
  identity: string;
  ports: { server: number; tools: Record<string, number>; web: number };
};

export function environmentPorts(environment) {
  const tools = environment?.ports?.tools;
  if (
    !identityPattern.test(environment?.identity) ||
    typeof environment.checkoutPath !== "string" ||
    !Number.isInteger(environment.ports?.server) ||
    !Number.isInteger(environment.ports?.web) ||
    !tools ||
    Array.isArray(tools) ||
    Object.keys(tools).some((name) => !toolNamePattern.test(name))
  ) {
    return null;
  }
  const ports = [
    environment.ports.server,
    environment.ports.web,
    ...Object.values(tools),
  ];
  if (
    ports.some(
      (port) => !Number.isInteger(port) || port < 1024 || port > 65_535,
    ) ||
    new Set(ports).size !== ports.length
  ) {
    return null;
  }
  return ports;
}

export function databaseName(identity: string) {
  const name = `lirna_${identity.replaceAll("-", "")}`;
  if (!identityPattern.test(identity) || !databaseNamePattern.test(name)) {
    throw new Error("The managed lifecycle identity cannot name a database.");
  }
  return name;
}

export function postgresAdminUrl() {
  const configured = process.env.POSTGRES_ADMIN_URL;
  try {
    const url = configured
      ? new URL(configured)
      : new URL(
          `postgresql://postgres:${encodeURIComponent(process.env.POSTGRES_PASSWORD ?? "password")}@${databaseEndpoint}/postgres`,
        );
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.pathname.slice(1)
    ) {
      throw new Error();
    }
    return url;
  } catch {
    throw new Error("POSTGRES_ADMIN_URL must be a valid PostgreSQL URL.");
  }
}

export function environmentReport(environment: ManagedEnvironment) {
  const toolUrls = Object.fromEntries(
    Object.entries(environment.ports.tools).map(([name, port]) => [
      name,
      `http://127.0.0.1:${port}`,
    ]),
  );
  return {
    checkoutPath: environment.checkoutPath,
    databaseName: databaseName(environment.identity),
    identity: environment.identity,
    ports: environment.ports,
    urls: {
      server: `http://127.0.0.1:${environment.ports.server}`,
      tools: toolUrls,
      web: `http://127.0.0.1:${environment.ports.web}`,
    },
    version: 1,
  };
}
