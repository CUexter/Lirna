import { describe, expect, test } from "bun:test";

import {
  evaluatePolicy,
  findCycles,
  parseSource,
} from "./check-architecture.mjs";

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
    exports: { "./*": { default: "./src/*.ts" } },
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
        ...parseSource("main.tsx", 'import { env } from "@lirna/env/web";'),
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

  test("rejects undeclared and forbidden workspace edges", () => {
    const files = [
      {
        path: "apps/web/src/main.tsx",
        ...parseSource("main.tsx", 'import { auth } from "@lirna/auth";'),
      },
      {
        path: "apps/web/src/feature.ts",
        ...parseSource("feature.ts", 'import { x } from "@lirna/ui/private";'),
      },
    ];

    expect(evaluatePolicy({ workspaces, files })).toEqual([
      "apps/web/src/main.tsx imports undeclared workspace dependency @lirna/auth",
      "apps/web/src/main.tsx has forbidden workspace edge web -> @lirna/auth",
      "apps/web/src/feature.ts imports undeclared @lirna/ui/private; @lirna/ui does not export ./private",
    ]);
  });

  test("rejects relative workspace crossings, server environment imports, and native controls", () => {
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
      "apps/web/src/main.tsx crosses workspace boundary through relative import ../../../packages/api/src/index; use a package export",
      "apps/web/src/components/form.tsx uses native <select>; import an owned UI primitive instead",
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

  test("finds dependency cycles", () => {
    const cycle = [
      { name: "a", dependencies: new Set(["b"]) },
      { name: "b", dependencies: new Set(["a"]) },
    ];
    expect(findCycles(cycle)).toEqual([["a", "b", "a"]]);
  });
});
