import { createHash } from "node:crypto";
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";

import { resolveInsideRoot } from "#path-safety";

const root = path.resolve(import.meta.dirname, "..");
const sourcePattern = /^(apps|packages)\/[^/]+\/src\//;
const excludedPattern =
  /(?:\.test\.|\.spec\.|\.gen\.|-test-(?:fixtures|harness|support)\.|\/(?:config|fixtures|test-support)\/)/;
const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

function isShadcnPrimitive(source) {
  return source.startsWith("packages/ui/src/components/");
}

function coveredSourceViolation(source, absentSources, hashes) {
  if (isShadcnPrimitive(source)) {
    return absentSources[source] === hashes[source]
      ? null
      : `${source} changed while covered; explicitly update the reviewed shadcn baseline`;
  }
  return `${source} is covered but remains in the legacy baseline`;
}

export function isEligibleSource(source) {
  return (
    sourcePattern.test(source) &&
    !excludedPattern.test(source) &&
    sourceExtensions.has(path.extname(source))
  );
}

export function sourceBaselineViolations({
  absentSources,
  coveredSources,
  eligibleSources,
  hashes,
}) {
  const violations = [];
  const eligible = new Set(eligibleSources);

  for (const source of [...eligible].sort()) {
    if (coveredSources.has(source)) continue;
    if (!(source in absentSources)) {
      violations.push(
        `${source} is absent from LCOV and has no reviewed legacy baseline`,
      );
    } else if (absentSources[source] !== hashes[source]) {
      violations.push(
        `${source} changed while absent from LCOV; add coverage or explicitly update the baseline`,
      );
    }
  }

  for (const source of Object.keys(absentSources).sort()) {
    if (!eligible.has(source)) {
      violations.push(
        `${source} is deleted but remains in the legacy baseline`,
      );
    } else if (coveredSources.has(source)) {
      const violation = coveredSourceViolation(source, absentSources, hashes);
      if (violation) violations.push(violation);
    }
  }

  return violations;
}

export function promoteCoveredSources({
  baseline,
  coveredSources,
  eligibleSources,
  hashes,
  sources,
}) {
  const eligible = new Set(eligibleSources);
  const absentSources = baseline.absentSources ?? {};
  const requestedSources = sources ? new Set(sources) : null;
  const promotedSources = Object.keys(absentSources)
    .filter(
      (source) =>
        (!requestedSources || requestedSources.has(source)) &&
        eligible.has(source) &&
        !isShadcnPrimitive(source) &&
        coveredSources.has(source),
    )
    .sort();
  const promoted = new Set(promotedSources);
  const remainingAbsentSources = Object.fromEntries(
    Object.entries(absentSources).filter(([source]) => !promoted.has(source)),
  );
  const requestedSourceViolations = requestedSources
    ? [...requestedSources].sort().flatMap((source) => {
        if (!eligible.has(source))
          return `${source} is not an eligible first-party source`;
        if (!(source in absentSources))
          return `${source} is not in the legacy baseline`;
        if (!coveredSources.has(source))
          return `${source} is absent from LCOV and cannot be promoted`;
        return [];
      })
    : [];
  const baselineViolations = sourceBaselineViolations({
    absentSources: remainingAbsentSources,
    coveredSources,
    eligibleSources,
    hashes,
  });

  return {
    baseline: {
      coverage: baseline.coverage,
      absentSources: remainingAbsentSources,
    },
    promotedSources,
    sourceViolations: [
      ...new Set([...requestedSourceViolations, ...baselineViolations]),
    ],
  };
}

function collectEligibleSources() {
  const sources = [];

  function visit(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(entryPath);
      } else if (
        entry.isFile() &&
        sourceExtensions.has(path.extname(entry.name))
      ) {
        const source = path.relative(root, entryPath).replaceAll(path.sep, "/");
        if (isEligibleSource(source)) sources.push(source);
      }
    }
  }

  for (const workspaceRoot of ["apps", "packages"]) {
    const directory = path.join(root, workspaceRoot);
    if (existsSync(directory) && statSync(directory).isDirectory())
      visit(directory);
  }
  return sources.sort();
}

function hashSources(sources) {
  return Object.fromEntries(
    sources.map((source) => [
      source,
      createHash("sha256")
        .update(readFileSync(path.join(root, source)))
        .digest("hex"),
    ]),
  );
}

function number(record, key) {
  return Number(record.match(new RegExp(`^${key}:(\\d+)$`, "m"))?.[1] ?? 0);
}

function validateCoverageTotals({ baseline, totals }) {
  for (const metric of ["functions", "lines"]) {
    const found = `${metric}Found`;
    const hit = `${metric}Hit`;
    if (
      totals[hit] * baseline.coverage[found] <
      baseline.coverage[hit] * totals[found]
    )
      throw new Error(
        `${metric} coverage ${totals[hit]}/${totals[found]} is below the baseline ${baseline.coverage[hit]}/${baseline.coverage[found]}`,
      );
  }
}

