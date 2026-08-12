import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileArtifactStore } from "../../server/artifacts/file-artifact-store.js";
import { migrate } from "../../server/database/migrate.js";
import {
  ArtifactRegistry,
  type ArtifactMetadata,
} from "../../server/artifacts/artifact-registry.js";
import { resetTestDatabase } from "./database-test-support.js";

/**
 * Integration tests at the ArtifactRegistry contract seam. They prove that an
 * immutable synthetic artifact is preserved by a content-addressed adapter
 * while PostgreSQL owns its identity, hash, source-handling policy, Provenance,
 * and references, and that reconciliation makes integrity problems visible
 * without silently repairing authoritative metadata. All fixtures are
 * synthetic, non-sensitive bytes.
 */
describe("artifact registry", () => {
  let databaseUrl: string;
  let stopDatabase: () => Promise<void>;
  let temporaryRoot: string;
  let registry: ArtifactRegistry;
  let store: FileArtifactStore;

  beforeAll(async () => {
    if (process.env.TEST_DATABASE_URL) {
      databaseUrl = process.env.TEST_DATABASE_URL;
      stopDatabase = async () => {};
    } else {
      const container = await new PostgreSqlContainer("postgres:16-alpine").start();
      databaseUrl = container.getConnectionUri();
      stopDatabase = () => container.stop().then(() => undefined);
    }
    await migrate(databaseUrl);
    await resetTestDatabase(databaseUrl);
    temporaryRoot = await mkdtemp(join(tmpdir(), "lirna-artifacts-"));
    store = new FileArtifactStore(join(temporaryRoot, "artifacts"));
    registry = new ArtifactRegistry(databaseUrl, store);
  });

  afterAll(async () => {
    await registry?.close();
    await stopDatabase?.();
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it("resolves identical bytes to one content-addressed identity", async () => {
    const content = Buffer.from("synthetic fixture: identical bytes\n", "utf8");
    const expectedHash = createHash("sha256").update(content).digest("hex");

    const first = await registry.register({
      content,
      policy: { sensitivity: "local-only", rightsBasis: "owned" },
      provenance: { origin: "original-reasoning", detail: "synthetic fixture" },
      references: [{ kind: "source", targetId: "src-1" }],
    });
    const second = await registry.register({
      content,
      policy: { sensitivity: "local-only", rightsBasis: "owned" },
      provenance: { origin: "original-reasoning", detail: "synthetic fixture" },
      references: [{ kind: "source", targetId: "src-1" }],
    });

    expect(first.hash).toBe(expectedHash);
    expect(second.hash).toBe(expectedHash);
    expect(first).toEqual(second);
    expect(first.byteSize).toBe(content.byteLength);
  });

  it("keeps the first registration's metadata when identical bytes recur with different metadata", async () => {
    const content = Buffer.from("synthetic fixture: divergent metadata\n", "utf8");
    const first = await registry.register({
      content,
      policy: { sensitivity: "local-only", rightsBasis: "owned" },
      provenance: { origin: "original-reasoning", detail: "first registration" },
      references: [{ kind: "source", targetId: "src-original" }],
    });

    const second = await registry.register({
      content,
      policy: { sensitivity: "ordinary-cloud", rightsBasis: "publicly-accessible" },
      provenance: { origin: "personal-observation", detail: "competing registration" },
      references: [{ kind: "owned-note", targetId: "note-competing" }],
    });

    // Identity is stable; the second registration creates no conflicting identity
    // and does not overwrite the first registration's authoritative policy or
    // Provenance. Distinct references accumulate idempotently (a repeated
    // reference would add nothing); the identity never forks.
    expect(second.hash).toBe(first.hash);
    expect(second.policy.sensitivity).toBe("local-only");
    expect(second.provenance.detail).toBe("first registration");
    expect(second.references).toEqual([
      { kind: "owned-note", targetId: "note-competing" },
      { kind: "source", targetId: "src-original" },
    ]);

    // A third registration repeating the original reference adds nothing.
    const third = await registry.register({
      content,
      policy: { sensitivity: "ordinary-cloud", rightsBasis: "publicly-accessible" },
      provenance: { origin: "personal-observation", detail: "repeat" },
      references: [{ kind: "source", targetId: "src-original" }],
    });
    expect(third.references).toEqual([
      { kind: "owned-note", targetId: "note-competing" },
      { kind: "source", targetId: "src-original" },
    ]);
  });

  it("retains hash, policy, Provenance, and references in PostgreSQL", async () => {
    const content = Buffer.from("synthetic fixture: metadata retention\n", "utf8");
    const registered = await registry.register({
      content,
      policy: { sensitivity: "restricted-cloud", rightsBasis: "lawfully-acquired" },
      provenance: {
        origin: "published-source",
        detail: "a synthetic publication",
      },
      references: [
        { kind: "owned-note", targetId: "note-7", locator: "p.12" },
        { kind: "rendition", targetId: "rend-2" },
      ],
    });

    const view = await registry.view(registered.hash);
    expect(view).toBeDefined();
    const expected: ArtifactMetadata = {
      hash: registered.hash,
      byteSize: content.byteLength,
      policy: { sensitivity: "restricted-cloud", rightsBasis: "lawfully-acquired" },
      provenance: { origin: "published-source", detail: "a synthetic publication" },
      references: [
        { kind: "owned-note", targetId: "note-7", locator: "p.12" },
        { kind: "rendition", targetId: "rend-2" },
      ],
      registeredAt: registered.registeredAt,
    };
    expect(view).toEqual(expected);

    const bytes = await store.get(registered.hash);
    expect(bytes?.toString("utf8")).toBe(content.toString("utf8"));
  });

  it("reconciles a clean store with no discrepancies", async () => {
    const report = await registry.reconcile();
    expect(report.missing).toEqual([]);
    expect(report.unexpected).toEqual([]);
    expect(report.hashMismatch).toEqual([]);
  });

  it("reports a missing object without repairing metadata", async () => {
    const content = Buffer.from("synthetic fixture: missing from store\n", "utf8");
    const registered = await registry.register({
      content,
      policy: { sensitivity: "local-only", rightsBasis: "owned" },
      provenance: { origin: "original-reasoning", detail: "synthetic" },
    });

    await unlink(join(temporaryRoot, "artifacts", registered.hash.slice(0, 2), registered.hash));

    const report = await registry.reconcile();
    expect(report.missing).toContain(registered.hash);

    const view = await registry.view(registered.hash);
    expect(view?.hash).toBe(registered.hash);
  });

  it("reports an unexpected object without repairing storage", async () => {
    const orphan = Buffer.from("synthetic fixture: orphaned bytes\n", "utf8");
    const { hash } = await store.put(orphan);

    const report = await registry.reconcile();
    expect(report.unexpected).toContain(hash);

    const bytes = await store.get(hash);
    expect(bytes?.toString("utf8")).toBe(orphan.toString("utf8"));
  });

  it("reports a hash-mismatched object without repairing metadata", async () => {
    const content = Buffer.from("synthetic fixture: integrity baseline\n", "utf8");
    const registered = await registry.register({
      content,
      policy: { sensitivity: "local-only", rightsBasis: "owned" },
      provenance: { origin: "original-reasoning", detail: "synthetic" },
    });

    await writeFile(
      join(temporaryRoot, "artifacts", registered.hash.slice(0, 2), registered.hash),
      Buffer.from("tampered bytes", "utf8"),
    );

    const report = await registry.reconcile();
    const mismatch = report.hashMismatch.find((entry) => entry.hash === registered.hash);
    expect(mismatch).toBeDefined();
    expect(mismatch?.actualHash).not.toBe(registered.hash);

    const view = await registry.view(registered.hash);
    expect(view?.hash).toBe(registered.hash);
  });
});
