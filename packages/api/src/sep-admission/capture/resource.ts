import { createHash } from "node:crypto";

import type { SepCaptureLimits } from "./bundle";
import type { CapturedSepResource, SepUnresolvedResource } from "./client";
import { type CapturedHttpResponse, captureSepBundleResource } from "./http";
import {
  type ClassifiedSepResourceUrl,
  classifySepResourceUrl,
  type SepPublicationScope,
} from "./url";

export interface QueuedSepResource {
  target: ClassifiedSepResourceUrl;
  role: SepUnresolvedResource["role"];
  parentIdentity: string;
  depth: number;
}

export async function captureQueuedSepResource(
  queued: QueuedSepResource,
  options: {
    main: CapturedSepResource;
    scope: SepPublicationScope;
    limits: SepCaptureLimits;
    fetchResource: typeof globalThis.fetch;
    now: () => Date;
  },
  remaining: number,
) {
  const captured = await captureSepBundleResource({
    initial: queued.target,
    scope: options.scope,
    role: queued.role,
    http: {
      fetch: options.fetchResource,
      maxRedirects: options.limits.maxRedirects,
      maxResourceBytes: Math.min(options.limits.maxResourceBytes, remaining),
      timeoutMilliseconds: options.limits.timeoutMilliseconds,
    },
  });
  const finalTarget = classifySepResourceUrl(
    captured.finalUrl,
    queued.target.url.href,
    options.scope,
    queued.target.kind,
  );
  return toCapturedSepResource(captured, {
    observationKey: options.main.observationKey,
    identity: finalTarget.identity,
    role: queued.role,
    requestedUrl: queued.target.url.href,
    discoveryEdge: `authored:${queued.parentIdentity}`,
    depth: queued.depth,
    retrievedAt: options.now(),
  });
}

export function toCapturedSepResource(
  captured: CapturedHttpResponse,
  metadata: Omit<
    CapturedSepResource,
    | "finalUrl"
    | "status"
    | "mediaType"
    | "charset"
    | "contentEncoding"
    | "selectedHeaders"
    | "requestCount"
    | "downloadedBytes"
    | "byteLength"
    | "sha256"
    | "body"
  >,
): CapturedSepResource {
  return {
    ...metadata,
    finalUrl: captured.finalUrl,
    status: captured.status,
    mediaType: captured.mediaType,
    charset: captured.charset,
    contentEncoding: captured.contentEncoding,
    selectedHeaders: captured.selectedHeaders,
    requestCount: captured.requestCount,
    downloadedBytes: captured.body.byteLength,
    byteLength: captured.body.byteLength,
    sha256: createHash("sha256").update(captured.body).digest("hex"),
    body: captured.body,
  };
}
