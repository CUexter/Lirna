// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { getOperation, submitSyntheticOperation } from "./operations";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client operations boundary", () => {
  it("submits a synthetic operation through the public control plane", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "op-1", status: "queued" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const operation = await submitSyntheticOperation("A fixture");

    expect(operation).toEqual({ id: "op-1", status: "queued" });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/operations",
      expect.objectContaining({ method: "POST" }),
    );
    const requestInit = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(JSON.parse(requestInit.body as string)).toEqual({
      kind: "synthetic-adapter-roundtrip",
      input: "A fixture",
    });
  });

  it("reports a submission failure instead of inventing state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));

    await expect(submitSyntheticOperation("x")).rejects.toThrow(
      "The operation could not be submitted",
    );
  });

  it("observes an operation by id", async () => {
    const completed = {
      id: "op-2",
      status: "completed",
      result: {
        artifactUrl: "/api/operations/op-2/artifact",
        vaultPath: "synthetic/op-2.md",
      },
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => completed });
    vi.stubGlobal("fetch", fetchMock);

    const operation = await getOperation("op-2");

    expect(operation).toEqual(completed);
    expect(fetchMock).toHaveBeenCalledWith("/api/operations/op-2");
  });
});
