import { describe, expect, test } from "bun:test";
import {
  annotationColors as persistedAnnotationColors,
  annotationKinds as persistedAnnotationKinds,
} from "@lirna/db/schema/annotations";
import { persistedAuthoredTargetOffsetBases } from "@lirna/db/schema/authored-text-columns";
import {
  citationResolutionActions as persistedCitationResolutionActions,
  citationResolutionMethods as persistedCitationResolutionMethods,
} from "@lirna/db/schema/citation-resolutions";

import {
  annotationColors,
  annotationKinds,
} from "./annotations/annotation-contract";
import { authoredTargetOffsetBasis } from "./authored-targets/authored-target";
import {
  citationResolutionActions,
  citationResolutionMethods,
} from "./citation-resolutions/citation-resolution-contract";

describe("persisted vocabulary parity", () => {
  test("keeps authored targets and Annotation values aligned with PostgreSQL", () => {
    expect(persistedAuthoredTargetOffsetBases).toEqual([
      authoredTargetOffsetBasis,
    ]);
    expect(persistedAnnotationColors).toEqual(annotationColors);
    expect(persistedAnnotationKinds).toEqual(annotationKinds);
  });

  test("keeps Citation resolution values aligned with PostgreSQL", () => {
    expect(persistedCitationResolutionActions).toEqual(
      citationResolutionActions,
    );
    expect(persistedCitationResolutionMethods).toEqual(
      citationResolutionMethods,
    );
  });
});
