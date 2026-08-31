import type { InferClientInputs, InferClientOutputs } from "@orpc/client";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

import { inquiryClient } from "./inquiryClient";

export const inquiry = createTanstackQueryUtils(inquiryClient);

export type InquiryOutputs = InferClientOutputs<typeof inquiryClient>;
export type InquiryInputs = InferClientInputs<typeof inquiryClient>;
