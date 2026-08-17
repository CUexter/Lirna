import type { ClassifiedSepResourceUrl } from "./sep-url";
import {
  type ClassifiedSepUrl,
  classifySepResourceUrl,
  classifySepUrl,
  SepAdmissionError,
  type SepPublicationScope,
} from "./sep-url";

const htmlMediaType = /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i;
const imageMediaType = /^image\/(?:avif|gif|jpeg|png|webp)(?:;|$)/i;
const redirectStatuses = new Set([301, 302, 303, 307, 308]);
const selectedHeaderNames = [
  "content-type",
  "content-language",
  "etag",
  "last-modified",
  "cache-control",
] as const;

interface CaptureHttpOptions {
  fetch: typeof globalThis.fetch;
  maxRedirects: number;
  maxResourceBytes: number;
  timeoutMilliseconds: number;
}

export interface CapturedHttpResponse {
  finalUrl: string;
  status: number;
  mediaType: string;
  charset?: string;
  contentEncoding?: string;
  selectedHeaders: Record<string, string>;
  requestCount: number;
  body: Buffer;
}

interface HttpTarget {
  url: URL;
}

export function captureSepHtml(
  initial: ClassifiedSepUrl,
  role: string,
  options: CaptureHttpOptions,
): Promise<CapturedHttpResponse> {
  return captureHttp({
    initial,
    role,
    options,
    expected: "html",
    validateRedirect(value) {
      const redirected = classifySepUrl(value);
      if (
        redirected.entry !== initial.entry ||
        redirected.kind !== initial.kind
      ) {
        throw new SepAdmissionError(
          `SEP redirected ${role} outside the requested publication`,
        );
      }
      return redirected;
    },
  });
}

export function captureSepBundleResource(options: {
  initial: ClassifiedSepResourceUrl;
  scope: SepPublicationScope;
  role: string;
  http: CaptureHttpOptions;
}): Promise<CapturedHttpResponse> {
  return captureHttp({
    initial: options.initial,
    role: options.role,
    options: options.http,
    expected: options.initial.kind === "asset" ? "image" : "html",
    validateRedirect: (value) =>
      classifySepResourceUrl(
        value,
        options.initial.url.href,
        options.scope,
        options.initial.kind,
      ),
  });
}

async function captureHttp(options: {
  initial: HttpTarget;
  role: string;
  options: CaptureHttpOptions;
  expected: "html" | "image";
  validateRedirect: (value: string) => HttpTarget;
}): Promise<CapturedHttpResponse> {
  const followed = await followRedirects(options);
  let mediaType: string;
  let body: Buffer;
  try {
    mediaType = validateResponse(
      followed.response,
      options.role,
      options.expected,
    );
    body = await readBoundedBody(
      followed.response,
      options.role,
      options.options.maxResourceBytes,
    );
  } catch (error) {
    await cancelResponseBody(followed.response);
    throw error;
  }
  return {
    finalUrl: followed.finalUrl.url.href,
    status: followed.response.status,
    mediaType,
    charset: mediaType.match(/charset=([^;\s]+)/i)?.[1],
    contentEncoding:
      followed.response.headers.get("content-encoding") ?? undefined,
    selectedHeaders: selectHeaders(followed.response.headers),
    requestCount: followed.requestCount,
    body,
  };
}

async function followRedirects(options: {
  initial: HttpTarget;
  role: string;
  options: CaptureHttpOptions;
  validateRedirect: (value: string) => HttpTarget;
}) {
  let current = options.initial;
  for (
    let redirects = 0;
    redirects <= options.options.maxRedirects;
    redirects += 1
  ) {
    let response: Response;
    try {
      response = await options.options.fetch(current.url, {
        redirect: "manual",
        headers: { "accept-encoding": "identity" },
        signal: AbortSignal.timeout(options.options.timeoutMilliseconds),
      });
    } catch (error) {
      throw new SepAdmissionError(
        `SEP ${options.role} capture failed: ${error instanceof Error ? error.message : "network error"}`,
      );
    }
    if (!redirectStatuses.has(response.status)) {
      return { response, finalUrl: current, requestCount: redirects + 1 };
    }
    await cancelResponseBody(response);
    const location = response.headers.get("location");
    if (!location) {
      throw new SepAdmissionError(
        `SEP redirected ${options.role} without a Location header`,
      );
    }
    if (redirects === options.options.maxRedirects) {
      throw new SepAdmissionError(
        `SEP redirected ${options.role} too many times`,
      );
    }
    current = options.validateRedirect(new URL(location, current.url).href);
  }
  throw new SepAdmissionError(`SEP redirected ${options.role} too many times`);
}

function validateResponse(
  response: Response,
  role: string,
  expected: "html" | "image",
): string {
  if (!response.ok) {
    throw new SepAdmissionError(
      `SEP ${role} capture returned HTTP ${response.status}`,
    );
  }
  const mediaType =
    response.headers.get("content-type") ?? "application/octet-stream";
  const accepted = expected === "html" ? htmlMediaType : imageMediaType;
  if (!accepted.test(mediaType)) {
    throw new SepAdmissionError(
      `SEP ${role} has unexpected media type ${mediaType}`,
    );
  }
  const contentEncoding = response.headers.get("content-encoding");
  if (contentEncoding && contentEncoding.toLowerCase() !== "identity") {
    throw new SepAdmissionError(
      `SEP ${role} ignored the identity encoding request; exact response bytes cannot be retained`,
    );
  }
  return mediaType;
}

async function readBoundedBody(
  response: Response,
  role: string,
  maximum: number,
): Promise<Buffer> {
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximum) {
    throw new SepAdmissionError(
      `SEP ${role} exceeds the ${maximum}-byte capture limit`,
    );
  }
  if (!response.body) {
    return Buffer.alloc(0);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return Buffer.concat(chunks, length);
      }
      length += value.byteLength;
      if (length > maximum) {
        await reader.cancel().catch(() => undefined);
        throw new SepAdmissionError(
          `SEP ${role} exceeds the ${maximum}-byte capture limit`,
          length,
        );
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof SepAdmissionError) {
      throw error;
    }
    await reader.cancel().catch(() => undefined);
    throw new SepAdmissionError(
      `SEP ${role} response could not be read: ${error instanceof Error ? error.message : "stream error"}`,
      length,
    );
  }
}

async function cancelResponseBody(response: Response) {
  await response.body?.cancel().catch(() => undefined);
}

function selectHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    selectedHeaderNames.flatMap((name) => {
      const value = headers.get(name);
      return value ? [[name, value]] : [];
    }),
  );
}
