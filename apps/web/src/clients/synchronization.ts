import type { InferClientOutputs } from "@orpc/client";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { serverUrl } from "@/utils/server-url";

type SynchronizationRouter = { synchronization: Record<string, never> };

const link = new RPCLink({
  origin: serverUrl,
  url: "/orpc",
  fetch(url, init) {
    return fetch(url, { ...init, credentials: "include" });
  },
});

const client = createORPCClient<RouterClient<SynchronizationRouter>>(link);

export const synchronization = createTanstackQueryUtils(client);

export type SynchronizationOutputs = InferClientOutputs<typeof client>;
