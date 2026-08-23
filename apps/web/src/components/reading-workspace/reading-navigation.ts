import type {
  ReadingNavigationCause,
  ReadingScrollOwner,
} from "./navigation-observations";
import {
  observeReadingNavigation,
  readingToolsOwnerFor,
} from "./navigation-observations";

export interface ReadingNavigationIntent {
  owner: ReadingScrollOwner;
  cause: ReadingNavigationCause;
  target: string;
}

export interface ReadingNavigationHandle {
  active: () => boolean;
  cancel: () => void;
  commit: (
    movement: ReadingNavigationMovement,
    observation?: ReadingNavigationIntent,
  ) => boolean;
  commitTransition: (transition: () => void) => boolean;
}

export type ReadingNavigationMovement =
  | {
      behavior?: ScrollBehavior;
      kind: "position";
      scrollContainer?: HTMLElement | null;
      top: number;
    }
  | {
      kind: "target";
      scrollContainer?: HTMLElement | null;
      target: HTMLElement;
    };

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
        commit(movement, observation = intent) {
          if (!active() || ownerIntent.committed) {
            return false;
          }
          if (observation.owner !== intent.owner) return false;
          if (
            !move(intent.owner, movement, () =>
              observeReadingNavigation(observation),
            )
          )
            return false;
          ownerIntent.committed = true;
          release(intent, ownerIntent, activeByOwner);
          return true;
        },
        commitTransition(transition) {
          if (!active() || ownerIntent.committed) return false;
          ownerIntent.committed = true;
          transition();
          release(intent, ownerIntent, activeByOwner);
          return true;
        },
      };
    },
  };
}

function move(
  owner: ReadingScrollOwner,
  movement: ReadingNavigationMovement,
  beforeMove: () => void,
) {
  const { scrollContainer } = movement;
  if (owner === "article") {
    if (scrollContainer) return false;
    beforeMove();
    if (movement.kind === "target") {
      movement.target.scrollIntoView({ block: "center" });
    } else {
      window.scrollTo(scrollOptions(movement));
    }
    return true;
  }
  if (!scrollContainer || readingToolsOwnerFor(scrollContainer) !== owner)
    return false;
  beforeMove();
  if (movement.kind === "position") {
    scrollContainer.scrollTo(scrollOptions(movement));
    return true;
  }
  if (!scrollContainer.contains(movement.target)) return false;
  const containerRect = scrollContainer.getBoundingClientRect();
  const targetRect = movement.target.getBoundingClientRect();
  scrollContainer.scrollTo({
    top:
      scrollContainer.scrollTop +
      targetRect.top -
      containerRect.top -
      (scrollContainer.clientHeight - targetRect.height) / 2,
  });
  return true;
}

function scrollOptions(
  movement: Extract<ReadingNavigationMovement, { kind: "position" }>,
): ScrollToOptions {
  return movement.behavior
    ? { behavior: movement.behavior, top: movement.top }
    : { top: movement.top };
}

function release(
  intent: ReadingNavigationIntent,
  ownerIntent: OwnerIntent,
  activeByOwner: Map<ReadingScrollOwner, OwnerIntent>,
) {
  if (
    ownerIntent.cause !== "explicit-fragment-arrival" &&
    activeByOwner.get(intent.owner)?.epoch === ownerIntent.epoch
  ) {
    activeByOwner.delete(intent.owner);
  }
}
