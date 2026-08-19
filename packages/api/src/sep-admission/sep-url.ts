const sepOrigin = "https://plato.stanford.edu";
const citationPath = "/cgi-bin/encyclopedia/archinfo.cgi";

export class SepAdmissionError extends Error {
  constructor(
    message: string,
    readonly downloadedBytes = 0,
  ) {
    super(message);
    this.name = "SepAdmissionError";
  }
}

export interface ClassifiedSepUrl {
  url: URL;
  entry: string;
  kind: "main" | "citation-information";
  archived: boolean;
}

export interface SepPublicationScope {
  entry: string;
  archived: boolean;
  archive?: string;
  directoryPath: string;
}

export interface ClassifiedSepResourceUrl {
  url: URL;
  entry: string;
  archived: boolean;
  identity: string;
  kind: "component" | "asset";
}

export function classifySepUrl(value: string): ClassifiedSepUrl {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SepAdmissionError("Enter a valid SEP URL");
  }
  if (
    url.origin !== sepOrigin ||
    url.username ||
    url.password ||
    url.port ||
    url.hash
  ) {
    throw new SepAdmissionError(
      "Only HTTPS plato.stanford.edu SEP URLs are accepted",
    );
  }

  const entryMatch = url.pathname.match(
    /^\/(?:archives\/((?:spr|sum|fall|win)\d{4})\/)?entries\/([a-z0-9-]+)\/$/i,
  );
  if (entryMatch && !url.search) {
    const entry = entryMatch[2];
    if (!entry) {
      throw new SepAdmissionError(
        "The SEP entry identity could not be determined",
      );
    }
    return {
      url,
      entry: entry.toLowerCase(),
      kind: "main",
      archived: Boolean(entryMatch[1]),
    };
  }

  const entries = url.searchParams.getAll("entry");
  const keys = [...url.searchParams.keys()];
  if (
    url.pathname === citationPath &&
    entries.length === 1 &&
    keys.length === 1 &&
    keys[0] === "entry" &&
    /^[a-z0-9-]+$/i.test(entries[0] ?? "")
  ) {
    return {
      url,
      entry: entries[0]?.toLowerCase() ?? "",
      kind: "citation-information",
      archived: false,
    };
  }
  throw new SepAdmissionError(
    "Use an SEP entry, archived-entry, or citation-information URL",
  );
}

export function activeEntryUrl(entry: string): ClassifiedSepUrl {
  return classifySepUrl(`${sepOrigin}/entries/${entry}/`);
}

export function citationInformationUrl(entry: string): ClassifiedSepUrl {
  const url = new URL(citationPath, sepOrigin);
  url.searchParams.set("entry", entry);
  return classifySepUrl(url.href);
}

export function publicationScope(main: ClassifiedSepUrl): SepPublicationScope {
  if (main.kind !== "main") {
    throw new SepAdmissionError(
      "A main SEP entry is required for bundle scope",
    );
  }
  const archive = main.url.pathname.match(/^\/archives\/([^/]+)\//)?.[1];
  return {
    entry: main.entry,
    archived: main.archived,
    archive,
    directoryPath: main.archived
      ? `/archives/${archive}/entries/${main.entry}/`
      : `/entries/${main.entry}/`,
  };
}

export function classifySepResourceUrl(
  value: string,
  baseUrl: string,
  scope: SepPublicationScope,
  kind: ClassifiedSepResourceUrl["kind"],
): ClassifiedSepResourceUrl {
  let url: URL;
  try {
    url = new URL(value, baseUrl);
  } catch {
    throw new SepAdmissionError("Discovered SEP URL is malformed");
  }
  if (url.origin !== sepOrigin || url.username || url.password || url.port) {
    throw new SepAdmissionError(
      "Discovered resource is outside the HTTPS SEP origin",
    );
  }
  if (/%(?:2e|2f|5c)/i.test(url.pathname) || url.pathname.includes("\\")) {
    throw new SepAdmissionError("Discovered SEP URL contains an unsafe path");
  }
  if (url.search || !url.pathname.startsWith(scope.directoryPath)) {
    throw new SepAdmissionError(
      "Discovered resource is outside the requested SEP publication",
    );
  }
  url.hash = "";
  const relativePath = url.pathname.slice(scope.directoryPath.length);
  const normalizedPath =
    relativePath === "index.html" || relativePath === ""
      ? "/"
      : `/${relativePath}`;
  return {
    url,
    entry: scope.entry,
    archived: scope.archived,
    identity: `${scope.archive ?? "active"}:${normalizedPath}`,
    kind,
  };
}

export function validateArchiveRecommendation(
  recommendation: string | undefined,
  citationUrl: string,
  entry: string,
): string | undefined {
  if (!recommendation) {
    return undefined;
  }
  const classified = classifySepUrl(new URL(recommendation, citationUrl).href);
  if (
    classified.kind !== "main" ||
    !classified.archived ||
    classified.entry !== entry
  ) {
    throw new SepAdmissionError(
      "SEP recommended an invalid archive for this entry",
    );
  }
  return classified.url.href;
}
