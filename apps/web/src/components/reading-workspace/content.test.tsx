import { expect, test } from "bun:test";
import { render } from "@testing-library/react";

import { Figure } from "./content";

const missingAssetDiagnostic = {
  level: "warning" as const,
  code: "missing-semantic-asset",
  message: "The semantic figure asset was not retained.",
  source: { componentIdentity: "active:/", locator: "<img>" },
};

test("shows semantic diagnostics for images that were not retained", () => {
  const view = render(
    <Figure
      figure={{
        id: "figure-1",
        caption: [],
        description: {
          text: [{ kind: "text", text: "SEP man icon" }],
        },
        dimensions: {},
        diagnostics: [missingAssetDiagnostic],
      }}
    />,
  );

  expect(view.getByText("SEP man icon")).toBeTruthy();
  expect(view.getByText("Rendering note: missing-semantic-asset")).toBeTruthy();
});
