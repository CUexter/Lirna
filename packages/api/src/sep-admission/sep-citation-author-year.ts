import type { ReadingBibliographyGroup } from "./sep-reading-contract";

type BibliographyEntry = ReadingBibliographyGroup["entries"][number];

const yearPattern = /\b(?:1[5-9]\d{2}|20\d{2})[a-z]?\b/gi;
const bibliographyYearPattern = /\b(?:1[5-9]\d{2}|20\d{2})[a-z]?\b/i;
const surnamePatternSource = String.raw`(?:(?:[Vv]an|[Vv]on|[Dd]e|[Dd]el|[Dd]a|[Dd]i|[Ll]e|[Ll]a)\s+)?\p{Lu}[\p{L}'’-]+`;
const narrativeCitationPattern = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(${surnamePatternSource})(?:\s+(?:and|&)\s+${surnamePatternSource})?(?:\s+et al\.)?\s*\(\s*((?:1[5-9]\d{2}|20\d{2})[a-z]?[^()]*)\)`,
  "gu",
);
const parentheticalPattern =
  /\(([^()]*(?:1[5-9]\d{2}|20\d{2})[a-z]?[^()]*)\)/gu;
const parentheticalAuthorYearPattern = new RegExp(
  String.raw`(?<![\p{L}\p{N}])(${surnamePatternSource})(?:\s+(?:and|&)\s+${surnamePatternSource})?(?:\s+et al\.)?\s*,?\s*((?:1[5-9]\d{2}|20\d{2})[a-z]?)`,
  "gu",
);
const bibliographySurnamePattern = new RegExp(
  String.raw`^\s*(${surnamePatternSource})`,
  "u",
);

export interface AuthorYearReference {
  surname: string;
  year: string;
  start: number;
  end: number;
}

export function indexAuthorYearCandidates(groups: ReadingBibliographyGroup[]) {
  const candidates = new Map<string, BibliographyEntry[]>();
  for (const group of groups) {
    let inheritedSurname: string | undefined;
    for (const entry of group.entries) {
      const explicitSurname = entry.text.match(bibliographySurnamePattern)?.[1];
      if (explicitSurname) inheritedSurname = explicitSurname;
      const surname = /^\s*(?:-{2,}|–+|—+)/u.test(entry.text)
        ? inheritedSurname
        : explicitSurname;
      const year = entry.text.match(bibliographyYearPattern)?.[0];
      if (!(surname && year)) continue;
      const key = authorYearKey(surname, year);
      candidates.set(key, [...(candidates.get(key) ?? []), entry]);
    }
  }
  return candidates;
}

export function authorYearReferences(text: string): AuthorYearReference[] {
  const references: AuthorYearReference[] = [];
  const narrativeRanges: Array<{ start: number; end: number }> = [];
  collectNarrativeReferences(text, references, narrativeRanges);
  collectParentheticalReferences(text, references, narrativeRanges);
  return references.toSorted((left, right) => left.start - right.start);
}

function collectNarrativeReferences(
  text: string,
  references: AuthorYearReference[],
  narrativeRanges: Array<{ start: number; end: number }>,
) {
  for (const match of text.matchAll(narrativeCitationPattern)) {
    const result = narrativeMatchReferences(match);
    if (!result) continue;
    narrativeRanges.push(result.range);
    references.push(...result.references);
  }
}

function narrativeMatchReferences(match: RegExpMatchArray) {
  if (match.index === undefined || !match[1] || !match[2]) return undefined;
  const expressionStart = match.index;
  const expressionEnd = expressionStart + match[0].length;
  const bodyStart = expressionStart + match[0].indexOf(match[2]);
  const years = [...match[2].matchAll(yearPattern)];
  const firstYear = years[0];
  if (!firstYear) return undefined;
  const locatorRemainder = match[2]
    .replace(yearPattern, "")
    .replace(/\b(?:ch(?:ap(?:ter)?)?|pp?|sec(?:tion)?|vol(?:ume)?)\.?/giu, "");
  if (/\p{L}/u.test(locatorRemainder)) return undefined;
  const simple =
    years.length === 1 &&
    match[2].slice((firstYear.index ?? 0) + firstYear[0].length).trim() === "";
  const surname = match[1];
  return {
    range: { start: expressionStart, end: expressionEnd },
    references: years.map((year) => {
      const yearStart = bodyStart + (year.index ?? 0);
      return {
        surname,
        year: year[0],
        start: simple ? expressionStart : yearStart,
        end: simple ? expressionEnd : yearStart + year[0].length,
      };
    }),
  };
}

function collectParentheticalReferences(
  text: string,
  references: AuthorYearReference[],
  narrativeRanges: Array<{ start: number; end: number }>,
) {
  for (const match of text.matchAll(parentheticalPattern)) {
    if (match.index === undefined || !match[1]) continue;
    const expressionStart = match.index;
    const expressionEnd = expressionStart + match[0].length;
    if (
      narrativeRanges.some(
        (range) => range.start <= expressionStart && range.end >= expressionEnd,
      )
    ) {
      continue;
    }
    references.push(
      ...referencesInParenthetical(match[1], expressionStart, expressionEnd),
    );
  }
}

function referencesInParenthetical(
  body: string,
  expressionStart: number,
  expressionEnd: number,
) {
  const segments = body.split(";");
  const references: AuthorYearReference[] = [];
  let segmentStart = expressionStart + 1;
  for (const segment of segments) {
    references.push(
      ...referencesInSegment({
        segment,
        segmentStart,
        expressionStart,
        expressionEnd,
        onlySegment: segments.length === 1,
      }),
    );
    segmentStart += segment.length + 1;
  }
  return references;
}

function referencesInSegment({
  segment,
  segmentStart,
  expressionStart,
  expressionEnd,
  onlySegment,
}: {
  segment: string;
  segmentStart: number;
  expressionStart: number;
  expressionEnd: number;
  onlySegment: boolean;
}) {
  const references: AuthorYearReference[] = [];
  const authorYears = [...segment.matchAll(parentheticalAuthorYearPattern)];
  for (const [authorIndex, authorYear] of authorYears.entries()) {
    if (!authorYear[1] || !authorYear[2] || authorYear.index === undefined)
      continue;
    references.push(
      ...referencesForAuthorClause({
        segment,
        segmentStart,
        expressionStart,
        expressionEnd,
        onlyAuthor: onlySegment && authorYears.length === 1,
        authorYear,
        nextAuthorStart: authorYears[authorIndex + 1]?.index ?? segment.length,
      }),
    );
  }
  return references;
}

function referencesForAuthorClause({
  segment,
  segmentStart,
  expressionStart,
  expressionEnd,
  onlyAuthor,
  authorYear,
  nextAuthorStart,
}: {
  segment: string;
  segmentStart: number;
  expressionStart: number;
  expressionEnd: number;
  onlyAuthor: boolean;
  authorYear: RegExpMatchArray;
  nextAuthorStart: number;
}) {
  const surname = authorYear[1];
  const firstYear = authorYear[2];
  if (!(surname && firstYear)) return [];
  const authorStart = segmentStart + (authorYear.index ?? 0);
  const firstYearOffset = authorYear[0].lastIndexOf(firstYear);
  const firstYearStart = authorStart + firstYearOffset;
  const authorClause = segment.slice(authorYear.index, nextAuthorStart);
  const years = [...authorClause.slice(firstYearOffset).matchAll(yearPattern)];
  const simple =
    onlyAuthor &&
    years.length === 1 &&
    authorClause.slice(firstYearOffset + firstYear.length).trim() === "";
  return years.map((year, yearIndex) => {
    const yearStart = firstYearStart + (year.index ?? 0);
    return {
      surname,
      year: year[0],
      start: simple
        ? expressionStart
        : yearIndex === 0
          ? authorStart
          : yearStart,
      end: simple ? expressionEnd : yearStart + year[0].length,
    };
  });
}

export function authorYearKey(surname: string, year: string) {
  return `${normalizeSurname(surname)}:${year.toLocaleLowerCase()}`;
}

function normalizeSurname(surname: string) {
  return surname
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLocaleLowerCase();
}
