import { describe, expect, test } from "bun:test";

import { evaluatePolicy, parseSource } from "./check-architecture.ts";

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

  test("accepts non-test TanStack Router support files under routes", () => {
    const files = [
      {
        path: "apps/web/src/routes/sources/-source-information.tsx",
        ...parseSource("-source-information.tsx", "export {};"),
      },
    ];

    expect(evaluatePolicy({ workspaces, files })).toEqual([]);
  });

  test("rejects test source under the file-based route tree", () => {
    const files = [
      {
        path: "apps/web/src/routes/sources/-admission.test.tsx",
        ...parseSource("-admission.test.tsx", "export {};"),
      },
      {
        path: "apps/web/src/routes/sources/-reading-route-test-harness.tsx",
        ...parseSource("-reading-route-test-harness.tsx", "export {};"),
      },
      {
        path: "apps/web/src/routes/sources/-reading-component-fixture.ts",
        ...parseSource("-reading-component-fixture.ts", "export {};"),
      },
    ];

    expect(evaluatePolicy({ workspaces, files })).toEqual([
      "apps/web/src/routes/sources/-admission.test.tsx is test source under apps/web/src/routes; place it beside the module that owns the behavior or under apps/web/tests/routes",
      "apps/web/src/routes/sources/-reading-route-test-harness.tsx is test source under apps/web/src/routes; place it beside the module that owns the behavior or under apps/web/tests/routes",
      "apps/web/src/routes/sources/-reading-component-fixture.ts is test source under apps/web/src/routes; place it beside the module that owns the behavior or under apps/web/tests/routes",
    ]);
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
      {
        path: "apps/web/src/reading-content.ts",
        ...parseSource(
          "reading-content.ts",
          'import { readingInlineText } from "@lirna/api/client/reading-content";',
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

  test("keeps Reading owner commands behind ReadingNavigation", () => {
    const files = [
      {
        path: "apps/web/src/components/reading-workspace/reading-navigation.ts",
        ...parseSource(
          "reading-navigation.ts",
          "target.scrollIntoView(); container.scrollTo({ top: 10 });",
        ),
      },
      {
        path: "apps/web/src/components/reading-workspace/reference.ts",
        ...parseSource("reference.ts", "target.scrollIntoView();"),
      },
      {
        path: "apps/web/src/components/annotations/annotations.tsx",
        ...parseSource("annotations.tsx", "window.scrollBy(0, 10);"),
      },
      {
        path: "apps/web/src/components/reading-workspace/resume.ts",
        ...parseSource("resume.ts", "container.scrollTop = 10;"),
      },
      {
        path: "apps/web/src/routes/sources/$sourceId.tsx",
        ...parseSource(
          "$sourceId.tsx",
          'createFileRoute("/sources/$sourceId")({}); element.scroll({ top: 10 }); element.scrollTop += 10; element.scrollTop++;',
        ),
      },
      {
        path: "apps/web/src/components/reading-workspace/reading-route-tools.test.tsx",
        ...parseSource(
          "-reading-route-tools-tests.tsx",
          "window.scrollTo(0, 10);",
        ),
      },
    ];

    expect(evaluatePolicy({ workspaces, files })).toEqual([
      "apps/web/src/components/reading-workspace/reference.ts uses scrollIntoView outside ReadingNavigation",
      "apps/web/src/components/annotations/annotations.tsx uses scrollBy outside ReadingNavigation",
      "apps/web/src/components/reading-workspace/resume.ts uses scrollTop assignment outside ReadingNavigation",
      "apps/web/src/routes/sources/$sourceId.tsx uses scroll outside ReadingNavigation",
      "apps/web/src/routes/sources/$sourceId.tsx uses scrollTop assignment outside ReadingNavigation",
      "apps/web/src/routes/sources/$sourceId.tsx uses scrollTop assignment outside ReadingNavigation",
    ]);
  });

  test("keeps source-specific modules outside the core Reading workspace", () => {
    const files = [
      {
        path: "apps/web/src/components/reading-workspace/workspace.tsx",
        ...parseSource(
          "workspace.tsx",
          'import { useSepUpdate } from "@/hooks/use-sep-update";',
        ),
      },
      {
        path: "apps/web/src/components/reading-workspace/reading-article-pane.tsx",
        ...parseSource(
          "reading-article-pane.tsx",
          'import { SepAdmissionPreview } from "@/components/source-admission/preview";',
        ),
      },
      {
        path: "apps/web/src/components/reading-workspace/source-information.tsx",
        ...parseSource(
          "source-information.tsx",
          'import { useSepUpdate } from "@/hooks/use-sep-update";',
        ),
      },
      {
        path: "apps/web/src/components/reading-workspace/workspace.test.tsx",
        ...parseSource(
          "workspace.test.tsx",
          'import { useSepUpdate } from "@/hooks/use-sep-update";',
        ),
      },
    ];

    expect(evaluatePolicy({ workspaces, files })).toEqual([
      "apps/web/src/components/reading-workspace/workspace.tsx imports source-specific module @/hooks/use-sep-update; keep it behind SourceInformation",
      "apps/web/src/components/reading-workspace/reading-article-pane.tsx imports source-specific module @/components/source-admission/preview; keep it behind SourceInformation",
    ]);
  });
});
