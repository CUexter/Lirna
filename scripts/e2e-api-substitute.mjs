import { createServer } from "node:http";

const host = "127.0.0.1";
const port = Number(process.env.E2E_API_PORT ?? 3102);
const corsHeaders = {
  "access-control-allow-credentials": "true",
  "access-control-allow-origin": "http://127.0.0.1:3001",
};

const server = createServer((request, response) => {
  if (request.method === "OPTIONS") {
    response.writeHead(204, {
      ...corsHeaders,
      "access-control-allow-headers": "content-type",
      "access-control-allow-methods": "GET, OPTIONS",
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
    request.url?.startsWith("/trpc/healthCheck")
  ) {
    response.writeHead(200, {
      ...corsHeaders,
      "content-type": "application/json",
    });
    response.end(JSON.stringify([{ result: { data: "OK" } }]));
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
