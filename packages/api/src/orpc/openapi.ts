import {
  OpenAPIGenerator,
  type OpenAPIGeneratorGenerateOptions,
} from "@orpc/openapi";
import { ZodToJsonSchemaConverter } from "@orpc/zod";

import { orpcRouter } from "./router";

const generator = new OpenAPIGenerator({
  converters: [new ZodToJsonSchemaConverter()],
});

const baseConfig: OpenAPIGeneratorGenerateOptions = {
  base: {
    info: {
      title: "Lirna API",
      version: "0.1.0",
      description:
        "First-party personal research and learning API. The health check endpoint is public; all other operations require an authenticated session.",
    },
    components: {
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "better-auth.session_token",
          description: "Better Auth session cookie for HTTP environments.",
        },
        secureSessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "__Secure-better-auth.session_token",
          description: "Better Auth session cookie for HTTPS environments.",
        },
      },
    },
    security: [{ sessionCookie: [] }, { secureSessionCookie: [] }],
    tags: [
      {
        name: "Annotations",
        description: "Source-state annotations (highlights and notes).",
      },
      {
        name: "SEP Admission",
        description:
          "Source-Evidence-Proxy admission: capture, preview, and admit external sources.",
      },
      {
        name: "Health",
        description: "Service health and authentication-gated diagnostics.",
      },
    ],
  },
};

export async function generateOpenApiDocument(
  options: { serverUrl?: string } = {},
) {
  const config: OpenAPIGeneratorGenerateOptions =
    options.serverUrl === undefined
      ? baseConfig
      : {
          ...baseConfig,
          base: {
            ...baseConfig.base,
            servers: [{ url: options.serverUrl }],
          },
        };

  return generator.generate(orpcRouter, config);
}
