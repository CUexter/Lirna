import { createHash } from "node:crypto";

import type { AnnotationRecord } from "../annotations/annotation-contract";
import type { ReadingPositionRecord } from "../reading-position/reading-position-contract";
import type { ReadingWorkspaceProjection } from "../reading-workspace/reading-workspace";
import { standardSepCaptureLimits } from "../sep-admission/sep-bundle";

const offlineWorkingSetVersion = 1 as const;

export function createOfflineWorkingSetSnapshot(input: {
  workspace: ReadingWorkspaceProjection;
  annotations: AnnotationRecord[];
  positions: ReadingPositionRecord[];
  synchronizedAt?: Date;
}) {
  const { reading, state } = input.workspace;
  const activeDerivative = state.derivatives.find(
    (derivative) => derivative.currentActivation,
  );
  if (!activeDerivative?.currentActivation) {
    throw new Error("Offline retention requires an active Reading Derivative");
  }

  const expected = new Map(
    reading.provenance.inputResourceHashes.map((resource) => [
      resource.identity,
      resource.sha256,
    ]),
  );
  const resources = state.resources.filter((resource) =>
    expected.has(resource.identity),
  );
  const limits = state.capture.limits ?? standardSepCaptureLimits;
  const maximumResources = limits.maxComponents + limits.maxAssets + 1;
  if (resources.length > maximumResources) {
    throw new Error("Offline working set exceeds its captured resource bound");
  }
  if (
    resources.some((resource) => resource.byteLength > limits.maxResourceBytes)
  )
    throw new Error(
      "Offline working set contains an oversized Source resource",
    );

  const reasons = [...state.capture.readinessReasons];
  for (const [identity, sha256] of expected) {
    const retained = resources.find(
      (resource) => resource.identity === identity,
    );
    if (!retained)
      reasons.push(`Required Source resource is missing: ${identity}`);
    else if (retained.sha256 !== sha256)
      reasons.push(`Required Source resource failed integrity: ${identity}`);
  }
  const replica = {
    workspace: input.workspace,
    annotations: input.annotations,
    positions: input.positions,
  };
  const serialized = JSON.stringify(replica);
  const replicaBytes = Buffer.byteLength(serialized);
  const resourceBytes = resources.reduce(
    (total, resource) => total + resource.byteLength,
    0,
  );
  if (resourceBytes > limits.maxTotalBytes)
    throw new Error("Offline working set exceeds its captured byte bound");
  if (replicaBytes > limits.maxTotalBytes)
    throw new Error(
      "Offline working set replica exceeds its captured byte bound",
    );
  const totalBytes = replicaBytes + resourceBytes;
  const synchronizedAt = (input.synchronizedAt ?? new Date()).toISOString();

  return {
    manifest: {
      version: offlineWorkingSetVersion,
      sourceId: state.sourceId,
      stateId: state.id,
      synchronizedAt,
      activeDerivative: {
        id: activeDerivative.id,
        activationId: activeDerivative.currentActivation.id,
        sha256: sha256(JSON.stringify(reading)),
        byteLength: Buffer.byteLength(JSON.stringify(reading)),
      },
      resources: resources.map(({ identity, role, byteLength, sha256 }) => ({
        identity,
        role,
        byteLength,
        sha256,
      })),
      totalBytes,
      payloadSha256: sha256(serialized),
      serverRetention: {
        state: reasons.length === 0 ? ("ready" as const) : ("partial" as const),
        reasons,
      },
      clientAvailability: {
        state: "unknown" as const,
        reason:
          "This server manifest cannot claim availability until this Client installation validates its replica.",
      },
    },
    replica,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
