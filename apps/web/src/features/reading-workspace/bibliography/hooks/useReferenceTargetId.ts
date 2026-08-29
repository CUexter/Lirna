import { useContext } from "react";

import type { ReadingDerivative } from "../../article/components/Content";
import { ReferenceActions } from "../components/References";

type Component = ReadingDerivative["components"][number];
type Block = Component["introductoryBlocks"][number];

export function useReferenceTargetId(block: Block) {
  return useContext(ReferenceActions)?.index.byBlock.get(block)?.targetId;
}
