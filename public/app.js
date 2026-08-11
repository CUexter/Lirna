/**
 * @typedef {{
 *   id: string,
 *   status: "queued" | "processing" | "completed" | "failed",
 *   result?: { artifactUrl: string, vaultPath: string },
 *   error?: string
 * }} PublicOperation
 */

/**
 * Submit through the same client boundary used by the installed PWA.
 *
 * @param {string} baseUrl
 * @param {string} input
 * @param {(status: PublicOperation["status"]) => void} [onStatus]
 * @param {number} [pollInterval]
 * @returns {Promise<PublicOperation>}
 */
export async function submitSyntheticOperation(
  baseUrl,
  input,
  onStatus = () => {},
  pollInterval = 500,
) {
  const submittedResponse = await fetch(`${baseUrl}/api/operations`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ kind: "synthetic-adapter-roundtrip", input }),
  });
  if (!submittedResponse.ok) {
    throw new Error("The operation could not be submitted");
  }

  /** @type {PublicOperation} */
  let operation = await submittedResponse.json();
  onStatus(operation.status);

  while (operation.status === "queued" || operation.status === "processing") {
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    const response = await fetch(`${baseUrl}/api/operations/${operation.id}`);
    if (!response.ok) {
      throw new Error("The operation status could not be read");
    }
    const previousStatus = operation.status;
    operation = await response.json();
    if (operation.status !== previousStatus) {
      onStatus(operation.status);
    }
  }

  if (operation.status === "failed") {
    throw new Error(operation.error ?? "The worker could not complete the operation");
  }
  return operation;
}

if (typeof document !== "undefined") {
  const form = document.querySelector("form");
  const input = document.querySelector("textarea");
  const button = document.querySelector("button");
  const status = document.querySelector("[data-status]");
  const result = document.querySelector("[data-result]");

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!(input instanceof HTMLTextAreaElement) || !(button instanceof HTMLButtonElement)) {
      return;
    }

    button.disabled = true;
    result?.replaceChildren();
    try {
      const operation = await submitSyntheticOperation(
        "",
        input.value,
        (nextStatus) => {
          if (status) status.textContent = nextStatus;
        },
      );
      if (result && operation.result) {
        const link = document.createElement("a");
        link.href = operation.result.artifactUrl;
        link.textContent = "Open the stored synthetic artifact";
        result.replaceChildren(link);
      }
    } catch (error) {
      if (status) {
        status.textContent = error instanceof Error ? error.message : "Operation failed";
      }
    } finally {
      button.disabled = false;
    }
  });

  if ("serviceWorker" in navigator) {
    void navigator.serviceWorker.register("/service-worker.js");
  }
}
