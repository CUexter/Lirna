import { discoverAuthoredResources, type SepCaptureLimits } from "./bundle";
import type { CapturedSepResource, SepUnresolvedResource } from "./client";
import { decodeCapturedHtml } from "./html";
import { captureQueuedSepResource, type QueuedSepResource } from "./resource";
import { SepAdmissionError, type SepPublicationScope } from "./url";

export interface OptionalCaptureResult {
  resources: CapturedSepResource[];
  unresolved: SepUnresolvedResource[];
  unknownComponent: boolean;
  consumedBytes: number;
}

export async function captureOptionalBundle(options: {
  main: CapturedSepResource;
  scope: SepPublicationScope;
  limits: SepCaptureLimits;
  fetchResource: typeof globalThis.fetch;
  now: () => Date;
  initialBytes: number;
}): Promise<OptionalCaptureResult> {
  const resources: CapturedSepResource[] = [];
  const unresolved: SepUnresolvedResource[] = [];
  const seen = new Set([options.main.identity]);
  const retainedIdentities = new Set([options.main.identity]);
  const queue: QueuedSepResource[] = [];
  const counts = { components: 1, assets: 0 };
  let consumedBytes = options.initialBytes;
  let unknownComponent = false;

  enqueueDiscoveries({
    resource: options.main,
    scope: options.scope,
    limits: options.limits,
    seen,
    queue,
    unresolved,
    counts,
  });
  let cursor = 0;
  while (cursor < queue.length) {
    const { batch, reservations, settled } = await captureNextBatch(
      queue,
      cursor,
      consumedBytes,
      options,
    );
    cursor += batch.length;
    ({ consumedBytes, unknownComponent } = processBatchResults({
      batch,
      reservations,
      settled,
      consumedBytes,
      unknownComponent,
      retainedIdentities,
      resources,
      unresolved,
      seen,
      queue,
      counts,
      options,
    }));
  }
  return { resources, unresolved, unknownComponent, consumedBytes };
}

function processBatchResults(options: {
  batch: QueuedSepResource[];
  reservations: number[];
  settled: PromiseSettledResult<CapturedSepResource>[];
  consumedBytes: number;
  unknownComponent: boolean;
  retainedIdentities: Set<string>;
  resources: CapturedSepResource[];
  unresolved: SepUnresolvedResource[];
  seen: Set<string>;
  queue: QueuedSepResource[];
  counts: { components: number; assets: number };
  options: Parameters<typeof captureOptionalBundle>[0];
}) {
  let { consumedBytes, unknownComponent } = options;
  for (const [index, result] of options.settled.entries()) {
    const queued = options.batch[index] as QueuedSepResource;
    if (result.status === "rejected") {
      consumedBytes +=
        result.reason instanceof SepAdmissionError
          ? result.reason.downloadedBytes
          : (options.reservations[index] ?? 0);
      recordCaptureFailure(queued, result.reason, options.unresolved);
      continue;
    }
    const resource = result.value;
    consumedBytes += resource.downloadedBytes;
    if (
      recordIdentityCollision(
        resource,
        queued,
        options.retainedIdentities,
        options.unresolved,
      )
    ) {
      continue;
    }
    options.retainedIdentities.add(resource.identity);
    options.resources.push(resource);
    unknownComponent ||= resource.role === "unknown-component";
    if (queued.target.kind === "component") {
      enqueueOptionalDiscoveries(queued, {
        resource,
        scope: options.options.scope,
        limits: options.options.limits,
        seen: options.seen,
        queue: options.queue,
        unresolved: options.unresolved,
        counts: options.counts,
      });
    }
  }
  return { consumedBytes, unknownComponent };
}

async function captureNextBatch(
  queue: QueuedSepResource[],
  cursor: number,
  consumedBytes: number,
  options: Parameters<typeof captureOptionalBundle>[0],
) {
  const availableTotal = options.limits.maxTotalBytes - consumedBytes;
  const reservationCount = Math.max(
    1,
    Math.floor(availableTotal / options.limits.maxResourceBytes),
  );
  const batch = queue.slice(
    cursor,
    cursor + Math.min(options.limits.maxConcurrency, reservationCount),
  );
  let availableBytes = availableTotal;
  const reservations: number[] = [];
  const captures = batch.map((queued) => {
    const reservation = Math.min(
      options.limits.maxResourceBytes,
      Math.max(0, availableBytes),
    );
    reservations.push(reservation);
    availableBytes -= reservation;
    return reservation > 0
      ? captureQueuedSepResource(queued, options, reservation)
      : Promise.reject(new Error("Bundle byte limit reached"));
  });
  return {
    batch,
    reservations,
    settled: await Promise.allSettled(captures),
  };
}

