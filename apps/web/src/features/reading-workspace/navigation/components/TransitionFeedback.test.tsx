import { expect, test } from "bun:test";
import { fireEvent, render } from "@testing-library/react";

import { WorkspaceTransitionFeedback } from "./TransitionFeedback";

test("asks before following an uncaptured publisher-authored link", () => {
  let confirmed = false;
  const view = render(
    <WorkspaceTransitionFeedback
      annotationDiscard={{
        onCancel: () => undefined,
        onConfirm: () => undefined,
        open: false,
      }}
      workspaceLeave={{
        link: {
          href: "https://example.com/publication",
          label: "Related publication",
        },
        onCancel: () => undefined,
        onConfirm: () => {
          confirmed = true;
        },
        open: true,
      }}
    />,
  );

  expect(
    view.getByRole("heading", { name: "Leave the Reading workspace?" }),
  ).toBeTruthy();
  expect(
    view.getByText(/Related publication opens a publication/),
  ).toBeTruthy();

  fireEvent.click(view.getByRole("button", { name: "Continue to link" }));
  expect(confirmed).toBe(true);
});
