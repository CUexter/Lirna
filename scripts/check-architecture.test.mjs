import { describe, expect, test } from "bun:test";

import { evaluatePolicy, parseSource } from "./check-architecture.mjs";

const workspaces = [
  {
    name: "web",
    root: "apps/web",
    dependencies: new Set(["@lirna/api", "@lirna/env", "@lirna/ui"]),
    exports: {},
  },
  {
    name: "server",
    root: "apps/server",
    dependencies: new Set(["@lirna/api", "@lirna/env"]),
    exports: {},
  },
  {
    name: "@lirna/api",
    root: "packages/api",
    dependencies: new Set(["@lirna/env"]),
    exports: {
      "./client": { default: "./src/client.ts" },
      "./context": { default: "./src/context.ts" },
      "./orpc": { default: "./src/orpc/index.ts" },
    },
  },
  {
    name: "@lirna/auth",
    root: "packages/auth",
    dependencies: new Set(),
    exports: { ".": { default: "./src/index.ts" } },
  },
  {
    name: "@lirna/env",
    root: "packages/env",
    dependencies: new Set(),
    exports: { "./*": { default: "./src/*.ts" } },
  },
  {
    name: "@lirna/ui",
    root: "packages/ui",
    dependencies: new Set(),
    exports: { "./components/*": "./src/components/*.tsx" },
  },
];

describe("architecture policy fixtures", () => {
  test("accepts package exports, route placement, and an owned primitive", () => {
    const files = [
      {
        path: "apps/web/src/routes/index.tsx",
        ...parseSource("index.tsx", "createFileRoute('/')({})"),
      },
      {
        path: "apps/web/src/main.tsx",
        ...parseSource(
          "main.tsx",
          'import type { OrpcRouter } from "@lirna/api/client"; import { env } from "@lirna/env/web";',
        ),
      },
      {
        path: "packages/ui/src/components/input.tsx",
        ...parseSource(
          "input.tsx",
          "export function Input() { return <input />; }",
        ),
      },
    ];

    expect(evaluatePolicy({ workspaces, files })).toEqual([]);
  });

  test("accepts TanStack Router support files under routes", () => {
    const files = [
      {
        path: "apps/web/src/routes/sources/-admission.test.tsx",
        ...parseSource("-admission.test.tsx", "export {};"),
      },
    ];

    expect(evaluatePolicy({ workspaces, files })).toEqual([]);
  });

  test("rejects server environment imports and native controls", () => {
    const files = [
      {
        path: "apps/web/src/main.tsx",
        ...parseSource(
          "main.tsx",
          'import { env } from "@lirna/env/server"; import x from "../../../packages/api/src/index";',
        ),
      },
      {
        path: "apps/web/src/components/form.tsx",
        ...parseSource(
          "form.tsx",
          "export function Form() { return <select />; }",
        ),
      },
    ];

    expect(evaluatePolicy({ workspaces, files })).toEqual([
      "apps/web/src/main.tsx imports the server environment surface",
      "apps/web/src/components/form.tsx uses native <select>; import an owned UI primitive instead",
    ]);
  });

  test("rejects server-owned API implementation in browser code", () => {
    const files = [
      {
        path: "apps/web/src/context.ts",
        ...parseSource(
          "context.ts",
          'import { createContext } from "@lirna/api/context";',
        ),
      },
      {
        path: "apps/web/src/router.ts",
        ...parseSource(
          "router.ts",
          'import type { OrpcRouter } from "@lirna/api/orpc";',
        ),
      },
    ];

    expect(evaluatePolicy({ workspaces, files })).toEqual([
      "apps/web/src/context.ts imports server-owned API implementation @lirna/api/context; use @lirna/api/client",
      "apps/web/src/router.ts imports server-owned API implementation @lirna/api/orpc; use @lirna/api/client",
    ]);
  });

  test("does not authorize a native control by a matching filename alone", () => {
    const files = [
      {
        path: "packages/ui/src/components/nested/input.tsx",
        ...parseSource(
          "input.tsx",
          "export function Input() { return <input />; }",
        ),
      },
    ];

    expect(evaluatePolicy({ workspaces, files })).toEqual([
      "packages/ui/src/components/nested/input.tsx uses native <input>; import an owned UI primitive instead",
    ]);
  });
});
