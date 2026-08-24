import { expect, test } from "bun:test";

import { createComponentChangeHandler } from "./workspace-controller";

test("navigates before saving browser history for a component change", () => {
  const calls: string[] = [];
  const handleComponentChange = createComponentChangeHandler({
    onComponentChange: (identity) => calls.push(`navigate:${identity}`),
    saveLocation: () => calls.push("save"),
    setEditingAnnotationId: () => undefined,
    setNotesIdentity: () => undefined,
    setSelectedReference: () => undefined,
  });

  handleComponentChange("supplement-one");

  expect(calls).toEqual(["navigate:supplement-one", "save"]);
});