function enqueueOptionalDiscoveries(
  queued: QueuedSepResource,
  options: Parameters<typeof enqueueDiscoveries>[0],
) {
  try {
    enqueueDiscoveries(options);
  } catch (error) {
    recordCaptureFailure(queued, error, options.unresolved);
  }
}

function recordIdentityCollision(
  resource: CapturedSepResource,
  queued: QueuedSepResource,
  retainedIdentities: Set<string>,
  unresolved: SepUnresolvedResource[],
): boolean {
  if (!retainedIdentities.has(resource.identity)) {
    return false;
  }
  unresolved.push(
    unresolvedFromQueue(
      queued,
      `Redirect resolved to already captured identity ${resource.identity}`,
      false,
    ),
  );
  return true;
}

function recordCaptureFailure(
  queued: QueuedSepResource,
  error: unknown,
  unresolved: SepUnresolvedResource[],
) {
  const message =
    error instanceof Error ? error.message : "Optional resource capture failed";
  unresolved.push(
    unresolvedFromQueue(
      queued,
      message,
      message.includes("byte capture limit") ||
        message.includes("Bundle byte limit"),
    ),
  );
}

function enqueueDiscoveries(options: {
  resource: CapturedSepResource;
  scope: SepPublicationScope;
  limits: SepCaptureLimits;
  seen: Set<string>;
  queue: QueuedSepResource[];
  unresolved: SepUnresolvedResource[];
  counts: { components: number; assets: number };
}) {
  const html = decodeCapturedHtml(
    options.resource.body,
    options.resource.charset,
    options.resource.role,
  );
  const discovered = discoverAuthoredResources({
    html,
    parentUrl: options.resource.finalUrl,
    scope: options.scope,
  });
  for (const rejected of discovered.rejected) {
    options.unresolved.push({
      url: rejected.url,
      parentIdentity: options.resource.identity,
      role: "semantic-asset",
      depth: options.resource.depth + 1,
      reason: rejected.reason,
      limit: false,
    });
  }
  for (const candidate of discovered.resources) {
    enqueueCandidate(candidate, options);
  }
}

function enqueueCandidate(
  candidate: ReturnType<typeof discoverAuthoredResources>["resources"][number],
  options: {
    resource: CapturedSepResource;
    limits: SepCaptureLimits;
    seen: Set<string>;
    queue: QueuedSepResource[];
    unresolved: SepUnresolvedResource[];
    counts: { components: number; assets: number };
  },
) {
  if (options.seen.has(candidate.target.identity)) {
    return;
  }
  options.seen.add(candidate.target.identity);
  const depth = options.resource.depth + 1;
  const isAsset = candidate.role === "semantic-asset";
  const overDepth = depth > options.limits.maxDepth;
  const overCount = isAsset
    ? options.counts.assets >= options.limits.maxAssets
    : options.counts.components >= options.limits.maxComponents;
  if (overDepth || overCount) {
    options.unresolved.push({
      url: candidate.target.url.href,
      parentIdentity: options.resource.identity,
      role: candidate.role,
      depth,
      reason: overDepth
        ? `Recursion depth limit ${options.limits.maxDepth} reached`
        : `${isAsset ? "Asset" : "Component"} limit reached`,
      limit: true,
    });
    return;
  }
  if (isAsset) {
    options.counts.assets += 1;
  } else {
    options.counts.components += 1;
  }
  options.queue.push({
    target: candidate.target,
    role: candidate.role,
    parentIdentity: options.resource.identity,
    depth,
  });
}

function unresolvedFromQueue(
  queued: QueuedSepResource,
  reason: string,
  limit: boolean,
): SepUnresolvedResource {
  return {
    url: queued.target.url.href,
    parentIdentity: queued.parentIdentity,
    role: queued.role,
    depth: queued.depth,
    reason,
    limit,
  };
}
