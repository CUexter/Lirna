import { describe, expect, test } from "bun:test";

import type { SepCaptureLimits } from "./bundle";
import { createSepCaptureClient } from "./client";
import {
  controlledCitationBody,
  controlledTransport,
  type FixturePage,
  html,
  htmlBody,
  image,
  redirect,
} from "./test-support";

describe("SEP source-state capture limits", () => {
  test("stops visibly at component, asset, depth, per-resource, and total-byte limits", async () => {
    const cases: Array<{
      name: string;
      main: string;
      pages: Map<string, FixturePage>;
      limits: Partial<SepCaptureLimits>;
      reason: RegExp;
    }> = [
      {
        name: "component",
        main: '<main><a href="notes.html">Notes</a></main>',
        pages: new Map([
          ["/entries/limited/notes.html", html("<main>Notes.</main>")],
        ]),
        limits: { maxComponents: 1 },
        reason: /Component limit reached/,
      },
      {
        name: "asset",
        main: '<main><img src="one.png"><img src="two.png"></main>',
        pages: new Map([
          ["/entries/limited/one.png", image(Buffer.from("one"))],
          ["/entries/limited/two.png", image(Buffer.from("two"))],
        ]),
        limits: { maxAssets: 1 },
        reason: /Asset limit reached/,
      },
      {
        name: "depth",
        main: '<main><a href="notes.html">Notes</a></main>',
        pages: new Map([
          [
            "/entries/limited/notes.html",
            html('<main><a href="supplement.html">Supplement</a></main>'),
          ],
          [
            "/entries/limited/supplement.html",
            html("<main>Supplement.</main>"),
          ],
        ]),
        limits: { maxDepth: 1 },
        reason: /Recursion depth limit 1 reached/,
      },
      {
        name: "per-resource bytes",
        main: '<main><img src="large.png"></main>',
        pages: new Map([
          ["/entries/limited/large.png", image(Buffer.alloc(600, 1))],
        ]),
        limits: { maxResourceBytes: 500 },
        reason: /500-byte capture limit/,
      },
      {
        name: "total bytes",
        main: '<main><img src="small.png"></main>',
        pages: new Map([
          ["/entries/limited/small.png", image(Buffer.from("asset"))],
        ]),
        limits: {
          maxTotalBytes:
            Buffer.byteLength(htmlBody('<main><img src="small.png"></main>')) +
            Buffer.byteLength(controlledCitationBody) +
            2,
        },
        reason: /byte capture limit/,
      },
    ];

    for (const fixtureCase of cases) {
      const pages = new Map(fixtureCase.pages);
      pages.set("/entries/limited/", html(fixtureCase.main));
      const capture = createSepCaptureClient({
        fetch: controlledTransport("limited", pages),
        limits: fixtureCase.limits,
      });
      const result = await capture.capture(
        "https://plato.stanford.edu/entries/limited/",
      );
      expect(result.captureReport.completeness, fixtureCase.name).toBe(
        "stopped",
      );
      expect(
        result.captureReport.unresolvedResources.some(
          ({ reason, limit }) => limit && fixtureCase.reason.test(reason),
        ),
        fixtureCase.name,
      ).toBe(true);
    }
  });

  test("revalidates optional redirects and reports content mismatches", async () => {
    const requested: string[] = [];
    const pages = new Map<string, FixturePage>([
      [
        "/entries/revalidate/",
        html(
          '<main><a href="notes.html">Notes</a><img src="figure.png"></main>',
        ),
      ],
      [
        "/entries/revalidate/notes.html",
        redirect("https://example.com/private.html"),
      ],
      ["/entries/revalidate/figure.png", html("not an image")],
    ]);
    const capture = createSepCaptureClient({
      fetch: controlledTransport("revalidate", pages, requested),
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/entries/revalidate/",
    );

    expect(requested).not.toContain("/private.html");
    expect(result.captureReport.completeness).toBe("partial");
    expect(
      result.captureReport.unresolvedResources.map(({ reason }) => reason),
    ).toEqual([
      expect.stringContaining("outside the HTTPS SEP origin"),
      expect.stringContaining("unexpected media type text/html"),
    ]);
  });

  test("enforces redirect, timeout, and concurrency ceilings", async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const pages = new Map<string, FixturePage>([
      [
        "/entries/ceilings/",
        html(
          '<main><a href="notes.html">Notes</a><a href="supplement.html">Supplement</a></main>',
        ),
      ],
      ["/entries/ceilings/notes.html", redirect("next.html")],
      ["/entries/ceilings/next.html", redirect("last.html")],
      ["/entries/ceilings/last.html", html("<main>Last.</main>")],
      ["/entries/ceilings/supplement.html", { timeout: true }],
    ]);
    const baseTransport = controlledTransport("ceilings", pages);
    const capture = createSepCaptureClient({
      fetch: (async (
        input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ) => {
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        try {
          return await baseTransport(input, init);
        } finally {
          activeRequests -= 1;
        }
      }) as unknown as typeof fetch,
      limits: {
        maxRedirects: 1,
        timeoutMilliseconds: 5,
        maxConcurrency: 1,
      },
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/entries/ceilings/",
    );

    expect(maximumActiveRequests).toBeLessThanOrEqual(1);
    expect(result.captureReport.completeness).toBe("partial");
    expect(
      result.captureReport.unresolvedResources.map(({ reason }) => reason),
    ).toEqual([
      expect.stringContaining("too many times"),
      expect.stringContaining("capture failed"),
    ]);
  });

  test("uses the configured optional concurrency without exceeding it", async () => {
    let activeRequests = 0;
    let maximumActiveRequests = 0;
    const pages = new Map<string, FixturePage>([
      [
        "/entries/parallel/",
        html(
          '<main><img src="one.png"><img src="two.png"><img src="three.png"></main>',
        ),
      ],
      ["/entries/parallel/one.png", image(Buffer.from("one"))],
      ["/entries/parallel/two.png", image(Buffer.from("two"))],
      ["/entries/parallel/three.png", image(Buffer.from("three"))],
    ]);
    const baseTransport = controlledTransport("parallel", pages);
    const capture = createSepCaptureClient({
      fetch: (async (
        input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ) => {
        const path = new URL(
          typeof input === "string" || input instanceof URL ? input : input.url,
        ).pathname;
        if (!path.endsWith(".png")) return baseTransport(input, init);
        activeRequests += 1;
        maximumActiveRequests = Math.max(maximumActiveRequests, activeRequests);
        await Bun.sleep(5);
        try {
          return await baseTransport(input, init);
        } finally {
          activeRequests -= 1;
        }
      }) as unknown as typeof fetch,
      limits: { maxConcurrency: 2 },
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/entries/parallel/",
    );

    expect(maximumActiveRequests).toBe(2);
    expect(result.captureReport.completeness).toBe("complete");
  });

  test("uses actual failed-response bytes before capturing later resources", async () => {
    const main = html(
      '<main><a href="missing.html">Missing</a><img src="small.png"></main>',
    );
    const pages = new Map<string, FixturePage>([
      ["/entries/actual-bytes/", main],
      ["/entries/actual-bytes/small.png", image(Buffer.from("ok"))],
    ]);
    const capture = createSepCaptureClient({
      fetch: controlledTransport("actual-bytes", pages),
      limits: {
        maxResourceBytes: 500,
        maxTotalBytes:
          Buffer.byteLength(main.body as string) +
          Buffer.byteLength(controlledCitationBody) +
          2,
      },
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/entries/actual-bytes/",
    );

    expect(result.captureReport.completeness).toBe("partial");
    expect(result.resources.map(({ identity }) => identity)).toContain(
      "active:/small.png",
    );
  });
});
