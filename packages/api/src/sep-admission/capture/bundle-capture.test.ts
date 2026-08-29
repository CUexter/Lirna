import { describe, expect, test } from "bun:test";

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

describe("SEP source-state bundle capture", () => {
  test("recursively captures authored components and semantic assets", async () => {
    const requested: string[] = [];
    const pages = new Map<string, FixturePage>([
      [
        "/entries/bundle/",
        html(`<main>
          <a href="notes.html">Notes</a>
          <img src="figure.png" longdesc="figure-description.html">
        </main>`),
      ],
      [
        "/entries/bundle/notes.html",
        html('<main><a href="supplement.html">Supplement</a></main>'),
      ],
      [
        "/entries/bundle/supplement.html",
        html("<main>Exact supplement.</main>"),
      ],
      [
        "/entries/bundle/figure-description.html",
        html("<main>Figure description.</main>"),
      ],
      [
        "/entries/bundle/figure.png",
        image(Buffer.from([0x89, 0x50, 0x4e, 0x47])),
      ],
    ]);
    const capture = createSepCaptureClient({
      fetch: controlledTransport("bundle", pages, requested),
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/entries/bundle/",
    );

    expect(result.captureReport).toMatchObject({
      completeness: "complete",
      readingReadiness: "ready",
      unresolvedResources: [],
    });
    expect(result.resources.map(({ role }) => role)).toEqual([
      "main",
      "citation-information",
      "notes",
      "figure-description",
      "semantic-asset",
      "supplement",
    ]);
    expect(result.resources.map(({ identity }) => identity)).toEqual([
      "active:/",
      "citation-information:bundle",
      "active:/notes.html",
      "active:/figure-description.html",
      "active:/figure.png",
      "active:/supplement.html",
    ]);
    expect(result.resources.at(-1)?.discoveryEdge).toBe(
      "authored:active:/notes.html",
    );
    expect(result.resources.at(-1)?.body).toEqual(
      Buffer.from(htmlBody("<main>Exact supplement.</main>")),
    );
    expect(requested).toHaveLength(6);
  });

  test("keeps archive-aware identities for an archived publication", async () => {
    const pages = new Map<string, FixturePage>([
      [
        "/entries/archive-bundle/",
        html('<main><a href="notes.html">Notes</a></main>'),
      ],
      [
        "/entries/archive-bundle/notes.html",
        html("<main>Active notes.</main>"),
      ],
      [
        "/archives/sum2026/entries/archive-bundle/",
        html('<main><a href="notes.html">Notes</a></main>'),
      ],
      [
        "/archives/sum2026/entries/archive-bundle/notes.html",
        html("<main>Archived notes.</main>"),
      ],
    ]);
    const transport = controlledTransport("archive-bundle", pages);
    const capture = createSepCaptureClient({
      fetch: (async (
        input: Parameters<typeof fetch>[0],
        init?: RequestInit,
      ) => {
        const url = new URL(String(input));
        if (url.pathname === "/cgi-bin/encyclopedia/archinfo.cgi") {
          return new Response(
            `${controlledCitationBody}<a href="/archives/sum2026/entries/archive-bundle/">Archive</a>`,
            { headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }
        return transport(input, init);
      }) as typeof fetch,
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/archives/sum2026/entries/archive-bundle/",
    );

    expect(result.resources.map(({ identity }) => identity)).toEqual([
      "active:/",
      "citation-information:archive-bundle",
      "active:/notes.html",
      "sum2026:/",
      "sum2026:/notes.html",
    ]);
  });

  test("does not fetch external, cross-entry, chrome, script, or unsafe discoveries", async () => {
    const requested: string[] = [];
    const pages = new Map<string, FixturePage>([
      [
        "/entries/boundary/",
        html(`<header><a href="header.html">Chrome</a></header>
          <main>
            <a href="details.html">Details</a>
            <a href="https://example.com/escape.html">External</a>
            <a href="/entries/other/supplement.html">Other entry</a>
            <a href="%2e%2e/private.html">Unsafe</a>
            <img src="active.svg">
            <img src="https://example.com/external.png">
            <script src="payload.js"></script>
          </main>`),
      ],
      ["/entries/boundary/details.html", html("<main>Details.</main>")],
    ]);
    const capture = createSepCaptureClient({
      fetch: controlledTransport("boundary", pages, requested),
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/entries/boundary/",
    );

    expect(requested).toEqual([
      "/entries/boundary/",
      "/cgi-bin/encyclopedia/archinfo.cgi?entry=boundary",
      "/entries/boundary/details.html",
    ]);
    expect(result.captureReport).toMatchObject({
      completeness: "partial",
      readingReadiness: "degraded",
    });
    expect(result.captureReport.unresolvedResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          url: "https://plato.stanford.edu/entries/boundary/active.svg",
          reason: "Active or non-semantic asset types are not captured",
          limit: false,
        }),
        expect.objectContaining({
          url: "https://example.com/external.png",
          limit: false,
        }),
      ]),
    );
  });

  test("fails closed around comments and unclosed active markup", async () => {
    const requested: string[] = [];
    const pages = new Map<string, FixturePage>([
      [
        "/entries/malformed/",
        html(`<main>
          <a href="details.html">Details</a>
          <div data-example='<a href="attribute.html">'>Quoted markup</div>
          <!-- <a href="comment.html">Comment payload</a> -->
          <script><a href="script.html">Unclosed script payload</a>
        </main>`),
      ],
      ["/entries/malformed/details.html", html("<main>Details.</main>")],
    ]);
    const capture = createSepCaptureClient({
      fetch: controlledTransport("malformed", pages, requested),
    });

    await capture.capture("https://plato.stanford.edu/entries/malformed/");

    expect(requested).toEqual([
      "/entries/malformed/",
      "/cgi-bin/encyclopedia/archinfo.cgi?entry=malformed",
      "/entries/malformed/details.html",
    ]);
  });

  test("reports optional component decoding failures without blocking admission", async () => {
    const pages = new Map<string, FixturePage>([
      [
        "/entries/encoding/",
        html('<main><a href="notes.html">Notes</a></main>'),
      ],
      [
        "/entries/encoding/notes.html",
        { body: "notes", contentType: "text/html; charset=unsupported" },
      ],
    ]);
    const capture = createSepCaptureClient({
      fetch: controlledTransport("encoding", pages),
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/entries/encoding/",
    );

    expect(result.captureReport.completeness).toBe("partial");
    expect(result.captureReport.unresolvedResources).toContainEqual(
      expect.objectContaining({
        url: "https://plato.stanford.edu/entries/encoding/notes.html",
        reason: expect.stringContaining("unsupported character encoding"),
      }),
    );
  });

  test("retains one resource when optional redirects converge", async () => {
    const pages = new Map<string, FixturePage>([
      [
        "/entries/converging/",
        html(
          '<main><a href="one.html">One</a><a href="two.html">Two</a></main>',
        ),
      ],
      ["/entries/converging/one.html", redirect("shared.html")],
      ["/entries/converging/two.html", redirect("shared.html")],
      ["/entries/converging/shared.html", html("<main>Shared.</main>")],
    ]);
    const capture = createSepCaptureClient({
      fetch: controlledTransport("converging", pages),
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/entries/converging/",
    );

    expect(
      result.resources.filter(
        ({ identity }) => identity === "active:/shared.html",
      ),
    ).toHaveLength(1);
    expect(result.captureReport.completeness).toBe("partial");
    expect(result.captureReport.unresolvedResources.at(0)?.reason).toContain(
      "already captured identity active:/shared.html",
    );
  });

  test("keeps reading ready when only a semantic asset is unavailable", async () => {
    const pages = new Map<string, FixturePage>([
      [
        "/entries/asset-readiness/",
        html('<main><img src="missing.png"></main>'),
      ],
    ]);
    const capture = createSepCaptureClient({
      fetch: controlledTransport("asset-readiness", pages),
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/entries/asset-readiness/",
    );

    expect(result.captureReport).toMatchObject({
      completeness: "partial",
      readingReadiness: "ready",
      readinessReasons: [],
    });
  });

  test("shares one total-byte budget across active and archived observations", async () => {
    const pages = new Map<string, FixturePage>([
      ["/entries/shared-budget/", html("<main>Active.</main>")],
      [
        "/archives/sum2026/entries/shared-budget/",
        html("<main>Archive.</main>"),
      ],
    ]);
    const transport = controlledTransport("shared-budget", pages);
    const capture = createSepCaptureClient({
      limits: { maxTotalBytes: 300 },
      fetch: (async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === "/cgi-bin/encyclopedia/archinfo.cgi") {
          return new Response(
            `${controlledCitationBody}<a href="/archives/sum2026/entries/shared-budget/">Archive</a>`,
            { headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }
        return transport(input, init);
      }) as typeof fetch,
    });

    await expect(
      capture.capture("https://plato.stanford.edu/entries/shared-budget/"),
    ).rejects.toThrow(
      "Mandatory SEP observations exceed the 300-byte bundle limit",
    );
  });
});
