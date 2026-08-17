export interface FixturePage {
  body?: Buffer | string;
  contentType?: string;
  location?: string;
  status?: number;
  timeout?: boolean;
}

export function html(body: string): FixturePage {
  return { body: htmlBody(body), contentType: "text/html; charset=utf-8" };
}

export function htmlBody(body: string): string {
  return `<title>Fixture (Stanford Encyclopedia of Philosophy)</title>${body}`;
}

export function image(body: Buffer): FixturePage {
  return { body, contentType: "image/png" };
}

export function redirect(location: string): FixturePage {
  return { location, status: 302 };
}

export function controlledTransport(
  entry: string,
  pages: Map<string, FixturePage>,
  requested: string[] = [],
): typeof fetch {
  return (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin !== "https://plato.stanford.edu") {
      throw new Error(`Controlled transport rejected origin ${url.origin}`);
    }
    requested.push(`${url.pathname}${url.search}`);
    if (
      url.pathname === "/cgi-bin/encyclopedia/archinfo.cgi" &&
      url.searchParams.get("entry") === entry
    ) {
      return new Response(controlledCitationBody, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const page = pages.get(url.pathname);
    if (!page) {
      return new Response("missing", {
        status: 404,
        headers: { "content-type": "text/html" },
      });
    }
    if (page.timeout) {
      return await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    }
    return new Response(page.body, {
      status: page.status ?? 200,
      headers: {
        ...(page.contentType ? { "content-type": page.contentType } : {}),
        ...(page.location ? { location: page.location } : {}),
      },
    });
  }) as unknown as typeof fetch;
}

export const controlledCitationBody =
  "<html><body><p>By Fixture Author</p><p>First published 2026</p>" +
  "<p>publisher = {Metaphysics Research Lab, Stanford University}</p></body></html>";
