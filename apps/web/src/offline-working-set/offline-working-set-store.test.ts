import { expect, test } from "bun:test";

import { readingWorkspaceFixture } from "@/components/reading-workspace/source-information-test-fixture";
import type { OfflineWorkingSetTarget } from "./offline-working-set";
import { createMemoryOfflineWorkingSets } from "./offline-working-set-test-support";

const target: OfflineWorkingSetTarget = {
  sourceId: "10000000-0000-4000-8000-000000000000",
  stateId: "20000000-0000-4000-8000-000000000000",
};

test("owns retention, currentness, and recoverable removal behind one interface", async () => {
  const progress: Array<[number, number]> = [];
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: fixture,
  });

  await expect(
    workingSets.inspect(target, {
      activationId: "40000000-0000-4000-8000-000000000000",
      currentStateId: target.stateId,
    }),
  ).resolves.toEqual({ status: "absent" });
  await expect(
    workingSets.retain(target, (completed, total) =>
      progress.push([completed, total]),
    ),
  ).resolves.toMatchObject({
    status: "available",
    availability: "ready",
    replicaBytes: expect.any(Number),
    referencedResourceBytes: 1200,
    referencedResourceCount: 1,
  });
  expect(progress).toEqual([
    [0, 2],
    [1, 2],
    [2, 2],
  ]);

  await expect(
    workingSets.inspect(target, { activationId: "new-activation" }),
  ).resolves.toMatchObject({ availability: "stale" });
  await expect(workingSets.restore(target)).rejects.toThrow(
    "must have removal requested before it can be restored",
  );
  await expect(workingSets.confirmRemoval(target)).rejects.toThrow(
    "must have removal requested before it can be removed",
  );
  await expect(workingSets.requestRemoval(target)).resolves.toMatchObject({
    availability: "pending-removal",
  });
  await expect(workingSets.open(target)).resolves.toMatchObject({
    status: "available",
    workspace: { source: { id: target.sourceId } },
  });
  await expect(workingSets.restore(target)).resolves.toMatchObject({
    availability: "ready",
  });
  await expect(workingSets.restore(target)).rejects.toThrow(
    "must have removal requested before it can be restored",
  );
  await expect(workingSets.confirmRemoval(target)).rejects.toThrow(
    "must have removal requested before it can be removed",
  );
  await workingSets.requestRemoval(target);
  await expect(workingSets.confirmRemoval(target)).resolves.toEqual({
    status: "absent",
  });
  await expect(workingSets.open(target)).resolves.toEqual({ status: "absent" });
});

test("validates a replacement before preserving it and leaves the prior replica usable", async () => {
  let snapshot = await fixture();
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: async () => snapshot,
  });
  await workingSets.retain(target);
  const prior = await workingSets.open(target);

  snapshot = structuredClone(snapshot);
  snapshot.replica.workspace.reading.source.title = "Unverified replacement";
  await expect(workingSets.retain(target)).rejects.toThrow(
    "typed Reading replica failed local SHA-256 validation",
  );
  await expect(workingSets.open(target)).resolves.toEqual(prior);
});

test("rejects a foreign replacement before changing the retained target", async () => {
  let snapshot = await fixture();
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: async () => snapshot,
  });
  await workingSets.retain(target);
  const prior = await workingSets.open(target);

  snapshot = structuredClone(snapshot);
  snapshot.replica.workspace.state.sourceId = "foreign-source";
  snapshot.manifest.replicaSha256 = await hash(
    JSON.stringify(snapshot.replica),
  );
  await expect(workingSets.retain(target)).rejects.toThrow(
    "does not match the requested Source state",
  );
  await expect(workingSets.open(target)).resolves.toEqual(prior);
});

test("validates the typed replica without claiming local Source-resource bodies", async () => {
  const snapshot = await fixture();
  snapshot.manifest.resources[0].byteLength += 1;
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: async () => snapshot,
  });

  await expect(workingSets.retain(target)).resolves.toMatchObject({
    status: "available",
    referencedResourceBytes: 1200,
  });
});

test("reports unsupported persisted records through the module interface", async () => {
  const records = new Map<string, unknown>([
    [`${target.sourceId}:${target.stateId}`, { manifest: { version: 2 } }],
  ]);
  const { workingSets } = createMemoryOfflineWorkingSets({
    fetchSnapshot: fixture,
    records,
  });

  await expect(workingSets.inspect(target)).rejects.toThrow(
    "version is unsupported or corrupt",
  );
});

async function fixture() {
  const workspace = readingWorkspaceFixture();
  if (!workspace.state) throw new Error("Fixture requires a first-class state");
  const replica = {
    workspace: { ...workspace, state: workspace.state },
    annotations: [],
    positions: [],
  };
  const resource = workspace.state.resources[0];
  const activation = workspace.state.derivatives[0]?.currentActivation;
  if (!(resource && activation))
    throw new Error("Fixture requires retention data");
  return {
    manifest: {
      version: 1 as const,
      sourceId: target.sourceId,
      stateId: target.stateId,
      synchronizedAt: "2026-08-25T12:00:00.000Z",
      activeDerivative: {
        id: activation.derivativeId,
        activationId: activation.id,
        sha256: "a".repeat(64),
        byteLength: 100,
      },
      resources: [
        {
          identity: resource.identity,
          role: resource.role,
          byteLength: resource.byteLength,
          sha256: resource.sha256,
        },
      ],
      replicaBytes: new TextEncoder().encode(JSON.stringify(replica))
        .byteLength,
      referencedResourceBytes: resource.byteLength,
      replicaSha256: await hash(JSON.stringify(replica)),
      serverRetention: { state: "ready" as const, reasons: [] },
      clientAvailability: {
        state: "unknown" as const,
        reason: "Client validation required",
      },
    },
    replica,
  };
}

async function hash(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
