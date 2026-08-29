export type AppShellCompatibility =
  | {
      status: "compatible";
      shellVersion: number;
      persistedVersion: number;
    }
  | {
      status: "incompatible";
      shellVersion: number;
      persistedVersion: number;
      reason: string;
    }
  | {
      status: "missing";
      persistedVersion: number;
      reason: string;
    };

type CompatibilityReply = Extract<
  AppShellCompatibility,
  { status: "compatible" | "incompatible" }
> & { type: "lirna:offline-shell-compatibility" };

export const persistedWorkingSetVersion = 1;
const bundledAppShellVersion = 1;

export class AppShellCompatibilityError extends Error {}

export function isAppShellCompatibilityError(error: Error): boolean {
  return error instanceof AppShellCompatibilityError;
}

export async function inspectBrowserAppShell(
  persistedVersion: number,
): Promise<AppShellCompatibility> {
  if ("__TAURI_INTERNALS__" in window)
    return bundledShellCompatibility(persistedVersion);
  if (!("serviceWorker" in navigator)) {
    return missing(persistedVersion, "Service workers are unavailable.");
  }

  let registration: ServiceWorkerRegistration;
  try {
    registration = await withTimeout(navigator.serviceWorker.ready, 3000);
  } catch {
    return missing(
      persistedVersion,
      "No active application-shell service worker was found.",
    );
  }
  if (!registration.active) {
    return missing(
      persistedVersion,
      "No active application-shell service worker was found.",
    );
  }

  try {
    return await requestCompatibility(registration.active, persistedVersion);
  } catch {
    return missing(
      persistedVersion,
      "The active application shell did not report compatibility.",
    );
  }
}

function bundledShellCompatibility(
  persistedVersion: number,
): AppShellCompatibility {
  if (persistedVersion === persistedWorkingSetVersion) {
    return {
      status: "compatible",
      shellVersion: bundledAppShellVersion,
      persistedVersion,
    };
  }
  return {
    status: "incompatible",
    shellVersion: bundledAppShellVersion,
    persistedVersion,
    reason: `Application shell version ${bundledAppShellVersion} cannot read persisted Offline working-set version ${persistedVersion}.`,
  };
}

function requestCompatibility(
  worker: ServiceWorker,
  persistedVersion: number,
): Promise<AppShellCompatibility> {
  const channel = new MessageChannel();
  const response = new Promise<AppShellCompatibility>((resolve, reject) => {
    channel.port1.onmessage = ({ data }: MessageEvent<unknown>) => {
      if (!isCompatibilityReply(data, persistedVersion)) {
        reject(new Error("Invalid application-shell compatibility reply"));
        return;
      }
      const { type: _type, ...compatibility } = data;
      resolve(compatibility);
    };
    channel.port1.onmessageerror = () =>
      reject(new Error("Application-shell compatibility reply failed"));
  });
  worker.postMessage(
    { type: "lirna:inspect-offline-compatibility", persistedVersion },
    [channel.port2],
  );
  return withTimeout(response, 3000);
}

function isCompatibilityReply(
  value: unknown,
  persistedVersion: number,
): value is CompatibilityReply {
  if (!(value && typeof value === "object")) return false;
  const reply = value as Partial<CompatibilityReply>;
  return (
    reply.type === "lirna:offline-shell-compatibility" &&
    reply.persistedVersion === persistedVersion &&
    typeof reply.shellVersion === "number" &&
    (reply.status === "compatible" ||
      (reply.status === "incompatible" && typeof reply.reason === "string"))
  );
}

function missing(
  persistedVersion: number,
  reason: string,
): AppShellCompatibility {
  return { status: "missing", persistedVersion, reason };
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Application-shell compatibility timed out")),
      milliseconds,
    );
    promise.then(
      (value) => {
        clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        clearTimeout(timeout);
        reject(error);
      },
    );
  });
}
