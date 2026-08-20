import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";

import { createSepCaptureClient, SepAdmissionError } from "./sep-capture";
import { classifySepUrl } from "./sep-url";

const mainBytes = Buffer.from(
  "<!doctype html><html><head><title>Logic (Stanford Encyclopedia of Philosophy)</title></head><body>Exact main bytes.</body></html>",
);
const citationBytes = Buffer.from(`<!doctype html><html><body>
  <p>By Alice Example and Bob Scholar</p>
  <p>First published Mon Jan 1, 2024; substantive revision Tue Feb 2, 2026; The citation immediately above refers to the version in the following archive edition; howpublished = {\\url{https://example.invalid}}; edition = {{W}inter 2025}</p>
  <p>publisher = {Metaphysics Research Lab, Stanford University}</p>
  <a href="/archives/sum2026/entries/logic/">Summer 2026 archived edition</a>
</body></html>`);

let fixture: ReturnType<typeof Bun.serve>;

beforeAll(() => {
  fixture = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url);
      if (url.pathname === "/entries/logic/") {
        return new Response(null, {
          status: 302,
          headers: {
            location:
              "https://plato.stanford.edu/archives/sum2026/entries/logic/",
          },
        });
      }
      if (url.pathname === "/entries/evil/") {
        return new Response(null, {
          status: 302,
          headers: { location: "http://127.0.0.1/private" },
        });
      }
      if (
        url.pathname === "/archives/sum2026/entries/logic/" ||
        url.pathname === "/entries/logic-missing/"
      ) {
        return new Response(mainBytes, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            etag: '"main"',
          },
        });
      }
      if (
        url.pathname === "/cgi-bin/encyclopedia/archinfo.cgi" &&
        url.searchParams.get("entry") === "logic"
      ) {
        return new Response(citationBytes, {
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return new Response("missing", {
        status: 404,
        headers: { "content-type": "text/html" },
      });
    },
  });
});

afterAll(() => fixture.stop(true));

function fixtureTransport(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): Promise<Response> {
  const logicalUrl = input instanceof URL ? input : new URL(String(input));
  const fixtureUrl = new URL(
    `${logicalUrl.pathname}${logicalUrl.search}`,
    fixture.url,
  );
  return fetch(fixtureUrl, init);
}

describe("SEP URL policy", () => {
  test("accepts active, archived, and citation-information URLs", () => {
    expect(
      classifySepUrl("https://plato.stanford.edu/entries/logic/").kind,
    ).toBe("main");
    expect(
      classifySepUrl(
        "https://plato.stanford.edu/archives/sum2026/entries/logic/",
      ).archived,
    ).toBe(true);
    expect(
      classifySepUrl(
        "https://plato.stanford.edu/cgi-bin/encyclopedia/archinfo.cgi?entry=logic",
      ).kind,
    ).toBe("citation-information");
  });

  test.each([
    "http://plato.stanford.edu/entries/logic/",
    "https://plato.stanford.edu.evil.example/entries/logic/",
    "https://user@plato.stanford.edu/entries/logic/",
    "https://plato.stanford.edu:444/entries/logic/",
    "https://plato.stanford.edu/entries/logic/#fragment",
    "https://plato.stanford.edu/entries/%2e%2e/private/",
    "https://plato.stanford.edu/archives/garbage/entries/logic/",
    "https://plato.stanford.edu/cgi-bin/encyclopedia/archinfo.cgi?entry=logic&extra=1",
  ])("rejects ineligible location %s", (url) => {
    expect(() => classifySepUrl(url)).toThrow(SepAdmissionError);
  });
});

