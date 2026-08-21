// biome-ignore lint/style/noExcessiveLinesPerFile: The standalone server keeps its coupled protocol fixtures in one executable test boundary.
import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.E2E_API_PORT ?? 3102);
const webPort = Number(process.env.E2E_WEB_PORT ?? 3001);
const corsHeaders = {
  "access-control-allow-credentials": "true",
  "access-control-allow-origin": `http://127.0.0.1:${webPort}`,
};

const previewId = "01234567-89ab-4def-8123-456789abcdef";
const resumePosition = {
  sourceId: "10000000-0000-4000-8000-000000000000",
  stateId: "20000000-0000-4000-8000-000000000000",
  sourceTitle: "The Stanford Encyclopedia of Philosophy entry on Epistemology",
  componentIdentity: "active:/",
  componentLabel: "Article",
  scrollTop: 0,
  savedAt: "2026-08-17T12:00:00.000Z",
};
const standardLimits = {
  maxComponents: 64,
  maxAssets: 256,
  maxResourceBytes: 50 * 1024 * 1024,
  maxTotalBytes: 250 * 1024 * 1024,
  maxDepth: 8,
  maxRedirects: 5,
  timeoutMilliseconds: 15_000,
  maxConcurrency: 4,
};
const expandedLimits = {
  maxComponents: 128,
  maxAssets: 512,
  maxResourceBytes: 100 * 1024 * 1024,
  maxTotalBytes: 500 * 1024 * 1024,
  maxDepth: 16,
  maxRedirects: 5,
  timeoutMilliseconds: 30_000,
  maxConcurrency: 4,
};
const preview = {
  id: previewId,
  title: "The Stanford Encyclopedia of Philosophy entry on Epistemology",
  authors: ["Matthias Steup", "Ram Neta"],
  publisher: "Metaphysics Research Lab, Stanford University",
  publicationHistory: [
    "First published Wed Dec 14, 2005",
    "Substantive revision Fri Sep 29, 2023",
  ],
  submittedUrl: "https://plato.stanford.edu/entries/epistemology/",
  recommendedArchiveUrl:
    "https://plato.stanford.edu/archives/sum2026/entries/epistemology/",
  policy: {
    rightsBasis: "publicly-accessible",
    sensitivityLevel: "ordinary-cloud",
  },
  metrics: {
    requests: 3,
    downloadedBytes: 18_420,
    retainedBytes: 18_420,
    processingMilliseconds: 37,
  },
  createdAt: "2026-08-17T12:00:00.000Z",
  expiresAt: "2026-08-24T12:00:00.000Z",
  diagnostics: [
    {
      level: "info",
      code: "archive-recommended",
      message: "SEP recommends a stable archived citation target.",
    },
  ],
  capture: {
    budget: "standard",
    completeness: "complete",
    readingReadiness: "ready",
    readinessReasons: [],
    unresolvedResources: [],
    limits: standardLimits,
    retryUsed: false,
    retryAvailable: true,
  },
  resources: [
    {
      observationKey: "submitted",
      identity: "active:/",
      role: "main",
      requestedUrl: "https://plato.stanford.edu/entries/epistemology/",
      finalUrl: "https://plato.stanford.edu/entries/epistemology/",
      status: 200,
      mediaType: "text/html",
      charset: "utf-8",
      selectedHeaders: { "content-type": "text/html; charset=utf-8" },
      requestCount: 1,
      downloadedBytes: 16_000,
      retrievedAt: "2026-08-17T12:00:00.000Z",
      byteLength: 16_000,
      sha256: "a".repeat(64),
      discoveryEdge: "submitted-entry",
      depth: 0,
    },
    {
      observationKey: "submitted",
      identity: "citation-information:epistemology",
      role: "citation-information",
      requestedUrl:
        "https://plato.stanford.edu/cgi-bin/encyclopedia/archinfo.cgi?entry=epistemology",
      finalUrl:
        "https://plato.stanford.edu/cgi-bin/encyclopedia/archinfo.cgi?entry=epistemology",
      status: 200,
      mediaType: "text/html",
      charset: "utf-8",
      selectedHeaders: { "content-type": "text/html; charset=utf-8" },
      requestCount: 1,
      downloadedBytes: 2_420,
      retrievedAt: "2026-08-17T12:00:00.000Z",
      byteLength: 2_420,
      sha256: "b".repeat(64),
      discoveryEdge: "required-citation-information",
      depth: 0,
    },
    {
      observationKey: "recommended-archive",
      identity: "sum2026:/",
      role: "main",
      requestedUrl:
        "https://plato.stanford.edu/archives/sum2026/entries/epistemology/",
      finalUrl:
        "https://plato.stanford.edu/archives/sum2026/entries/epistemology/",
      status: 200,
      mediaType: "text/html",
      charset: "utf-8",
      selectedHeaders: { "content-type": "text/html; charset=utf-8" },
      requestCount: 1,
      downloadedBytes: 16_000,
      retrievedAt: "2026-08-17T12:00:00.000Z",
      byteLength: 16_000,
      sha256: "c".repeat(64),
      discoveryEdge: "recommended-archive-entry",
      depth: 0,
    },
  ],
};
preview.observations = [
  {
    key: "submitted",
    label: "Active",
    canonicalUrl: preview.submittedUrl,
    resources: preview.resources.filter(
      (resource) => resource.observationKey === "submitted",
    ),
  },
  {
    key: "recommended-archive",
    label: "Recommended archive",
    canonicalUrl: preview.recommendedArchiveUrl,
    resources: preview.resources.filter(
      (resource) => resource.observationKey === "recommended-archive",
    ),
  },
];
preview.comparison = {
  result: "distinct",
  message:
    "Active and recommended archive publication resources are materially distinct.",
};

