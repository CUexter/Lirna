import { expect, test } from "bun:test";
import { act, waitFor } from "@testing-library/react";
import {
  citationResolutionCalls,
  readingRouteState,
  renderReading,
  view,
} from "./reading-route-test-harness";
import {
  openCitationBibliography,
  returnFromArticleBibliography,
  setupReadingUser,
} from "./reading-route-test-scenarios";
import { readingWorkspaceFixture } from "./source-information-test-fixture";
import { mentionEvidence } from "./workspace-citation-resolution-test-support";

test("returns from Bibliography while current Citation evidence is pending", async () => {
  const pendingEvidence = Promise.withResolvers<unknown[]>();
  readingRouteState.getCitationEvidence = () => pendingEvidence.promise;
  const user = setupReadingUser();
  const router = await renderReading("?component=article");

  await openCitationBibliography(user);
  expect(
    view().getByText("Loading current online Citation evidence…"),
  ).toBeTruthy();

  await returnFromArticleBibliography(user);
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ component: "article" }),
  );

  await act(async () => {
    pendingEvidence.resolve([mentionEvidence("citation-one")]);
    await pendingEvidence.promise;
  });
});

test("retries unavailable online evidence without closing Citation work", async () => {
  readingRouteState.getCitationEvidence = async () => {
    throw new Error("Citation evidence request failed");
  };
  const user = setupReadingUser();
  await renderReading("?component=article");

  await openCitationBibliography(user);
  expect(
    await view().findByText("Citation evidence request failed"),
  ).toBeTruthy();

  readingRouteState.getCitationEvidence = async () => [
    mentionEvidence("citation-one"),
  ];
  await user.click(view().getByRole("button", { name: "Retry evidence" }));

  expect(
    await view().findByRole("button", {
      name: "Select this candidate manually",
    }),
  ).toBeTruthy();
});

test("inspects and returns from a Citation in retained Reading without writes", async () => {
  let evidenceReads = 0;
  readingRouteState.getCitationEvidence = async () => {
    evidenceReads += 1;
    return [mentionEvidence("citation-one")];
  };
  const retainedWorkspace = readingWorkspaceFixture();
  readingRouteState.retainedReplica = {
    availability: "ready",
    manifest: {
      resources: [],
      totalBytes: 100,
      synchronizedAt: "2026-08-25T12:00:00.000Z",
      serverRetention: { state: "ready", reasons: [] },
      activeDerivative: {
        activationId:
          retainedWorkspace.state.derivatives[0]?.currentActivation?.id,
      },
    },
    replica: {
      annotations: [],
      positions: [],
      workspace: retainedWorkspace,
    },
  };
  readingRouteState.getReading = async () => {
    throw new Error("Backend unavailable");
  };
  const user = setupReadingUser();
  const router = await renderReading("?component=article");

  await openCitationBibliography(user);
  expect(
    view().getByText(
      /Current online evidence is unavailable in retained Reading/,
    ),
  ).toBeTruthy();
  expect(
    view().queryByRole("button", { name: "Select this candidate manually" }),
  ).toBeNull();
  expect(evidenceReads).toBe(0);

  await returnFromArticleBibliography(user);
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ component: "article" }),
  );
});

test("scopes consent to one request and preserves manual selection on provider failure", async () => {
  readingRouteState.citationEvidence = [mentionEvidence("citation-one")];
  const user = setupReadingUser();
  const router = await renderReading("?component=article");
  await openCitationBibliography(user);

  const consent = view().getByRole("checkbox", {
    name: /I consent to sending this displayed data/,
  });
  await user.click(consent);
  await user.click(view().getByRole("button", { name: "Request inference" }));

  expect((await view().findByRole("alert")).textContent).toContain(
    "manual selection is still available",
  );
  expect(
    (
      view().getByRole("button", {
        name: "Select this candidate manually",
      }) as HTMLButtonElement
    ).disabled,
  ).toBeFalse();
  expect(consent.getAttribute("aria-checked")).toBe("false");

  await returnFromArticleBibliography(user);
  await openCitationBibliography(user);
  expect(
    view()
      .getByRole("checkbox", {
        name: /I consent to sending this displayed data/,
      })
      .getAttribute("aria-checked"),
  ).toBe("false");

  await user.click(view().getByRole("button", { name: "Cancel" }));
  await waitFor(() =>
    expect(router.state.location.search).toEqual({ component: "article" }),
  );
});

test("keeps a failed selection available for retry", async () => {
  readingRouteState.citationEvidence = [mentionEvidence("citation-one")];
  readingRouteState.citationResolutionError = new Error(
    "Selection could not be saved",
  );
  const user = setupReadingUser();
  await renderReading("?component=article");
  await openCitationBibliography(user);

  const select = view().getByRole("button", {
    name: "Select this candidate manually",
  });
  await user.click(select);
  expect((await view().findByRole("alert")).textContent).toContain(
    "The confirmed Citation resolution is unchanged",
  );
  expect(citationResolutionCalls).toHaveLength(1);

  readingRouteState.citationResolutionError = undefined;
  await user.click(select);
  await waitFor(() => expect(citationResolutionCalls).toHaveLength(2));
});