describe("SEP exact-byte capture", () => {
  test("captures mandatory resources, metadata, redirects, and byte metrics", async () => {
    const capture = createSepCaptureClient({
      fetch: fixtureTransport as typeof fetch,
      now: () => new Date("2026-08-17T12:00:00.000Z"),
      performanceNow: (() => {
        let value = 10;
        return () => (value += 5);
      })(),
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/entries/logic/",
    );

    expect(result.title).toBe("Logic");
    expect(result.authors).toEqual(["Alice Example", "Bob Scholar"]);
    expect(result.publisher).toContain("Metaphysics Research Lab");
    expect(result.publicationHistory).toEqual([
      "First published Mon Jan 1, 2024",
      "Substantive revision Tue Feb 2, 2026",
    ]);
    expect(result.recommendedArchiveUrl).toBe(
      "https://plato.stanford.edu/archives/sum2026/entries/logic/",
    );
    expect(result.resources.map((resource) => resource.role)).toEqual([
      "main",
      "citation-information",
      "main",
    ]);
    expect(
      result.resources.reduce(
        (sum, resource) => sum + resource.requestCount,
        0,
      ),
    ).toBe(4);
    expect(result.resources[0]?.body).toEqual(mainBytes);
    expect(result.resources[1]?.body).toEqual(citationBytes);
    expect(result.resources[0]?.sha256).toBe(
      createHash("sha256").update(mainBytes).digest("hex"),
    );
    expect(
      result.resources.map(({ observationKey }) => observationKey),
    ).toEqual(["submitted", "submitted", "recommended-archive"]);
  });

  test("captures the active observation when an archived URL is submitted", async () => {
    const capture = createSepCaptureClient({
      fetch: fixtureTransport as typeof fetch,
    });

    const result = await capture.capture(
      "https://plato.stanford.edu/archives/sum2026/entries/logic/",
    );

    expect(result.submittedUrl).toBe(
      "https://plato.stanford.edu/archives/sum2026/entries/logic/",
    );
    expect(result.resources[0]?.requestedUrl).toBe(
      "https://plato.stanford.edu/entries/logic/",
    );
    expect(result.resources[0]?.observationKey).toBe("submitted");
  });

  test("rejects a redirect before requesting an ineligible target", async () => {
    let requestCount = 0;
    let bodyCancelled = false;
    const capture = createSepCaptureClient({
      fetch: (async () => {
        requestCount += 1;
        return new Response(
          new ReadableStream({
            cancel() {
              bodyCancelled = true;
            },
          }),
          {
            status: 302,
            headers: { location: "http://127.0.0.1/private" },
          },
        );
      }) as unknown as typeof fetch,
    });

    await expect(
      capture.capture("https://plato.stanford.edu/entries/evil/"),
    ).rejects.toThrow("Only HTTPS plato.stanford.edu SEP URLs are accepted");
    expect(requestCount).toBe(1);
    expect(bodyCancelled).toBe(true);
  });

  test("fails when citation information is unavailable", async () => {
    const capture = createSepCaptureClient({
      fetch: fixtureTransport as typeof fetch,
    });
    await expect(
      capture.capture("https://plato.stanford.edu/entries/logic-missing/"),
    ).rejects.toThrow("citation-information capture returned HTTP 404");
  });

  test("fails when captured citation metadata omits its publisher", async () => {
    const capture = createSepCaptureClient({
      fetch: (async (input, init) => {
        const url = new URL(String(input));
        if (url.pathname === "/cgi-bin/encyclopedia/archinfo.cgi") {
          return new Response(
            "<html><body><p>By Alice Example</p></body></html>",
            {
              headers: { "content-type": "text/html; charset=utf-8" },
            },
          );
        }
        return fixtureTransport(input, init);
      }) as typeof fetch,
    });
    await expect(
      capture.capture("https://plato.stanford.edu/entries/logic/"),
    ).rejects.toThrow("does not identify its publisher");
  });

  test("reports an interrupted response body as a capture error", async () => {
    const capture = createSepCaptureClient({
      fetch: (async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("fixture stream interrupted"));
            },
          }),
          { headers: { "content-type": "text/html" } },
        )) as unknown as typeof fetch,
    });
    await expect(
      capture.capture("https://plato.stanford.edu/entries/logic/"),
    ).rejects.toThrow("response could not be read: fixture stream interrupted");
  });
});
