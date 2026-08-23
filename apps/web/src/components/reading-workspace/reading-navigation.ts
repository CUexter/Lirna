import type {
  ReadingNavigationCause,
  ReadingScrollOwner,
} from "./navigation-observations";

export interface ReadingNavigationIntent {
  owner: ReadingScrollOwner;
  cause: ReadingNavigationCause;
  target: string;
}

export interface ReadingNavigationHandle {
  active: () => boolean;
  cancel: () => void;
  commit: (move: () => void) => boolean;
}

export interface ReadingNavigation {
  cancel: (owner: ReadingScrollOwner) => void;
  request: (intent: ReadingNavigationIntent) => ReadingNavigationHandle;
}

interface OwnerIntent {
  cause: ReadingNavigationCause;
  committed: boolean;
  epoch: number;
}

export function createReadingNavigation(): ReadingNavigation {
  const activeByOwner = new Map<ReadingScrollOwner, OwnerIntent>();
  const epochs = new Map<ReadingScrollOwner, number>();

  return {
    cancel(owner) {
      activeByOwner.delete(owner);
    },
    request(intent) {
      const epoch = (epochs.get(intent.owner) ?? 0) + 1;
      epochs.set(intent.owner, epoch);
      const current = activeByOwner.get(intent.owner);
      const rejectedByExplicitNavigation =
        intent.cause === "resume" &&
        current !== undefined &&
        [
          "citation-return",
          "explicit-fragment-arrival",
          "pending-fragment",
          "reference-target",
        ].includes(current.cause);
      const ownerIntent: OwnerIntent = {
        cause: intent.cause,
        committed: false,
        epoch,
      };

      if (!rejectedByExplicitNavigation) {
        activeByOwner.set(intent.owner, ownerIntent);
      }

      const active = () =>
        activeByOwner.get(intent.owner)?.epoch === ownerIntent.epoch;
      return {
        active,
        cancel() {
          if (active()) {
            activeByOwner.delete(intent.owner);
          }
        },
        commit(move) {
          if (!active() || ownerIntent.committed) {
            return false;
          }
          ownerIntent.committed = true;
          move();
          if (
            ownerIntent.cause !== "explicit-fragment-arrival" &&
            activeByOwner.get(intent.owner)?.epoch === ownerIntent.epoch
          ) {
            activeByOwner.delete(intent.owner);
          }
          return true;
        },
      };
    },
  };
}