function writePromotion({ baselineFile, promotion }) {
  if (!promotion) return false;
  if (promotion.promotedSources.length === 0) {
    console.log("No covered legacy sources to promote");
    return true;
  }
  writeFileSync(
    baselineFile,
    `${JSON.stringify(promotion.baseline, null, 2)}\n`,
  );
  console.log(
    `Promoted ${promotion.promotedSources.length} covered legacy source${promotion.promotedSources.length === 1 ? "" : "s"}`,
  );
  return true;
}

function parseOptions(args) {
  const writeBaseline = args.includes("--write-baseline");
  const promoteCovered = args.includes("--promote-covered-sources");
  const promotedSources = args
    .filter((argument) => argument.startsWith("--promote-covered-source="))
    .map((argument) => argument.slice("--promote-covered-source=".length));
  const scopedPromotion = promotedSources.length > 0;

  if (writeBaseline && promoteCovered)
    throw new Error(
      "Choose either --write-baseline or --promote-covered-sources, not both",
    );
  if (writeBaseline && scopedPromotion)
    throw new Error(
      "Choose either --write-baseline or --promote-covered-source, not both",
    );
  if (promoteCovered && scopedPromotion)
    throw new Error(
      "Choose either --promote-covered-sources or --promote-covered-source, not both",
    );

  return { promoteCovered, promotedSources, scopedPromotion, writeBaseline };
}

function main() {
  const args = process.argv.slice(2);
  const { promoteCovered, promotedSources, scopedPromotion, writeBaseline } =
    parseOptions(args);
  const coverageArgument = args.find((argument) => !argument.startsWith("--"));
  const coverageFile = resolveInsideRoot(
    root,
    coverageArgument ?? "coverage/lcov.info",
  );
  const baselineFile = path.join(root, "config/coverage-baseline.json");
  const records = readFileSync(coverageFile, "utf8")
    .split("end_of_record")
    .map((record) => {
      const rawSource = record.match(/^SF:(.+)$/m)?.[1];
      if (!rawSource) return null;
      const source = path
        .relative(root, path.resolve(root, rawSource))
        .replaceAll(path.sep, "/");
      return {
        source,
        functionsFound: number(record, "FNF"),
        functionsHit: number(record, "FNH"),
        linesFound: number(record, "LF"),
        linesHit: number(record, "LH"),
      };
    })
    .filter((record) => record && isEligibleSource(record.source));

  if (records.length === 0)
    throw new Error("Coverage report contains no first-party source files");

  const totals = records.reduce(
    (total, record) => ({
      functionsFound: total.functionsFound + record.functionsFound,
      functionsHit: total.functionsHit + record.functionsHit,
      linesFound: total.linesFound + record.linesFound,
      linesHit: total.linesHit + record.linesHit,
    }),
    { functionsFound: 0, functionsHit: 0, linesFound: 0, linesHit: 0 },
  );
  const coveredSources = new Set(records.map((record) => record.source));
  const eligibleSources = collectEligibleSources();
  const hashes = hashSources(eligibleSources);

  if (writeBaseline) {
    const absentSources = Object.fromEntries(
      eligibleSources
        .filter((source) => !coveredSources.has(source))
        .map((source) => [source, hashes[source]]),
    );
    writeFileSync(
      baselineFile,
      `${JSON.stringify({ coverage: totals, absentSources }, null, 2)}\n`,
    );
    console.log(
      `Coverage baseline updated with ${Object.keys(absentSources).length} reviewed legacy exclusions`,
    );
    return;
  }

  if (!existsSync(baselineFile))
    throw new Error(
      "Coverage baseline is missing; run bun run coverage:baseline and review the result",
    );
  const baseline = JSON.parse(readFileSync(baselineFile, "utf8"));
  const promotion =
    promoteCovered || scopedPromotion
      ? promoteCoveredSources({
          baseline,
          coveredSources,
          eligibleSources,
          hashes,
          sources: scopedPromotion ? promotedSources : undefined,
        })
      : null;
  const sourceViolations =
    promotion?.sourceViolations ??
    sourceBaselineViolations({
      absentSources: baseline.absentSources ?? {},
      coveredSources,
      eligibleSources,
      hashes,
    });
  if (sourceViolations.length > 0) throw new Error(sourceViolations.join("\n"));

  validateCoverageTotals({ baseline, totals });
  if (writePromotion({ baselineFile, promotion })) return;

  console.log(
    `Coverage ratchet passed: ${totals.linesHit}/${totals.linesFound} lines, ${totals.functionsHit}/${totals.functionsFound} functions`,
  );
}

if (import.meta.main) main();
