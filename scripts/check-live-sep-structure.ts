const defaultEntry = "https://plato.stanford.edu/entries/logic-classical/";
const maximumBytes = 2_000_000;
const minimumDelayMilliseconds = 1000;

export async function runLiveSepStructuralCheck({
  entryUrl = defaultEntry,
  fetchResource = fetch,
  delay = Bun.sleep,
}: {
  entryUrl?: string;
  fetchResource?: typeof fetch;
  delay?: (milliseconds: number) => Promise<unknown>;
} = {}) {
  const entry = validateEntryUrl(entryUrl);
  let requests = 0;
  let firstRequest = true;
  const rateLimitedFetch = (async (input, init) => {
    if (!firstRequest) await delay(minimumDelayMilliseconds);
    firstRequest = false;
    requests += 1;
    return fetchResource(input, init);
  }) as typeof fetch;
  const main = await boundedFetch(entry, rateLimitedFetch);
  const citation = await boundedFetch(
    new URL(
      `/cgi-bin/encyclopedia/archinfo.cgi?entry=${encodeURIComponent(entryName(entry))}`,
      entry,
    ),
    rateLimitedFetch,
  );
  const observations = {
    title: /<title\b[^>]*>[^<]+/i.test(main.text),
    authoredHierarchy: /<(?:h1|h2)\b/i.test(main.text),
    authoredContents: /(?:id=["']toc["']|article-sidebar)/i.test(main.text),
    notesOrSupplement: /href=["'][^"']*(?:notes|supplement)[^"']*["']/i.test(
      main.text,
    ),
    citationPublisher: /Metaphysics Research Lab|Stanford University/i.test(
      citation.text,
    ),
  };
  const failures = Object.entries(observations)
    .filter(([, observed]) => !observed)
    .map(([name]) => name);
  if (failures.length > 0) {
    throw new Error(
      `Live SEP structure changed or fixture expectations drifted: ${failures.join(", ")}`,
    );
  }
  return {
    entry: entry.href,
    requests,
    bytes: main.bytes + citation.bytes,
    observations,
  };
}

async function boundedFetch(url: URL, fetchResource: typeof fetch) {
  let current = url;
  for (let redirects = 0; redirects <= 3; redirects += 1) {
    validateSepUrl(current);
    if (current.href !== url.href) {
      throw new Error("Live check redirect left the selected entry boundary");
    }
    const response = await fetchResource(current, {
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "user-agent":
          "Lirna optional structural check (non-admitting; bounded observations)",
      },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("Live SEP redirect omitted Location");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok) {
      throw new Error(
        `Live SEP structural request returned HTTP ${response.status}`,
      );
    }
    const declaredLength = Number(response.headers.get("content-length"));
    if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
      await response.body?.cancel();
      throw new Error("Live SEP structural response exceeds the 2 MB bound");
    }
    const body = await readBoundedBody(response);
    return { text: body.toString("utf8"), bytes: body.byteLength };
  }
  throw new Error("Live SEP structural request exceeded three redirects");
}

async function readBoundedBody(response: Response) {
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks, bytes);
    bytes += value.byteLength;
    if (bytes > maximumBytes) {
      await reader.cancel();
      throw new Error("Live SEP structural response exceeds the 2 MB bound");
    }
    chunks.push(Buffer.from(value));
  }
}

function validateEntryUrl(value: string) {
  const url = new URL(value);
  validateSepUrl(url);
  if (!/^\/entries\/[a-z0-9-]+\/$/.test(url.pathname) || url.search) {
    throw new Error("Live check requires one canonical active SEP entry URL");
  }
  return url;
}

function validateSepUrl(url: URL) {
  if (
    url.protocol !== "https:" ||
    url.hostname !== "plato.stanford.edu" ||
    url.port ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error("Live check is restricted to HTTPS plato.stanford.edu");
  }
  if (
    !/^\/entries\/[a-z0-9-]+\/$/.test(url.pathname) &&
    url.pathname !== "/cgi-bin/encyclopedia/archinfo.cgi"
  ) {
    throw new Error(
      "Live check URL is outside the entry and citation boundary",
    );
  }
}

function entryName(url: URL) {
  return url.pathname.split("/").filter(Boolean).at(-1) ?? "";
}

if (import.meta.main) {
  if (process.env.SEP_LIVE_CHECK !== "1") {
    throw new Error(
      "Set SEP_LIVE_CHECK=1 to run the optional, non-admitting live SEP check",
    );
  }
  const result = await runLiveSepStructuralCheck({
    entryUrl: process.env.SEP_LIVE_ENTRY_URL,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
