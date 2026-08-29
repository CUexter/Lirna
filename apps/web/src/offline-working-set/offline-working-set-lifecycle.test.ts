import { expect, test } from "bun:test";

import { createBrowserOfflineWorkingSetLifecycle } from "./offline-working-set-lifecycle";

test("bridges lifecycle changes between separate tab notification adapters", () => {
  const channels = channelPair();
  const firstTab = createBrowserOfflineWorkingSetLifecycle(channels.first);
  const secondTab = createBrowserOfflineWorkingSetLifecycle(channels.second);
  const changes: unknown[] = [];
  const localChanges: unknown[] = [];
  const unsubscribe = secondTab.subscribe((change) => changes.push(change));
  const unsubscribeLocal = firstTab.subscribeLocalAndRemote((change) =>
    localChanges.push(change),
  );

  firstTab.publish({
    sourceId: "10000000-0000-4000-8000-000000000000",
    stateId: "20000000-0000-4000-8000-000000000000",
  });

  expect(changes).toEqual([
    {
      sourceId: "10000000-0000-4000-8000-000000000000",
      stateId: "20000000-0000-4000-8000-000000000000",
    },
  ]);
  expect(localChanges).toEqual(changes);
  unsubscribe();
  unsubscribeLocal();
});

function channelPair() {
  let firstListener: ((event: MessageEvent<unknown>) => void) | undefined;
  let secondListener: ((event: MessageEvent<unknown>) => void) | undefined;
  return {
    first: {
      addEventListener(
        _type: "message",
        listener: (event: MessageEvent<unknown>) => void,
      ) {
        firstListener = listener;
      },
      postMessage(message: unknown) {
        secondListener?.({ data: message } as MessageEvent<unknown>);
      },
    },
    second: {
      addEventListener(
        _type: "message",
        listener: (event: MessageEvent<unknown>) => void,
      ) {
        secondListener = listener;
      },
      postMessage(message: unknown) {
        firstListener?.({ data: message } as MessageEvent<unknown>);
      },
    },
  };
}
