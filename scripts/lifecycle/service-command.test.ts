import { expect, test } from "bun:test";
import { serviceProcessEnvironment } from "./service-command";

test("the dev server loads its OpenRouter key instead of inheriting one", () => {
  const inherited = {
    OPENROUTER_API_KEY: "shell-key",
    SHELL_ONLY: "preserved",
  };

  expect(serviceProcessEnvironment("server", {}, 3000, inherited)).toEqual({
    PORT: "3000",
    SHELL_ONLY: "preserved",
  });
  expect(serviceProcessEnvironment("web", {}, 3001, inherited)).toEqual({
    OPENROUTER_API_KEY: "shell-key",
    PORT: "3001",
    SHELL_ONLY: "preserved",
  });
});
