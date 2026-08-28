import { expect, test } from "bun:test";
import { createContext } from "./context";
import { createTestApplication } from "./orpc/application-test-support";

test("attaches request behavior without changing the application module", () => {
  const application = createTestApplication();
  const observation = {
    requestId: "request-1",
    emit() {},
    fail() {},
  };
  const context = createContext({
    application,
    observation,
    debugErrors: true,
  });

  expect(context.annotations).toBe(application.annotations);
  expect(context.observation).toBe(observation);
  expect(context.debugErrors).toBe(true);
});
