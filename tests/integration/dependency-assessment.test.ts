import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const repositoryRoot = resolve(".");
const workspaces: string[] = [];
const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map((server) => new Promise<void>((done) => server.close(() => done()))),
  );
  await Promise.all(
    workspaces.splice(0).map((workspace) => rm(workspace, { recursive: true, force: true })),
  );
});

describe("exact dependency artifact assessment", () => {
  it("assesses verified synthetic bytes before installing the exact release without execution", async () => {
    const marker = join(tmpdir(), `lirna-package-executed-${process.pid}`);
    await rm(marker, { force: true });
    const archive = await syntheticPackageArchive(marker);
    const fixture = await startRegistry(archive);
    const project = await syntheticProject();
    await writeFile(join(project, "unrelated.txt"), "preserve me\n");

    const result = await exec("npm", ["run", "dependency:add", "--", "safe-fixture@^1.0.0"], {
      cwd: repositoryRoot,
      env: { ...fixture.environment, LIRNA_DEPENDENCY_PROJECT_ROOT: project },
      maxBuffer: 10 * 1024 * 1024,
    });

    expect(result.stdout).toContain("Exact selected release: safe-fixture@1.2.3");
    expect(result.stdout).toContain("Archive integrity: verified");
    expect(result.stdout).toContain("Lifecycle scripts: none");
    expect(result.stdout).toContain("Implicit native-build files: none");
    expect(result.stdout).toContain("Declared author: Synthetic Author");
    expect(result.stdout).toContain("Current maintainers: Current Maintainer");
    expect(result.stdout).toContain("Exact-version publisher: Release Publisher");
    expect(result.stdout).toContain("Declared repository owner: synthetic-owner");
    expect(result.stdout).toContain("OpenSSF Scorecard: available");
    expect(result.stdout).toContain("OSV vulnerabilities: none reported");
    expect(result.stdout).toContain("Release activity by year: 2020: 1, 2025: 1");
    expect(result.stdout).toContain("Last-month downloads: 4321");
    expect(result.stdout).toContain("not a trust score");
    expect(result.stdout).toContain("Installed safe-fixture@1.2.3 with lifecycle scripts disabled");
    expect(fixture.tarballRequests()).toBe(1);
    await expect(readFile(marker, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(join(project, "unrelated.txt"), "utf8")).resolves.toBe("preserve me\n");

    const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
    const lock = JSON.parse(await readFile(join(project, "package-lock.json"), "utf8"));
    expect(manifest.dependencies["safe-fixture"]).toBe("1.2.3");
    expect(lock.packages["node_modules/safe-fixture"]).toMatchObject({
      version: "1.2.3",
      integrity: fixture.integrity,
    });
  });

  it("rejects a tampered archive before inspection or manifest changes", async () => {
    const archive = await syntheticPackageArchive(join(tmpdir(), "must-not-execute"));
    const fixture = await startRegistry(Buffer.concat([archive, Buffer.from("tampered")]), archive);
    const project = await syntheticProject();
    const originalManifest = await readFile(join(project, "package.json"), "utf8");
    const originalLock = await readFile(join(project, "package-lock.json"), "utf8");

    await expect(
      exec("npm", ["run", "dependency:add", "--", "safe-fixture@1.2.3"], {
        cwd: repositoryRoot,
        env: { ...fixture.environment, LIRNA_DEPENDENCY_PROJECT_ROOT: project },
        maxBuffer: 10 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("archive integrity"),
    });

    await expect(readFile(join(project, "package.json"), "utf8")).resolves.toBe(originalManifest);
    await expect(readFile(join(project, "package-lock.json"), "utf8")).resolves.toBe(originalLock);
  });

  it.each([
    ["similar established name", { similar: true }, "similarly named established packages"],
    ["young package", { created: "2025-12-01T00:00:00.000Z" }, "package is younger than 90 days"],
    [
      "stale release",
      { releaseDate: "2020-01-01T00:00:00.000Z" },
      "exact release is older than 730 days",
    ],
    ["low activity", { downloads: 2 }, "last-month downloads are below 1000"],
    ["missing repository", { repository: undefined }, "no source repository is declared"],
    [
      "source mismatch",
      { repositoryName: "other/repository" },
      "does not match repository metadata",
    ],
    ["archived repository", { archived: true }, "declared source repository is archived"],
    ["missing provenance", { provenance: false }, "registry provenance is unavailable"],
    ["lifecycle script", { lifecycle: true }, "package scripts remain disabled"],
    ["native build", { nativeBuild: true }, "package scripts remain disabled"],
    ["deprecation", { deprecated: "use another package" }, "hard block: exact release"],
    ["vulnerability", { vulnerability: "OSV-TEST-1" }, "known vulnerability: OSV-TEST-1"],
  ])("stops before installation for %s", async (_name, rawOptions, expectedReason) => {
    const options: FixtureOptions = rawOptions;
    const archive = await syntheticPackageArchive(join(tmpdir(), "must-not-execute"), options);
    const fixture = await startRegistry(archive, archive, options);
    const project = await syntheticProject();

    await expect(
      exec("npm", ["run", "dependency:add", "--", "safe-fixture@1.2.3"], {
        cwd: repositoryRoot,
        env: {
          ...fixture.environment,
          LIRNA_DEPENDENCY_PROJECT_ROOT: project,
        },
        maxBuffer: 10 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining(expectedReason),
    });
    const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
    if (options.lifecycle || options.nativeBuild) {
      expect(manifest.dependencies["safe-fixture"]).toBe("1.2.3");
    } else {
      expect(manifest.dependencies).toBeUndefined();
    }
  });

  it("fails closed when required independent evidence is unavailable", async () => {
    const archive = await syntheticPackageArchive(join(tmpdir(), "must-not-execute"));
    const fixture = await startRegistry(archive, archive, {
      osvUnavailable: true,
    });
    const project = await syntheticProject();

    await expect(
      exec("npm", ["run", "dependency:add", "--", "safe-fixture@1.2.3"], {
        cwd: repositoryRoot,
        env: { ...fixture.environment, LIRNA_DEPENDENCY_PROJECT_ROOT: project },
        maxBuffer: 10 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("required OSV request failed"),
    });
  });

  it("keeps an existing lockfile-exact installation independent of assessment services", async () => {
    const project = await syntheticProject();

    await expect(
      exec("npm", ["ci", "--ignore-scripts", "--offline"], { cwd: project }),
    ).resolves.toBeDefined();
  });

  it("continues an ordinary warning only with committed exact evidence", async () => {
    const archive = await syntheticPackageArchive(join(tmpdir(), "must-not-execute"));
    const fixture = await startRegistry(archive, archive, { downloads: 2 });
    const project = await syntheticProject();
    await commitDecision(project, "safe-fixture@1.2.3.warnings.json", {
      package: "safe-fixture",
      version: "1.2.3",
      triggeredWarnings: ["last-month downloads are below 1000"],
      reason: "This synthetic package is the documented fixture used by this integration test.",
      officialSourceUrl: "https://example.test/safe-fixture",
      assessmentDate: "2026-01-01T00:00:00.000Z",
    });

    const result = await exec("npm", ["run", "dependency:add", "--", "safe-fixture@1.2.3"], {
      cwd: repositoryRoot,
      env: { ...fixture.environment, LIRNA_DEPENDENCY_PROJECT_ROOT: project },
      maxBuffer: 10 * 1024 * 1024,
    });

    expect(result.stdout).toContain("Accepted committed warning override for safe-fixture@1.2.3");
    const manifest = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
    expect(manifest.dependencies["safe-fixture"]).toBe("1.2.3");
  });

  it.each([
    [
      "broad warning list",
      { triggeredWarnings: ["last-month downloads are below 1000", "all warnings"] },
    ],
    ["stale assessment", { assessmentDate: "2025-01-01T00:00:00.000Z" }],
    ["different package", { package: "other-fixture" }],
    ["different version", { version: "1.2.4" }],
    ["malformed source", { officialSourceUrl: "not-a-url" }],
  ])("rejects a %s override", async (_name, changes) => {
    const archive = await syntheticPackageArchive(join(tmpdir(), "must-not-execute"));
    const fixture = await startRegistry(archive, archive, { downloads: 2 });
    const project = await syntheticProject();
    await commitDecision(project, "safe-fixture@1.2.3.warnings.json", {
      package: "safe-fixture",
      version: "1.2.3",
      triggeredWarnings: ["last-month downloads are below 1000"],
      reason: "This synthetic package is the documented fixture used by this integration test.",
      officialSourceUrl: "https://example.test/safe-fixture",
      assessmentDate: "2026-01-01T00:00:00.000Z",
      ...changes,
    });

    await expect(
      exec("npm", ["run", "dependency:add", "--", "safe-fixture@1.2.3"], {
        cwd: repositoryRoot,
        env: { ...fixture.environment, LIRNA_DEPENDENCY_PROJECT_ROOT: project },
        maxBuffer: 10 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("Dependency assessment failed") });
  });

  it("hard-blocks deprecation outside the ordinary warning flow", async () => {
    const archive = await syntheticPackageArchive(join(tmpdir(), "must-not-execute"));
    const fixture = await startRegistry(archive, archive, { deprecated: "use another package" });
    const project = await syntheticProject();

    await expect(
      exec("npm", ["run", "dependency:add", "--", "safe-fixture@1.2.3"], {
        cwd: repositoryRoot,
        env: { ...fixture.environment, LIRNA_DEPENDENCY_PROJECT_ROOT: project },
        maxBuffer: 10 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("hard block: exact release") });
  });

  it("accepts a critical exception only when its exact record was committed by Nathan", async () => {
    const archive = await syntheticPackageArchive(join(tmpdir(), "must-not-execute"));
    const fixture = await startRegistry(archive, archive, {
      vulnerability: "OSV-CRITICAL-1",
      vulnerabilitySeverity: "CRITICAL",
    });
    const project = await syntheticProject();
    const decision = {
      package: "safe-fixture",
      version: "1.2.3",
      vulnerabilityIds: ["OSV-CRITICAL-1"],
      reason: "Nathan accepts this exact synthetic critical fixture for boundary testing only.",
      assessmentDate: "2026-01-01T00:00:00.000Z",
    };
    await commitDecision(project, "safe-fixture@1.2.3.critical-vulnerabilities.json", decision);

    await expect(
      exec("npm", ["run", "dependency:add", "--", "safe-fixture@1.2.3"], {
        cwd: repositoryRoot,
        env: { ...fixture.environment, LIRNA_DEPENDENCY_PROJECT_ROOT: project },
        maxBuffer: 10 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("must be committed by Nathan") });

    await exec(
      "git",
      [
        "commit",
        "--allow-empty",
        "--author",
        "Nathan <nathan.chan@net-makers.com.hk>",
        "-m",
        "Re-author exception",
      ],
      {
        cwd: project,
        env: {
          ...process.env,
          GIT_COMMITTER_NAME: "Nathan",
          GIT_COMMITTER_EMAIL: "nathan.chan@net-makers.com.hk",
        },
      },
    );
    await writeFile(
      join(
        project,
        "config",
        "dependency-decisions",
        "safe-fixture@1.2.3.critical-vulnerabilities.json",
      ),
      `${JSON.stringify({ ...decision, reason: `${decision.reason} Nathan reviewed it.` }, null, 2)}\n`,
    );
    await commitAll(
      project,
      "Nathan",
      "nathan.chan@net-makers.com.hk",
      "Review critical exception",
    );

    const result = await exec("npm", ["run", "dependency:add", "--", "safe-fixture@1.2.3"], {
      cwd: repositoryRoot,
      env: { ...fixture.environment, LIRNA_DEPENDENCY_PROJECT_ROOT: project },
      maxBuffer: 10 * 1024 * 1024,
    });
    expect(result.stdout).toContain("Accepted Nathan-authored critical exception");
  });

  it("hard-blocks a critical vulnerability expressed as a CVSS vector", async () => {
    const archive = await syntheticPackageArchive(join(tmpdir(), "must-not-execute"));
    const fixture = await startRegistry(archive, archive, {
      vulnerability: "OSV-CVSS-1",
      vulnerabilitySeverity: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H",
    });
    const project = await syntheticProject();

    await expect(
      exec("npm", ["run", "dependency:add", "--", "safe-fixture@1.2.3"], {
        cwd: repositoryRoot,
        env: { ...fixture.environment, LIRNA_DEPENDENCY_PROJECT_ROOT: project },
        maxBuffer: 10 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("hard block") });
  });

  it("installs with scripts disabled, then requires a separate committed execution decision", async () => {
    const marker = join(tmpdir(), `lirna-nix-boundary-${process.pid}`);
    const archive = await syntheticPackageArchive(join(tmpdir(), "must-not-execute"), {
      lifecycle: true,
    });
    const fixture = await startRegistry(archive, archive, { lifecycle: true });
    const project = await syntheticProject();

    await expect(
      exec("npm", ["run", "dependency:add", "--", "safe-fixture@1.2.3"], {
        cwd: repositoryRoot,
        env: { ...fixture.environment, LIRNA_DEPENDENCY_PROJECT_ROOT: project },
        maxBuffer: 10 * 1024 * 1024,
      }),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining("package scripts remain disabled"),
    });
    await expect(readFile(marker, "utf8")).rejects.toMatchObject({ code: "ENOENT" });

    const shim = join(project, "synthetic-nix");
    await writeFile(shim, `#!/bin/sh\nprintf '%s\\n' "$*" >> ${JSON.stringify(marker)}\n`);
    await chmod(shim, 0o755);
    await expect(
      exec("npm", ["run", "dependency:run-scripts", "--", "safe-fixture@1.2.3"], {
        cwd: repositoryRoot,
        env: {
          ...fixture.environment,
          LIRNA_DEPENDENCY_PROJECT_ROOT: project,
          LIRNA_NIX_COMMAND: shim,
        },
      }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining("dependency decision") });

    await commitDecision(project, "safe-fixture@1.2.3.scripts.json", {
      package: "safe-fixture",
      version: "1.2.3",
      reason: "The exact synthetic package requires its documented lifecycle setup step.",
      assessmentDate: "2026-01-01T00:00:00.000Z",
    });
    await exec("npm", ["run", "dependency:run-scripts", "--", "safe-fixture@1.2.3"], {
      cwd: repositoryRoot,
      env: {
        ...fixture.environment,
        LIRNA_DEPENDENCY_PROJECT_ROOT: project,
        LIRNA_NIX_COMMAND: shim,
      },
    });
    const invocations = await readFile(marker, "utf8");
    expect(invocations).toContain("--command npm ci --ignore-scripts --no-audit --no-fund");
    expect(invocations).toContain("--command npm rebuild safe-fixture --no-audit --no-fund");
  });
});

async function syntheticProject() {
  const workspace = await mkdtemp(join(tmpdir(), "lirna-dependency-project-"));
  workspaces.push(workspace);
  await writeFile(
    join(workspace, "package.json"),
    `${JSON.stringify({ name: "synthetic-consumer", version: "1.0.0", private: true }, null, 2)}\n`,
  );
  await exec(
    "npm",
    ["install", "--package-lock-only", "--ignore-scripts", "--offline", "--no-audit"],
    { cwd: workspace },
  );
  await exec("git", ["init", "--quiet"], { cwd: workspace });
  await commitAll(workspace, "Synthetic Agent", "agent@example.test", "Initialize fixture");
  return workspace;
}

async function commitDecision(project: string, filename: string, record: object) {
  const directory = join(project, "config", "dependency-decisions");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, filename), `${JSON.stringify(record, null, 2)}\n`);
  await commitAll(project, "Synthetic Agent", "agent@example.test", `Record ${filename}`);
}

async function commitAll(project: string, name: string, email: string, message: string) {
  await exec("git", ["add", "."], { cwd: project });
  await exec("git", ["commit", "--quiet", "-m", message], {
    cwd: project,
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: name,
      GIT_AUTHOR_EMAIL: email,
      GIT_COMMITTER_NAME: name,
      GIT_COMMITTER_EMAIL: email,
    },
  });
}

async function syntheticPackageArchive(marker: string, options: FixtureOptions = {}) {
  const workspace = await mkdtemp(join(tmpdir(), "lirna-package-fixture-"));
  workspaces.push(workspace);
  const packageRoot = join(workspace, "package");
  await mkdir(packageRoot);
  await writeFile(
    join(packageRoot, "package.json"),
    JSON.stringify({
      name: "safe-fixture",
      version: "1.2.3",
      main: "index.js",
      scripts: options.lifecycle
        ? {
            postinstall: `node -e "require('node:fs').writeFileSync('${marker}', 'script')"`,
          }
        : {},
    }),
  );
  await writeFile(
    join(packageRoot, "index.js"),
    `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "module");\n`,
  );
  if (options.nativeBuild) await writeFile(join(packageRoot, "binding.gyp"), "{}\n");
  const archivePath = join(workspace, "safe-fixture.tgz");
  await exec("tar", ["-czf", archivePath, "package"], { cwd: workspace });
  return readFile(archivePath);
}

type FixtureOptions = {
  archived?: boolean;
  created?: string;
  deprecated?: string;
  downloads?: number;
  lifecycle?: boolean;
  nativeBuild?: boolean;
  osvUnavailable?: boolean;
  provenance?: boolean;
  releaseDate?: string;
  repository?: undefined;
  repositoryName?: string;
  similar?: boolean;
  vulnerability?: string;
  vulnerabilitySeverity?: string;
};

async function startRegistry(
  servedArchive: Buffer,
  integrityArchive = servedArchive,
  options: FixtureOptions = {},
) {
  const integrity = `sha512-${createHash("sha512").update(integrityArchive).digest("base64")}`;
  let origin = "";
  let archiveRequests = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", origin);
    response.setHeader("content-type", "application/json");
    if (url.pathname === "/safe-fixture/-/safe-fixture-1.2.3.tgz") {
      archiveRequests += 1;
      response.setHeader("content-type", "application/octet-stream");
      response.end(servedArchive);
      return;
    }
    if (url.pathname === "/-/v1/search") {
      response.end(
        JSON.stringify({
          objects: [
            { package: { name: "safe-fixture" } },
            options.similar
              ? {
                  package: {
                    name: "safe-fixtures",
                    date: "2020-01-01T00:00:00.000Z",
                  },
                }
              : { package: { name: "safe-fixtures" } },
          ],
        }),
      );
      return;
    }
    if (url.pathname.startsWith("/-/npm/v1/attestations/")) {
      if (options.provenance === false) response.statusCode = 404;
      response.end(JSON.stringify({ attestations: [{ predicateType: "synthetic" }] }));
      return;
    }
    if (url.pathname.startsWith("/downloads/")) {
      response.end(JSON.stringify({ downloads: options.downloads ?? 4321 }));
      return;
    }
    if (url.pathname === "/osv") {
      if (options.osvUnavailable) response.statusCode = 503;
      response.end(
        JSON.stringify({
          vulns: options.vulnerability
            ? [
                {
                  id: options.vulnerability,
                  database_specific: { severity: options.vulnerabilitySeverity },
                },
              ]
            : [],
        }),
      );
      return;
    }
    if (url.pathname.startsWith("/github/")) {
      response.end(
        JSON.stringify({
          archived: options.archived ?? false,
          full_name: options.repositoryName ?? "synthetic-owner/safe-fixture",
          owner: { login: "synthetic-owner" },
          pushed_at: "2025-01-01T00:00:00.000Z",
        }),
      );
      return;
    }
    if (url.pathname === "/scorecard/github.com/synthetic-owner/safe-fixture") {
      response.end(JSON.stringify({ score: 8 }));
      return;
    }
    if (url.pathname === "/safe-fixture") {
      response.end(JSON.stringify(packument(origin, integrity, options)));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("synthetic registry did not listen");
  origin = `http://127.0.0.1:${address.port}`;
  return {
    environment: {
      ...process.env,
      LIRNA_NPM_REGISTRY: `${origin}/`,
      LIRNA_NPM_DOWNLOADS_URL: `${origin}/downloads/`,
      LIRNA_OSV_URL: `${origin}/osv`,
      LIRNA_GITHUB_API_URL: `${origin}/github/`,
      LIRNA_SCORECARD_API_URL: `${origin}/scorecard/`,
      LIRNA_ASSESSMENT_NOW: "2026-01-01T00:00:00.000Z",
    },
    integrity,
    tarballRequests: () => archiveRequests,
  };
}

function packument(origin: string, integrity: string, options: FixtureOptions) {
  const release = {
    name: "safe-fixture",
    version: "1.2.3",
    author: { name: "Synthetic Author" },
    _npmUser: { name: "Release Publisher" },
    repository:
      options.repository === undefined && "repository" in options
        ? undefined
        : {
            type: "git",
            url: "https://github.com/synthetic-owner/safe-fixture.git",
          },
    deprecated: options.deprecated,
    dist: {
      integrity,
      tarball: `${origin}/safe-fixture/-/safe-fixture-1.2.3.tgz`,
    },
  };
  return {
    name: "safe-fixture",
    "dist-tags": { latest: "1.2.3" },
    maintainers: [{ name: "Current Maintainer" }],
    time: {
      created: options.created ?? "2020-01-01T00:00:00.000Z",
      "1.0.0": "2020-01-01T00:00:00.000Z",
      "1.2.3": options.releaseDate ?? "2025-06-01T00:00:00.000Z",
      modified: "2025-06-02T00:00:00.000Z",
    },
    versions: {
      "1.0.0": { name: "safe-fixture", version: "1.0.0" },
      "1.2.3": release,
    },
  };
}
