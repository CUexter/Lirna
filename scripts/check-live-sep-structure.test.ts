import { expect, test } from "bun:test";

import { runLiveSepStructuralCheck } from "./check-live-sep-structure";

test("checks only bounded entry and citation structure without admitting data", async () => {
  const requested: string[] = [];
  const delays: number[] = [];
  const result = await runLiveSepStructuralCheck({
    delay: async (milliseconds) => {
      delays.push(milliseconds);
    },
    fetchResource: (async (input) => {
      const url = new URL(String(input));
      requested.push(url.href);
      return new Response(
        url.pathname.startsWith("/entries/")
          ? '<title>Synthetic SEP</title><div id="toc"></div><h2>Claim</h2><a href="notes.html">Notes</a>'
          : "<p>Metaphysics Research Lab, Stanford University</p>",
        { headers: { "content-type": "text/html" } },
      );
    }) as typeof fetch,
  });

  expect(result.requests).toBe(2);
  expect(delays).toEqual([1000]);
  expect(requested).toEqual([
    "https://plato.stanford.edu/entries/logic-classical/",
    "https://plato.stanford.edu/cgi-bin/encyclopedia/archinfo.cgi?entry=logic-classical",
  ]);
  expect(result).not.toHaveProperty("resources");
  expect(result).not.toHaveProperty("body");
});

test("rejects redirects outside the SEP origin before following them", async () => {
  let requests = 0;
  await expect(
    runLiveSepStructuralCheck({
      delay: async () => undefined,
      fetchResource: (async () => {
        requests += 1;
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        });
      }) as typeof fetch,
    }),
  ).rejects.toThrow("restricted to HTTPS plato.stanford.edu");
  expect(requests).toBe(1);
});

test("rejects redirects to another entry on the SEP origin", async () => {
  let requests = 0;
  await expect(
    runLiveSepStructuralCheck({
      delay: async () => undefined,
      fetchResource: (async () => {
        requests += 1;
        return new Response(null, {
          status: 302,
          headers: {
            location: "https://plato.stanford.edu/entries/different-entry/",
          },
        });
      }) as typeof fetch,
    }),
  ).rejects.toThrow("left the selected entry boundary");
  expect(requests).toBe(1);
});

test("throttles every redirect request and reports the actual request count", async () => {
  const delays: number[] = [];
  let requests = 0;
  const result = await runLiveSepStructuralCheck({
    delay: async (milliseconds) => {
      delays.push(milliseconds);
    },
    fetchResource: (async (input) => {
      requests += 1;
      const url = new URL(String(input));
      if (requests === 1) {
        return new Response(null, {
          status: 302,
          headers: { location: url.href },
        });
      }
      return new Response(
        url.pathname.startsWith("/entries/")
          ? '<title>Synthetic SEP</title><div id="toc"></div><h2>Claim</h2><a href="notes.html">Notes</a>'
          : "<p>Metaphysics Research Lab, Stanford University</p>",
      );
    }) as typeof fetch,
  });

  expect(result.requests).toBe(3);
  expect(delays).toEqual([1000, 1000]);
});

test("cancels an undeclared streaming response at the byte bound", async () => {
  let cancelled = false;
  const oversized = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array(1_000_001));
    },
    cancel() {
      cancelled = true;
    },
  });

  await expect(
    runLiveSepStructuralCheck({
      delay: async () => undefined,
      fetchResource: (async () =>
        new Response(oversized, {
          headers: { "content-type": "text/html" },
        })) as typeof fetch,
    }),
  ).rejects.toThrow("exceeds the 2 MB bound");
  expect(cancelled).toBe(true);
});