const admissionResult = {
  sourceId: "10000000-0000-4000-8000-000000000000",
  states: [
    {
      id: "20000000-0000-4000-8000-000000000000",
      sourceId: "10000000-0000-4000-8000-000000000000",
      sequence: 0,
      observationKey: "submitted",
      canonicalUrl: preview.submittedUrl,
      title: preview.title,
      authors: preview.authors,
      publisher: preview.publisher,
      publicationHistory: preview.publicationHistory,
      admittedAt: "2026-08-18T12:00:00.000Z",
      resources: preview.resources
        .filter((resource) => resource.observationKey === "submitted")
        .map((resource) => ({
          role: resource.role,
          requestedUrl: resource.requestedUrl,
          finalUrl: resource.finalUrl,
          mediaType: resource.mediaType,
          byteLength: resource.byteLength,
          sha256: resource.sha256,
          discoveryEdge: resource.discoveryEdge,
        })),
    },
    {
      id: "20000000-0000-4000-8000-000000000001",
      sourceId: "10000000-0000-4000-8000-000000000000",
      sequence: 1,
      observationKey: "recommended-archive",
      canonicalUrl: preview.recommendedArchiveUrl,
      title: preview.title,
      authors: preview.authors,
      publisher: preview.publisher,
      publicationHistory: preview.publicationHistory,
      admittedAt: "2026-08-18T12:00:00.000Z",
      resources: preview.resources
        .filter((resource) => resource.observationKey === "recommended-archive")
        .map((resource) => ({
          role: resource.role,
          requestedUrl: resource.requestedUrl,
          finalUrl: resource.finalUrl,
          mediaType: resource.mediaType,
          byteLength: resource.byteLength,
          sha256: resource.sha256,
          discoveryEdge: resource.discoveryEdge,
        })),
    },
  ],
};

