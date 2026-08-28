import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { CitationResolutionPanel } from "./citation-resolution-panel";

afterEach(cleanup);

const candidate = {
  id: "article:entry-one",
  bibliographyComponentIdentity: "article",
  bibliographyEntryId: "entry-one",
  label: "Smith (2020)",
  text: "Smith. 2020. Entry.",
  reason: "The authored surname and year matched this candidate.",
};
const evidence = {
  id: "derivative:article:citation-one",
  sourceId: "10000000-0000-4000-8000-000000000000",
  sourceStateId: "20000000-0000-4000-8000-000000000000",
  derivativeId: "30000000-0000-4000-8000-000000000000",
  componentIdentity: "article",
  mentionId: "citation-one",
  label: "Smith 2020",
  context: "See Smith 2020 for the claim.",
  state: "ambiguous" as const,
  deterministicReason:
    "The authored surname and year matched more than one Bibliography entry.",
  candidates: [candidate],
  policy: {
    rightsBasis: "publicly-accessible",
    sensitivityLevel: "ordinary-cloud",
    citationInference: {
      allowed: true,
      reason: "eligible",
      request: {
        activity: "citation-candidate-inference",
        endpointClass: "ordinary-cloud",
      },
    },
  } as const,
};

test("supports bounded manual selection and cancellation", async () => {
  const user = userEvent.setup();
  const onSelect = mock();
  const onCancel = mock();
  renderPanel({ onSelect, onCancel });

  expect(
    within(document.body).getByText(evidence.deterministicReason),
  ).toBeTruthy();
  expect(within(document.body).queryByText("Invented entry")).toBeNull();
  await user.click(
    within(document.body).getByRole("button", {
      name: "Select this candidate manually",
    }),
  );
  expect(onSelect).toHaveBeenCalledWith(candidate);
  await user.click(
    within(document.body).getByRole("button", { name: "Cancel" }),
  );
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("requires disclosure and separate consent before inference", async () => {
  const user = userEvent.setup();
  const onInfer = mock();
  renderPanel({ onInfer });
  const request = within(document.body).getByRole("button", {
    name: "Request inference",
  });
  expect((request as HTMLButtonElement).disabled).toBeTrue();
  await user.click(
    within(document.body).getByRole("checkbox", {
      name: /I consent to sending this displayed data/,
    }),
  );
  expect((request as HTMLButtonElement).disabled).toBeFalse();
  await user.click(request);
  expect(onInfer).toHaveBeenCalledTimes(1);
  expect(
    within(document.body)
      .getByRole("checkbox", {
        name: /I consent to sending this displayed data/,
      })
      .getAttribute("aria-checked"),
  ).toBe("false");
  expect((request as HTMLButtonElement).disabled).toBeTrue();
});

test("does not carry inference consent into another mention or reopened work", async () => {
  const user = userEvent.setup();
  const { rerender, unmount } = renderPanel();
  const consent = () =>
    within(document.body).getByRole("checkbox", {
      name: /I consent to sending this displayed data/,
    });
  await user.click(consent());

  rerender(
    panel({
      evidence: {
        ...evidence,
        id: "another-derivative:article:citation-two",
        mentionId: "citation-two",
        sourceStateId: "another-source-state",
      },
    }),
  );
  expect(consent().getAttribute("aria-checked")).toBe("false");

  await user.click(consent());
  unmount();
  renderPanel();
  expect(consent().getAttribute("aria-checked")).toBe("false");
});

test("keeps manual controls on provider failure and requires acceptance of a suggestion", async () => {
  const user = userEvent.setup();
  const onSelect = mock();
  const { rerender } = renderPanel({
    inference: {
      status: "unavailable",
      candidateId: null,
      confidence: null,
      reasoning: "Citation inference could not produce a safe suggestion",
    },
    onSelect,
  });
  expect(within(document.body).getByRole("alert").textContent).toContain(
    "manual selection is still available",
  );
  expect(
    (
      within(document.body).getByRole("button", {
        name: "Select this candidate manually",
      }) as HTMLButtonElement
    ).disabled,
  ).toBeFalse();

  const inference = {
    status: "suggested" as const,
    candidateId: candidate.id,
    confidence: 0.91,
    reasoning: "The authored year aligns.",
  };
  rerender(panel({ inference, onSelect }));
  expect(onSelect).not.toHaveBeenCalled();
  await user.click(
    within(document.body).getByRole("button", {
      name: "Accept inferred suggestion",
    }),
  );
  expect(onSelect).toHaveBeenCalledWith(candidate, inference);
});

test("labels a correction and clears it explicitly", async () => {
  const user = userEvent.setup();
  const onClear = mock();
  renderPanel({ current: resolution(), onClear });
  expect(
    (
      within(document.body).getByRole("button", {
        name: "Manually selected",
      }) as HTMLButtonElement
    ).disabled,
  ).toBeTrue();
  await user.click(
    within(document.body).getByRole("button", { name: "Clear resolution" }),
  );
  expect(onClear).toHaveBeenCalledTimes(1);
});

function renderPanel(overrides: Partial<Parameters<typeof panel>[0]> = {}) {
  return render(panel(overrides));
}

function panel(overrides: Record<string, unknown> = {}) {
  const panelEvidence =
    (overrides.evidence as typeof evidence | undefined) ?? evidence;
  return (
    <CitationResolutionPanel
      availability="ready"
      evidence={panelEvidence}
      key={panelEvidence.id}
      onCancel={() => undefined}
      onClear={() => undefined}
      onInfer={() => undefined}
      onSelect={() => undefined}
      pending={{ clear: false, infer: false, select: false }}
      {...overrides}
    />
  );
}

function resolution() {
  return {
    id: "40000000-0000-4000-8000-000000000000",
    sourceId: evidence.sourceId,
    sourceStateId: evidence.sourceStateId,
    derivativeId: evidence.derivativeId,
    componentIdentity: evidence.componentIdentity,
    mentionId: evidence.mentionId,
    bibliographyComponentIdentity: candidate.bibliographyComponentIdentity,
    bibliographyEntryId: candidate.bibliographyEntryId,
    publisherAnchor: evidence.mentionId,
    offsetBasis: "normalized-derivative-text-v1" as const,
    normalizedStartOffset: 4,
    normalizedEndOffset: 14,
    exactText: evidence.label,
    prefix: "See ",
    suffix: " for the claim.",
    actorId: "user-1",
    method: "manual" as const,
    confidence: null,
    reasoning: null,
    createdAt: "2026-08-24T00:00:00.000Z",
    updatedAt: "2026-08-24T00:00:00.000Z",
  };
}
