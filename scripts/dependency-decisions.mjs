import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

export function decisionPath(projectRoot, name, version, kind) {
  return join(
    projectRoot,
    "config",
    "dependency-decisions",
    `${decisionIdentity(name, version)}.${kind}.json`,
  );
}

export function decisionIdentity(name, version) {
  return encodeURIComponent(`${name}@${version}`).replaceAll("%40", "@");
}

export async function readCommittedDecision(projectRoot, path) {
  const relativePath = path.slice(projectRoot.length + 1);
  try {
    await exec("git", ["diff", "--quiet", "HEAD", "--", relativePath], {
      cwd: projectRoot,
    });
    await exec("git", ["ls-files", "--error-unmatch", relativePath], {
      cwd: projectRoot,
    });
  } catch {
    throw new Error(
      `dependency decision must be committed and unchanged: ${relativePath}`,
    );
  }
  return JSON.parse(await readFile(path, "utf8"));
}

export function validateExactDecision(
  record,
  { name, version, date, maximumAgeDays },
) {
  if (record.package !== name || record.version !== version) {
    throw new Error(
      `dependency decision does not match exact package ${name}@${version}`,
    );
  }
  if (typeof record.reason !== "string" || record.reason.trim().length < 10) {
    throw new Error("dependency decision requires a package-specific reason");
  }
  const age =
    (new Date(date).getTime() - new Date(record.assessmentDate).getTime()) /
    86_400_000;
  if (!Number.isFinite(age) || age < 0 || age > maximumAgeDays) {
    throw new Error(
      `dependency decision assessmentDate is invalid or older than ${maximumAgeDays} days`,
    );
  }
}

export function validateOfficialSourceUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") throw new Error();
  } catch {
    throw new Error("warning override requires an HTTPS officialSourceUrl");
  }
}

export async function lastCommitAuthor(projectRoot, path) {
  const relativePath = path.slice(projectRoot.length + 1);
  const { stdout } = await exec(
    "git",
    ["log", "-1", "--format=%ae", "--", relativePath],
    {
      cwd: projectRoot,
    },
  );
  return stdout.trim().toLowerCase();
}
