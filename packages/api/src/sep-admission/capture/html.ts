import type { SepDiagnostic } from "./client";
import { SepAdmissionError } from "./url";

export interface SepCitationMetadata {
  authors: string[];
  publisher: string;
  publicationHistory: string[];
  recommendedArchiveUrl?: string;
  diagnostics: SepDiagnostic[];
}

export interface SepEntryMetadata {
  title: string;
  authors: string[];
  publisher: string;
  publicationHistory: string[];
}

const sepPublisher = "Metaphysics Research Lab, Stanford University";

export function decodeCapturedHtml(
  body: Buffer,
  charset: string | undefined,
  role: string,
): string {
  try {
    return new TextDecoder(
      (charset ?? "utf-8") as ConstructorParameters<typeof TextDecoder>[0],
    ).decode(body);
  } catch {
    throw new SepAdmissionError(
      `SEP ${role} uses an unsupported character encoding`,
    );
  }
}

export function parseTitle(html: string): string {
  return htmlText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "")
    .replace(
      /\s*(?:\|\s*Stanford Encyclopedia of Philosophy|\(Stanford Encyclopedia of Philosophy\))\s*$/i,
      "",
    )
    .trim();
}

export function parseEntryMetadata(html: string): SepEntryMetadata {
  const meta = [...html.matchAll(/<meta\b([^>]*)>/gi)].map((match) =>
    metaAttributes(match[1] ?? ""),
  );
  const values = (name: string) =>
    meta
      .filter(
        (attributes) => attributes.name?.toLowerCase() === name.toLowerCase(),
      )
      .map((attributes) => attributes.content)
      .filter((value): value is string => Boolean(value));
  const first = (...names: string[]) =>
    names.flatMap((name) => values(name))[0];
  const title = first("citation_title", "DC.title") ?? parseTitle(html);
  if (!title) {
    throw new SepAdmissionError(
      "SEP main entry does not contain a readable title",
    );
  }
  const authors = values("citation_author");
  const issued = first("DCTERMS.issued", "citation_publication_date");
  const modified = first("DCTERMS.modified");
  return {
    title,
    authors: authors.length ? authors : values("DC.creator"),
    publisher: first("citation_publisher", "DC.publisher") ?? sepPublisher,
    publicationHistory: [
      ...(issued ? [`First published ${issued}`] : []),
      ...(modified ? [`Revised ${modified}`] : []),
    ],
  };
}

export function parseCitationInformation(html: string): SepCitationMetadata {
  const withoutExecutableText = html.replace(
    /<(?:script|style)\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi,
    "",
  );
  const lines = withoutExecutableText
    .replace(/<\/(?:p|li|dd|div|h[1-6])\s*>/gi, "\n")
    .split("\n")
    .map(htmlText)
    .filter(Boolean);
  const authorLine = lines
    .find((line) => /^By\s+/i.test(line))
    ?.replace(/^By\s+/i, "");
  const documentText = htmlText(withoutExecutableText);
  const bibtexAuthors = documentText.match(/\bauthor\s*=\s*\{([^}]+)\}/i)?.[1];
  const authors =
    (authorLine
      ? authorLine.split(/,|\band\b/i)
      : bibtexAuthors?.split(/\s+and\s+/i)
    )
      ?.map((author) => author.trim())
      .filter(Boolean) ?? [];
  const recommendedArchiveUrl = [
    ...html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi),
  ]
    .map((match) => decodeHtmlEntities(match[1] ?? ""))
    .find((href) => /\/archives\/[^/]+\/entries\/[^/]+\/$/i.test(href));
  const publicationHistory = lines
    .flatMap((line) => line.split(";"))
    .map((line) => normalizePublicationHistory(line))
    .filter((line): line is string => Boolean(line));
  const publisher = documentText
    .match(/\bpublisher\s*=\s*\{([^}]+)\}/i)?.[1]
    ?.trim();
  if (!publisher) {
    throw new SepAdmissionError(
      "SEP citation information does not identify its publisher",
    );
  }
  const diagnostics: SepDiagnostic[] = [
    ...(authors.length
      ? []
      : [
          {
            level: "warning",
            code: "authors-unobserved",
            message: "Citation information did not identify an author",
          } as const,
        ]),
    ...(recommendedArchiveUrl
      ? []
      : [
          {
            level: "info",
            code: "archive-unobserved",
            message:
              "Citation information did not recommend an archived edition",
          } as const,
        ]),
  ];
  return {
    authors,
    publisher,
    publicationHistory,
    recommendedArchiveUrl,
    diagnostics,
  };
}

function normalizePublicationHistory(value: string): string | undefined {
  const line = htmlText(value);
  if (
    !/^(?:this entry was first published|it was last modified)\b/i.test(line)
  ) {
    if (
      !/^(?:first published|substantive revision|last modified|revised)\b/i.test(
        line,
      )
    ) {
      return undefined;
    }
    return line
      .replace(/^first published/i, "First published")
      .replace(/^substantive revision/i, "Substantive revision")
      .replace(/^last modified/i, "Last modified")
      .replace(/^revised/i, "Revised");
  }
  return line
    .replace(/^This entry was first published/i, "First published")
    .replace(/^It was last modified/i, "Last modified");
}

function htmlText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function metaAttributes(value: string) {
  const attributes: Record<string, string> = {};
  for (const match of value.matchAll(
    /([:\w.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g,
  )) {
    const name = match[1]?.toLowerCase();
    const content = match[2] ?? match[3] ?? match[4];
    if (name && content !== undefined) {
      attributes[name] = decodeHtmlEntities(content);
    }
  }
  return attributes;
}

function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (entity, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X")) {
        return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      }
      if (code.startsWith("#")) {
        return String.fromCodePoint(Number.parseInt(code.slice(1), 10));
      }
      return named[code.toLowerCase()] ?? entity;
    },
  );
}
