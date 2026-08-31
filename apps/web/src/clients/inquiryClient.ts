import type { InquiryRouter } from "@lirna/api/client";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

import { serverUrl } from "@/infrastructure/server/url";

const link = new RPCLink({
  origin: serverUrl,
  url: "/orpc",
  fetch(url, init) {
    return fetch(url, { ...init, credentials: "include" });
  },
});

export const inquiryClient =
  createORPCClient<RouterClient<InquiryRouter>>(link);
