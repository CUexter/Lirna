import type { OrpcRouter } from "@lirna/api/client";
import type { InferClientOutputs } from "@orpc/client";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { serverUrl } from "@/utils/server-url";

const link = new RPCLink({
  origin: serverUrl,
  url: "/orpc",
  fetch(url, init) {
    return fetch(url, { ...init, credentials: "include" });
  },
});

const client = createORPCClient<RouterClient<OrpcRouter>>(link);

export const inquiry = createTanstackQueryUtils(client);

export type InquiryOutputs = InferClientOutputs<typeof client>;