const partialPreview = {
  ...preview,
  capture: {
    ...preview.capture,
    completeness: "partial",
    readingReadiness: "degraded",
    readinessReasons: ["One or more authored bundle resources are unavailable"],
    unresolvedResources: [
      {
        url: "https://plato.stanford.edu/entries/epistemology/figure.png",
        parentIdentity: "active:/",
        role: "semantic-asset",
        depth: 1,
        reason: "SEP semantic-asset capture returned HTTP 503",
        limit: false,
      },
    ],
  },
};

const stoppedPreview = {
  ...preview,
  capture: {
    ...partialPreview.capture,
    completeness: "stopped",
    unresolvedResources: [
      {
        url: "https://plato.stanford.edu/entries/epistemology/supplement.html",
        parentIdentity: "active:/",
        role: "supplement",
        depth: 1,
        reason: "Component limit reached",
        limit: true,
      },
    ],
  },
};

const retriedPreview = {
  ...preview,
  capture: {
    ...preview.capture,
    budget: "expanded",
    limits: expandedLimits,
    retryUsed: true,
    retryAvailable: false,
  },
};

const reading = {
  version: 1,
  source: {
    id: "10000000-0000-4000-8000-000000000000",
    stateId: "20000000-0000-4000-8000-000000000000",
    title: "The Stanford Encyclopedia of Philosophy entry on Epistemology",
    authors: ["Matthias Steup", "Ram Neta"],
    publisher: "Metaphysics Research Lab, Stanford University",
    publicationHistory: ["First published Wed Dec 14, 2005"],
    canonicalUrl: "https://plato.stanford.edu/entries/epistemology/",
    observation: "submitted",
    admittedAt: "2026-08-18T12:00:00.000Z",
  },
  mainComponent: {
    identity: "active:/",
    requestedUrl: "https://plato.stanford.edu/entries/epistemology/",
    finalUrl: "https://plato.stanford.edu/entries/epistemology/",
    retrievedAt: "2026-08-17T12:00:00.000Z",
    sha256: "a".repeat(64),
  },
  capture: {
    completeness: "partial",
    readingReadiness: "degraded",
    readinessReasons: ["One optional authored component is unavailable."],
    diagnostics: [
      {
        level: "warning",
        code: "component-unavailable",
        message: "An optional component was unavailable during capture.",
        source: { componentIdentity: "active:/", locator: "capture" },
      },
    ],
  },
  toc: [
    {
      id: "knowledge",
      title: "Knowledge",
      children: [{ id: "notation", title: "Notation", children: [] }],
    },
  ],
  introductoryBlocks: [
    {
      kind: "paragraph",
      children: [{ kind: "text", text: "A typed introductory paragraph." }],
    },
  ],
  sections: [
    {
      id: "knowledge",
      title: [{ kind: "text", text: "Knowledge" }],
      level: 2,
      blocks: [
        {
          kind: "paragraph",
          children: [{ kind: "text", text: "Visible typed paragraph." }],
        },
        {
          kind: "paragraph",
          children: [
            { kind: "text", text: "Grounded by " },
            {
              kind: "citation",
              mentionId: "citation-mention-1",
              label: "Steup 2023",
              state: "resolved",
              candidates: ["steup-2023"],
              rule: "authored-fragment-target",
              evidence: "#steup-2023",
              entryId: "steup-2023",
            },
            { kind: "text", text: "." },
          ],
        },
        {
          kind: "paragraph",
          children: [
            { kind: "text", text: "H" },
            { kind: "subscript", children: [{ kind: "text", text: "2" }] },
            { kind: "text", text: "O " },
            { kind: "tex", source: "\\frac{x}{2}", display: false },
            { kind: "text", text: " " },
            {
              kind: "link",
              href: "https://example.com",
              internal: false,
              children: [{ kind: "text", text: "safe link" }],
            },
          ],
        },
        {
          kind: "table",
          caption: [{ kind: "text", text: "Observed distinctions" }],
          head: [
            {
              cells: [
                [{ kind: "text", text: "Term" }],
                [{ kind: "text", text: "Meaning" }],
              ],
            },
          ],
          body: [
            {
              cells: [
                [{ kind: "text", text: "Knowledge" }],
                [{ kind: "text", text: "Justified belief" }],
              ],
            },
          ],
        },
        {
          kind: "diagnostic",
          diagnostic: {
            level: "warning",
            code: "unsupported-tex-macro",
            message:
              "The TeX macro \\unknown is retained for inspection but may not render.",
            source: { componentIdentity: "active:/", locator: "#notation" },
          },
        },
      ],
      children: [
        {
          id: "notation",
          title: [{ kind: "text", text: "Notation" }],
          level: 3,
          blocks: [
            {
              kind: "quotation",
              children: [{ kind: "text", text: "A typed quotation." }],
            },
          ],
          children: [],
        },
      ],
    },
  ],
  plainText:
    "A typed introductory paragraph.\n\nKnowledge\n\nVisible typed paragraph.",
  provenance: {
    adapter: { id: "sep", version: "1" },
    parser: { id: "parse5", version: "7.3.0" },
    inputResourceHashes: [{ identity: "active:/", sha256: "a".repeat(64) }],
  },
};
reading.components = [
  {
    identity: "active:/",
    role: "main",
    label: "Article",
    order: 0,
    ...reading.mainComponent,
    toc: reading.toc,
    introductoryBlocks: reading.introductoryBlocks,
    sections: reading.sections,
    figures: [
      {
        id: "retained-figure",
        caption: [{ kind: "text", text: "A rendered semantic figure" }],
        description: {
          text: [{ kind: "text", text: "Retained semantic diagram" }],
        },
        dimensions: { width: 1, height: 1 },
        assetIdentity: "active:/figures/retained.gif",
        assetDataUrl:
          "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=",
        diagnostics: [],
      },
      {
        id: "knowledge-figure",
        caption: [{ kind: "text", text: "A retained semantic figure" }],
        description: {
          text: [
            {
              kind: "text",
              text: "Figure description unavailable in this fixture.",
            },
          ],
        },
        dimensions: { width: 640, height: 480 },
        diagnostics: [
          {
            level: "warning",
            code: "missing-semantic-asset",
            message:
              "The semantic figure asset was not retained in this Source state.",
            source: {
              componentIdentity: "active:/",
              locator: "#knowledge-figure",
            },
          },
        ],
      },
    ],
    bibliography: [
      {
        id: "bibliography",
        title: "Bibliography",
        provenance: { componentIdentity: "active:/", locator: "#bibliography" },
        entries: [
          {
            id: "steup-2023",
            label: "Steup 2023",
            text: "Steup, Matthias. 2023. Epistemology.",
            anchor: "steup-2023",
            links: [
              {
                label: "Publisher page",
                href: "https://example.com/epistemology",
                onlineOnly: true,
              },
            ],
            provenance: {
              componentIdentity: "active:/",
              locator: "#steup-2023",
            },
          },
        ],
      },
    ],
    plainText: reading.plainText,
  },
  {
    identity: "active:/notes.html",
    role: "notes",
    label: "Notes",
    parentIdentity: "active:/",
    order: 1,
    requestedUrl: "https://plato.stanford.edu/entries/epistemology/notes.html",
    finalUrl: "https://plato.stanford.edu/entries/epistemology/notes.html",
    retrievedAt: "2026-08-17T12:00:00.000Z",
    sha256: "d".repeat(64),
    toc: [{ id: "notes", title: "Notes", children: [] }],
    introductoryBlocks: [
      {
        kind: "paragraph",
        children: [{ kind: "text", text: "Typed Notes content." }],
      },
    ],
    sections: [],
    figures: [],
    bibliography: [],
    plainText: "Typed Notes content.",
  },
];

