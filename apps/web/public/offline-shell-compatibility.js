// fallow-ignore-file unused-file -- Workbox imports this generated-worker entry.
const shellVersion = 1;
const supportedPersistedVersions = new Set([1]);

self.addEventListener("message", (event) => {
  const request = event.data;
  const port = event.ports[0];
  if (
    request?.type !== "lirna:inspect-offline-compatibility" ||
    typeof request.persistedVersion !== "number" ||
    !port
  )
    return;

  const compatible = supportedPersistedVersions.has(request.persistedVersion);
  port.postMessage({
    type: "lirna:offline-shell-compatibility",
    status: compatible ? "compatible" : "incompatible",
    shellVersion,
    persistedVersion: request.persistedVersion,
    ...(compatible
      ? {}
      : {
          reason: `Application shell version ${shellVersion} cannot read persisted Offline working-set version ${request.persistedVersion}.`,
        }),
  });
});
