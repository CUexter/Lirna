import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const metricsFileName = "bundle-size.json";

async function listFiles(directory, relativeDirectory = "") {
  const entries = await readdir(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  });
  const files = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(directory, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files;
}

export async function measureBuild(directory) {
  const relativePaths = (await listFiles(directory))
    .filter((file) => !file.endsWith(".map") && file !== metricsFileName)
    .sort();
  const assets = [];

  for (const relativePath of relativePaths) {
    const filePath = path.join(directory, relativePath);
    const contents = await readFile(filePath);
    const bytes = (await stat(filePath)).size;
    assets.push({
      bytes,
      gzipBytes: gzipSync(contents, { level: 9 }).byteLength,
      javascript: /\.(?:cjs|js|mjs)$/.test(relativePath),
      path: relativePath,
    });
  }

  const javascript = assets.filter((asset) => asset.javascript);
  return {
    assets,
    totals: {
      assetBytes: assets.reduce((total, asset) => total + asset.bytes, 0),
      assetGzipBytes: assets.reduce(
        (total, asset) => total + asset.gzipBytes,
        0,
      ),
      javascriptBytes: javascript.reduce(
        (total, asset) => total + asset.bytes,
        0,
      ),
      javascriptGzipBytes: javascript.reduce(
        (total, asset) => total + asset.gzipBytes,
        0,
      ),
      largestJavascriptBytes: Math.max(
        0,
        ...javascript.map((asset) => asset.bytes),
      ),
    },
  };
}

export function evaluateBudget(metrics, policy) {
  const largestJavascript = (metrics.assets ?? [])
    .filter((asset) => asset.javascript)
    .reduce(
      (largest, asset) => (asset.bytes > largest.bytes ? asset : largest),
      { bytes: 0, path: "none" },
    );
  const checks = [
    [
      "aggregate JavaScript",
      metrics.totals.javascriptBytes,
      policy.budget.javascriptBytes,
      "all JavaScript assets",
    ],
    [
      "largest JavaScript asset",
      metrics.totals.largestJavascriptBytes,
      policy.budget.largestJavascriptBytes,
      largestJavascript.path,
    ],
    [
      "aggregate assets",
      metrics.totals.assetBytes,
      policy.budget.assetBytes,
      "all measured assets",
    ],
  ];

  return checks
    .filter(([, measured, budget]) => measured > budget)
    .map(([name, measured, budget, asset]) => ({
      asset,
      budget,
      changeNeeded: measured - budget,
      measured,
      name,
    }));
}

export function validatePolicy(policy) {
  const fields = ["assetBytes", "javascriptBytes", "largestJavascriptBytes"];
  for (const field of fields) {
    const expected = Math.ceil(
      (policy.baseline[field] * (100 + policy.headroomPercent)) / 100,
    );
    if (policy.budget[field] !== expected) {
      throw new Error(
        `budget.${field} must equal the baseline plus ${policy.headroomPercent}% headroom (${expected}); update the baseline and budget together`,
      );
    }
  }
}

export function formatFailures(failures) {
  return failures
    .map(
      ({ asset, budget, changeNeeded, measured, name }) =>
        `${name} (${asset}): measured ${measured} bytes, budget ${budget} bytes; reduce by at least ${changeNeeded} bytes or update the reviewed baseline and budget`,
    )
    .join("\n");
}

async function main() {
  const root = path.resolve(import.meta.dirname, "..");
  const directory = path.resolve(root, process.argv[2] ?? "apps/web/dist");
  const policyPath = path.resolve(
    root,
    process.argv[3] ?? "config/web-bundle-budget.json",
  );
  const policy = JSON.parse(await readFile(policyPath, "utf8"));
  validatePolicy(policy);
  const metrics = await measureBuild(directory);
  const report = {
    budget: policy.budget,
    generatedBy: "scripts/check-web-bundle.mjs",
    headroomPercent: policy.headroomPercent,
    baseline: policy.baseline,
    policy: path.relative(root, policyPath),
    ...metrics,
  };

  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, metricsFileName),
    `${JSON.stringify(report, null, 2)}\n`,
  );

  const failures = evaluateBudget(metrics, policy);
  if (failures.length > 0) {
    console.error("Web bundle budget failed:");
    console.error(formatFailures(failures));
    process.exitCode = 1;
    return;
  }

  console.log(
    `Web bundle budget passed: ${metrics.totals.javascriptBytes} JavaScript bytes, ${metrics.totals.assetBytes} asset bytes`,
  );
}

if (import.meta.main) {
  await main();
}
