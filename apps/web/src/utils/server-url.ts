import { env } from "@lirna/env/web";

type ServerUrlRuntime = {
  process?: { env?: Record<string, string | undefined> };
  window?: { location: { origin: string } };
};

function withoutTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function createServerUrl(
  url: string,
  runtime: ServerUrlRuntime = globalThis,
) {
  const processEnv = runtime.process?.env;
  if (!runtime.window && processEnv?.SERVER_URL) {
    return withoutTrailingSlash(processEnv.SERVER_URL);
  }

  const normalized = withoutTrailingSlash(url);

  if (!normalized.startsWith("/")) {
    return normalized;
  }

  if (runtime.window) {
    return `${runtime.window.location.origin}${normalized}`;
  }

  const vercelUrl =
    processEnv?.VERCEL_ENV === "production"
      ? (processEnv?.VERCEL_PROJECT_PRODUCTION_URL ?? processEnv?.VERCEL_URL)
      : (processEnv?.VERCEL_URL ?? processEnv?.VERCEL_PROJECT_PRODUCTION_URL);
  if (vercelUrl) {
    const origin = withoutTrailingSlash(
      vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`,
    );
    return `${origin}${normalized}`;
  }

  return `http://localhost:3000${normalized}`;
}

export const serverUrl = createServerUrl(env.VITE_SERVER_URL);
