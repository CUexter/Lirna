import type { OfflineWorkingSetTarget } from "./workingSets";

export type OfflineWorkingSetLifecycleChange = {
  sourceId?: string;
  stateId?: string;
};

export interface OfflineWorkingSetLifecycle {
  publish(change: OfflineWorkingSetLifecycleChange): void;
  subscribe(
    onChange: (change: OfflineWorkingSetLifecycleChange) => void,
  ): () => void;
  subscribeLocalAndRemote(
    onChange: (change: OfflineWorkingSetLifecycleChange) => void,
  ): () => void;
}

interface LifecycleChannel {
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void;
  postMessage(message: unknown): void;
}

export function createBrowserOfflineWorkingSetLifecycle(
  channel: LifecycleChannel | undefined = defaultChannel(),
): OfflineWorkingSetLifecycle {
  const listeners = new Set<
    (change: OfflineWorkingSetLifecycleChange) => void
  >();
  const localListeners = new Set<
    (change: OfflineWorkingSetLifecycleChange) => void
  >();
  channel?.addEventListener("message", (event) => {
    if (!isLifecycleChange(event.data)) return;
    notify(listeners, event.data);
    notify(localListeners, event.data);
  });
  return {
    publish(change) {
      notify(localListeners, change);
      channel?.postMessage(change);
    },
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    subscribeLocalAndRemote(onChange) {
      localListeners.add(onChange);
      return () => localListeners.delete(onChange);
    },
  };
}

function defaultChannel(): LifecycleChannel | undefined {
  return typeof BroadcastChannel === "undefined"
    ? undefined
    : new BroadcastChannel("lirna-offline-working-set-lifecycle");
}

export function createMemoryOfflineWorkingSetLifecycle(): OfflineWorkingSetLifecycle {
  const listeners = new Set<
    (change: OfflineWorkingSetLifecycleChange) => void
  >();
  return {
    publish: (change) => notify(listeners, change),
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    subscribeLocalAndRemote(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
  };
}

export function lifecycleChangeMatches(
  target: OfflineWorkingSetTarget,
  change: OfflineWorkingSetLifecycleChange,
) {
  return (
    change.sourceId !== undefined &&
    target.sourceId === change.sourceId &&
    (change.stateId === undefined || target.stateId === change.stateId)
  );
}

function notify(
  listeners: Set<(change: OfflineWorkingSetLifecycleChange) => void>,
  change: OfflineWorkingSetLifecycleChange,
) {
  for (const listener of listeners) listener(change);
}

function isLifecycleChange(
  value: unknown,
): value is OfflineWorkingSetLifecycleChange {
  if (!(value && typeof value === "object")) return false;
  const candidate = value as Partial<OfflineWorkingSetLifecycleChange>;
  return (
    (candidate.sourceId === undefined ||
      typeof candidate.sourceId === "string") &&
    (candidate.stateId === undefined || typeof candidate.stateId === "string")
  );
}
