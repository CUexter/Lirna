import { randomUUID } from "node:crypto";
import { SepAdmissionError, type SepCaptureClient } from "../capture/client";
import type {
  SepAdmissionOperations,
  SepAdmissionPreview,
  SepAdmissionStore,
} from "./contract";
import { observeDegradedCapture, observeOperation } from "./observation";
import { toSepAdmissionPreview } from "./preview";

export type {
  SepAdmissionCreateRecord,
  SepAdmissionOperations,
  SepAdmissionPreview,
  SepAdmissionResult,
  SepAdmissionStore,
  SepAdmissionStoredPreview,
} from "./contract";

const previewLifetimeMilliseconds = 7 * 24 * 60 * 60 * 1000;

export function createSepAdmissionOperations(options: {
  store: SepAdmissionStore;
  capture: SepCaptureClient;
  now?: () => Date;
}): SepAdmissionOperations {
  const now = options.now ?? (() => new Date());

  async function read(id: string): Promise<SepAdmissionPreview | undefined> {
    const readAt = now();
    await options.store.deleteExpired(readAt);
    const stored = await options.store.getActive(id, readAt);
    return stored ? toSepAdmissionPreview(stored) : undefined;
  }

  return {
    async submit(url, observation, replacesSourceId) {
      return observeOperation(
        "submit",
        observation,
        async (stage, operationId) => {
          const createdAt = now();
          await options.store.deleteExpired(createdAt);
          const captured = await options.capture.capture(
            url,
            "standard",
            stage,
          );
          observeDegradedCapture(
            observation,
            captured.captureReport,
            "submit",
            operationId,
          );
          stage("preview_persistence");
          const id = randomUUID();
          await options.store.create({
            id,
            ...captured,
            replacesSourceId,
            createdAt,
            expiresAt: new Date(
              createdAt.getTime() + previewLifetimeMilliseconds,
            ),
          });
          const preview = await read(id);
          if (!preview) {
            throw new Error(
              `SEP Admission preview ${id} vanished after persistence`,
            );
          }
          return preview;
        },
      );
    },
    get: read,
    async checkUpdate(sourceId, observation) {
      const target = await options.store.getUpdateTarget(sourceId);
      if (!target) return undefined;
      const preview = await this.submit(
        target.canonicalUrl,
        observation,
        sourceId,
      );
      if (!preview.update || preview.update.sourceId !== sourceId) {
        throw new SepAdmissionError(
          "The captured publication does not match this Source identity",
        );
      }
      if (preview.stableKey !== target.stableKey) {
        await options.store.delete(preview.id);
        throw new SepAdmissionError(
          "The captured publication does not match this Source identity",
        );
      }
      return preview;
    },
    async extend(id) {
      const extendedAt = now();
      await options.store.deleteExpired(extendedAt);
      const updated = await options.store.extendActive(
        id,
        extendedAt,
        new Date(extendedAt.getTime() + previewLifetimeMilliseconds),
      );
      return updated ? read(id) : undefined;
    },
    delete: (id) => options.store.delete(id),
    async retry(id, observation) {
      return observeOperation(
        "retry",
        observation,
        async (stage, operationId) => {
          stage("validation");
          const retriedAt = now();
          await options.store.deleteExpired(retriedAt);
          const claim = await options.store.claimExpandedRetry(id, retriedAt);
          if (claim === "unavailable") return undefined;
          if (claim === "already-used") {
            throw new SepAdmissionError(
              "The expanded capture budget has already been used for this preview",
            );
          }
          const existing = await options.store.getActive(id, retriedAt);
          if (!existing) return undefined;
          const captured = await options.capture.capture(
            existing.preview.submittedUrl,
            "expanded",
            stage,
          );
          observeDegradedCapture(
            observation,
            captured.captureReport,
            "retry",
            operationId,
          );
          stage("preview_persistence");
          const result = await options.store.replaceCapture(
            id,
            retriedAt,
            captured,
          );
          return result === "updated" ? read(id) : undefined;
        },
      );
    },
    async admit(id, observationKeys, observation) {
      return observeOperation("admit", observation, async (stage) => {
        stage("validation");
        if (observationKeys.length === 0) {
          throw new SepAdmissionError(
            "Select at least one observation to admit",
          );
        }
        if (new Set(observationKeys).size !== observationKeys.length) {
          throw new SepAdmissionError(
            "Each observation may be selected only once",
          );
        }
        const admittedAt = now();
        await options.store.deleteExpired(admittedAt);
        stage("database_persistence");
        return options.store.admit(id, observationKeys, admittedAt, stage);
      });
    },
  };
}
