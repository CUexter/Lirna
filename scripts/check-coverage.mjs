import fs from "node:fs";
import path from "node:path";
import process from "node:process";

import { resolveInsideRoot } from "#path-safety";

const root = path.resolve(import.meta.dirname, "..");
const coverageFile = resolveInsideRoot(
  root,
  process.argv[2] ?? "coverage/lcov.info",
);
const baseline = {
  functionsHit: 15,
  functionsFound: 24,
  linesHit: 196,
  linesFound: 208,
};
const sourcePattern = /^(apps|packages)\/[^/]+\/src\//;
const excludedPattern = /(?:\.test\.|\.spec\.|\.gen\.|\/fixtures\/|\/config\/)/;

const records = fs
  .readFileSync(coverageFile, "utf8")
  .split("end_of_record")
  .map((record) => {
    const source = record.match(/^SF:(.+)$/m)?.[1];
    if (!source) return null;
    return {
      source,
      functionsFound: number(record, "FNF"),
      functionsHit: number(record, "FNH"),
      linesFound: number(record, "LF"),
      linesHit: number(record, "LH"),
    };
  })
  .filter(
    (record) =>
      record &&
      sourcePattern.test(record.source) &&
      !excludedPattern.test(record.source),
  );

if (records.length === 0) {
  throw new Error("Coverage report contains no first-party source files");
}

const totals = records.reduce(
  (total, record) => ({
    functionsFound: total.functionsFound + record.functionsFound,
    functionsHit: total.functionsHit + record.functionsHit,
    linesFound: total.linesFound + record.linesFound,
    linesHit: total.linesHit + record.linesHit,
  }),
  { functionsFound: 0, functionsHit: 0, linesFound: 0, linesHit: 0 },
);

for (const metric of ["functions", "lines"]) {
  const found = `${metric}Found`;
  const hit = `${metric}Hit`;
  if (totals[hit] * baseline[found] < baseline[hit] * totals[found]) {
    throw new Error(
      `${metric} coverage ${totals[hit]}/${totals[found]} is below the baseline ${baseline[hit]}/${baseline[found]}`,
    );
  }
}

console.log(
  `Coverage ratchet passed: ${totals.linesHit}/${totals.linesFound} lines, ${totals.functionsHit}/${totals.functionsFound} functions`,
);

function number(record, key) {
  return Number(record.match(new RegExp(`^${key}:(\\d+)$`, "m"))?.[1] ?? 0);
}
