import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Existing duplication is debt, not a reason to block unrelated work. Lower this
// baseline whenever the debt shrinks so it cannot grow back.
const duplicatedLineBaseline = 0;
const reportDirectory = await mkdtemp(join(tmpdir(), "lirna-jscpd-"));

try {
  const result = spawnSync(
    "npx",
    [
      "--yes",
      "jscpd@4.0.8",
      "--min-lines",
      "5",
      "--min-tokens",
      "50",
      "--threshold",
      "100",
      "--reporters",
      "json",
      "--output",
      reportDirectory,
      "--gitignore",
      "--format",
      "typescript,tsx",
      "apps",
      "packages",
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    throw new Error(`jscpd exited with status ${result.status}`);
  }

  const report = JSON.parse(
    await readFile(join(reportDirectory, "jscpd-report.json"), "utf8"),
  );
  const duplicatedLines = report.statistics?.total?.duplicatedLines;
  if (typeof duplicatedLines !== "number")
    throw new Error("jscpd report has no line total");

  if (duplicatedLines > duplicatedLineBaseline) {
    console.error(
      `Duplicated code grew from the ${duplicatedLineBaseline}-line baseline to ${duplicatedLines} lines.`,
    );
    process.exitCode = 1;
  } else if (duplicatedLines < duplicatedLineBaseline) {
    console.log(
      `Duplication shrank to ${duplicatedLines} lines. Lower the ${duplicatedLineBaseline}-line baseline to preserve the improvement.`,
    );
  } else {
    console.log(
      `Duplication is unchanged at the ${duplicatedLineBaseline}-line baseline.`,
    );
  }
} finally {
  await rm(reportDirectory, { recursive: true, force: true });
}
