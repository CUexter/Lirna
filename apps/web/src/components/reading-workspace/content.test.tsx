import { expect, test } from "bun:test";
import { render } from "@testing-library/react";

import { Diagnostic, Figure } from "./content";

const missingAssetDiagnostic = {
  level: "warning" as const,
  code: "missing-semantic-asset",
  message: "The semantic figure asset was not retained.",
  source: { componentIdentity: "active:/", locator: "<img>" },
};

test("hides legacy placeholders for images that were not retained", () => {
  const view = render(
    <>
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
      />
      <Diagnostic diagnostic={missingAssetDiagnostic} />
    </>,
  );

  expect(view.container.innerHTML).toBe("");
});
