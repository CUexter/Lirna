import { expect, test } from "bun:test";

import { env } from "./web";

const root = `${import.meta.dir}/../../..`;
const {
  VITE_SERVER_URL: _,
  VITE_SHOW_DIAGNOSTICS: __,
  ...parentEnvironment
} = process.env;

async function validateWebEnvironment(
  value?: string,
  showDiagnostics?: string,
) {
  const child = Bun.spawn(
    ["bun", "--no-env-file", "-e", 'await import("@lirna/env/web")'],
    {
      cwd: root,
      env: {
        ...parentEnvironment,
        ...(value ? { VITE_SERVER_URL: value } : {}),
        ...(showDiagnostics ? { VITE_SHOW_DIAGNOSTICS: showDiagnostics } : {}),
      },
      stderr: "pipe",
      stdout: "pipe",
    },
  );
  return child.exited;
}

test("accepts the deterministic web runtime value", () => {
  expect(env.VITE_SERVER_URL).toBe("http://127.0.0.1:3000");
  expect(env.VITE_SHOW_DIAGNOSTICS).toBe(false);
});

test("accepts a valid web runtime value in a fresh runtime", async () => {
  expect(await validateWebEnvironment("https://api.example.com")).toBe(0);
});

test("rejects a missing web runtime value in a fresh runtime", async () => {
  expect(await validateWebEnvironment()).toBe(1);
});

test("rejects an invalid web runtime value in a fresh runtime", async () => {
  expect(await validateWebEnvironment("not a URL")).toBe(1);
});

test("accepts an explicit diagnostics flag in a fresh runtime", async () => {
  expect(await validateWebEnvironment("https://api.example.com", "true")).toBe(
    0,
  );
});

test("rejects an invalid diagnostics flag in a fresh runtime", async () => {
  expect(await validateWebEnvironment("https://api.example.com", "yes")).toBe(
    1,
  );
});