function sendJson(response, status, body) {
  response.writeHead(status, {
    ...corsHeaders,
    "content-type": "application/json",
  });
  response.end(JSON.stringify(body));
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function orpcSuccess(data) {
  return { json: data, meta: [] };
}

function orpcError(message, code = "BAD_REQUEST") {
  return {
    json: {
      defined: false,
      inferable: true,
      code,
      message,
      data: {},
    },
    meta: [],
  };
}

const orpcPostRoutes = {
  "sources/reading": () => orpcSuccess(reading),
  "sources/resume": () => orpcSuccess(resumePosition),
  "annotations/list": () => orpcSuccess([]),
  "sepAdmission/get": () => orpcSuccess(preview),
  healthCheck: () => orpcSuccess("OK"),
  "sepAdmission/submit": (body) =>
    body.includes("rejected-entry")
      ? orpcError("The SEP entry could not be captured.")
      : orpcSuccess(
          body.includes("partial-entry")
            ? partialPreview
            : body.includes("stopped-entry")
              ? stoppedPreview
              : preview,
        ),
  "sepAdmission/extend": () =>
    orpcSuccess({ ...preview, expiresAt: "2026-08-31T12:00:00.000Z" }),
  "sepAdmission/delete": () => orpcSuccess({ deleted: true }),
  "sepAdmission/retry": () => orpcSuccess(retriedPreview),
  "sepAdmission/admit": (body) =>
    orpcSuccess({
      ...admissionResult,
      states: body.includes("recommended-archive")
        ? admissionResult.states
        : admissionResult.states.slice(0, 1),
    }),
};

async function handleOrpcPost(request, response) {
  let path = request.url.slice("/orpc/".length).split("?")[0];
  if (path.endsWith("/call")) {
    path = path.slice(0, -"/call".length);
  }
  const body = await readBody(request);
  await new Promise((resolve) => setTimeout(resolve, 80));

  const handler = orpcPostRoutes[path];
  if (!handler) {
    response.writeHead(404, corsHeaders);
    response.end("Not found");
    return;
  }

  const result = handler(body);
  const status = result.json?.defined === false ? 400 : 200;
  sendJson(response, status, result);
}

const server = createServer(async (request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      ...corsHeaders,
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, POST, PUT, OPTIONS",
    });
    response.end();
    return;
  }

  if (request.url === "/healthz") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("OK");
    return;
  }

  if (
    request.method === "GET" &&
    request.url?.startsWith("/orpc/healthCheck")
  ) {
    sendJson(response, 200, orpcSuccess("OK"));
    return;
  }

  if (
    request.method === "GET" &&
    request.url?.startsWith("/orpc/annotations/list")
  ) {
    sendJson(response, 200, orpcSuccess([]));
    return;
  }

  if (
    request.method === "GET" &&
    request.url?.startsWith("/orpc/sources/reading")
  ) {
    sendJson(response, 200, orpcSuccess(reading));
    return;
  }

  if (
    request.method === "GET" &&
    request.url?.startsWith("/orpc/sources/resume")
  ) {
    sendJson(response, 200, orpcSuccess(null));
    return;
  }

  if (
    (request.method === "POST" || request.method === "PUT") &&
    request.url?.startsWith("/orpc/")
  ) {
    await handleOrpcPost(request, response);
    return;
  }

  response.writeHead(404, {
    ...corsHeaders,
    "content-type": "text/plain",
  });
  response.end("Not found");
});

let isClosing = false;

function closeServer(signal) {
  if (isClosing) {
    return;
  }

  isClosing = true;
  server.close((error) => {
    if (error) {
      console.error(
        `Failed to close E2E API substitute after ${signal}`,
        error,
      );
      process.exitCode = 1;
    }
  });
  server.closeAllConnections();
}

server.on("error", (error) => {
  console.error("E2E API substitute failed to start", error);
  process.exitCode = 1;
});

process.once("SIGINT", () => closeServer("SIGINT"));
process.once("SIGTERM", () => closeServer("SIGTERM"));

server.listen(port, host, () => {
  process.stdout.write(
    `E2E API substitute listening on http://${host}:${port}\n`,
  );
});
