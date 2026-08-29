import { z } from "zod";
import { projectReadingArticle, projectVersionOneReadingArticle } from "./text";
import type {
  ReadingBibliographyGroup,
  ReadingBlock,
  ReadingFigure,
  ReadingInline,
  ReadingSection,
  ReadingTocItem,
} from "./types";

export type {
  ReadingBibliographyGroup,
  ReadingBlock,
  ReadingComponent,
  ReadingDiagnostic,
  ReadingFigure,
  ReadingInline,
  ReadingSection,
  ReadingTocItem,
} from "./types";

const derivativeKind = "sep-reading-v1";

const inlineSchema: z.ZodType<ReadingInline> = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string().min(1) }),
  z.object({
    kind: z.literal("emphasis"),
    children: z.array(z.lazy(() => inlineSchema)),
  }),
  z.object({
    kind: z.literal("subscript"),
    children: z.array(z.lazy(() => inlineSchema)),
  }),
  z.object({
    kind: z.literal("superscript"),
    children: z.array(z.lazy(() => inlineSchema)),
  }),
  z.object({
    kind: z.literal("anchor"),
    id: z.string().min(1),
    children: z.array(z.lazy(() => inlineSchema)),
  }),
  z.object({
    kind: z.literal("tex"),
    source: z.string().min(1),
    display: z.boolean(),
  }),
  z.object({
    kind: z.literal("link"),
    href: z.string().min(1),
    internal: z.boolean(),
    children: z.array(z.lazy(() => inlineSchema)),
  }),
  z.object({
    kind: z.literal("citation"),
    mentionId: z.string().min(1),
    label: z.string().min(1),
    state: z.enum(["resolved", "ambiguous", "unresolved"]),
    candidates: z.array(z.string().min(1)),
    rule: z.string().min(1),
    evidence: z.string().min(1),
    entryId: z.string().min(1).optional(),
  }),
]);
const diagnosticSchema = z.object({
  level: z.enum(["info", "warning"]),
  code: z.string(),
  message: z.string(),
  source: z.object({
    componentIdentity: z.string().min(1),
    locator: z.string().min(1),
  }),
});
const tableRowSchema = z.object({
  cells: z.array(z.array(z.lazy(() => inlineSchema))),
});
const figureSchema: z.ZodType<ReadingFigure> = z.object({
  id: z.string().min(1),
  caption: z.array(inlineSchema),
  description: z.object({
    text: z.array(inlineSchema),
    componentIdentity: z.string().min(1).optional(),
  }),
  dimensions: z
    .object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    })
    .partial(),
  assetIdentity: z.string().min(1).optional(),
  assetDataUrl: z.string().startsWith("data:image/").optional(),
  diagnostics: z.array(diagnosticSchema),
});
const blockSchema: z.ZodType<ReadingBlock> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("paragraph"),
    children: z.array(inlineSchema).min(1),
  }),
  z.object({
    kind: z.literal("statement"),
    label: z.array(inlineSchema).min(1),
    body: z.array(inlineSchema).min(1),
  }),
  z.object({
    kind: z.literal("quotation"),
    children: z.array(inlineSchema).min(1),
  }),
  z.object({
    kind: z.literal("list"),
    ordered: z.boolean(),
    items: z.array(z.array(inlineSchema).min(1)).min(1),
  }),
  z.object({
    kind: z.literal("table"),
    caption: z.array(inlineSchema),
    head: z.array(tableRowSchema),
    body: z.array(tableRowSchema),
  }),
  z.object({ kind: z.literal("figure"), figure: figureSchema }),
  z.object({ kind: z.literal("diagnostic"), diagnostic: diagnosticSchema }),
]);
const sectionSchema: z.ZodType<ReadingSection> = z.object({
  id: z.string().min(1),
  title: z.array(inlineSchema).min(1),
  level: z.number().int().min(2).max(6),
  blocks: z.array(blockSchema),
  children: z.array(z.lazy(() => sectionSchema)),
});
const tocSchema: z.ZodType<ReadingTocItem> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  children: z.array(z.lazy(() => tocSchema)),
});
const componentSchema = z.object({
  identity: z.string().min(1),
  role: z.enum([
    "main",
    "supplement",
    "notes",
    "figure-description",
    "unknown-component",
  ]),
  label: z.string().min(1),
  parentIdentity: z.string().min(1).optional(),
  order: z.number().int().nonnegative(),
  requestedUrl: z.string().url(),
  finalUrl: z.string().url(),
  retrievedAt: z.string().datetime(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  toc: z.array(tocSchema),
  introductoryBlocks: z.array(blockSchema),
  sections: z.array(sectionSchema),
  figures: z.array(figureSchema),
  bibliography: z.array(z.lazy(() => bibliographyGroupSchema)),
  plainText: z.string(),
});

const bibliographyLinkSchema = z.object({
  label: z.string().min(1),
  href: z.string().url(),
  onlineOnly: z.literal(true),
});
const bibliographyEntrySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  text: z.string().min(1),
  anchor: z.string().min(1),
  links: z.array(bibliographyLinkSchema),
  provenance: z.object({
    componentIdentity: z.string().min(1),
    locator: z.string().min(1),
  }),
});
const bibliographyGroupSchema: z.ZodType<ReadingBibliographyGroup> = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  entries: z.array(bibliographyEntrySchema),
  provenance: z.object({
    componentIdentity: z.string().min(1),
    locator: z.string().min(1),
  }),
});

export const sepReadingContractSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2)]),
    source: z.object({
      id: z.string().uuid(),
      stateId: z.string().uuid(),
      title: z.string().min(1),
      authors: z.array(z.string()),
      publisher: z.string().min(1),
      publicationHistory: z.array(z.string()),
      canonicalUrl: z.string().url(),
      observation: z.enum(["submitted", "recommended-archive"]),
      admittedAt: z.string().datetime(),
    }),
    mainComponent: z.object({
      identity: z.string().min(1),
      requestedUrl: z.string().url(),
      finalUrl: z.string().url(),
      retrievedAt: z.string().datetime(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
    }),
    components: z.array(componentSchema).min(1),
    capture: z.object({
      completeness: z.enum(["complete", "partial", "stopped"]),
      readingReadiness: z.enum(["ready", "degraded"]),
      readinessReasons: z.array(z.string()),
      diagnostics: z.array(diagnosticSchema),
    }),
    toc: z.array(tocSchema),
    introductoryBlocks: z.array(blockSchema),
    sections: z.array(sectionSchema),
    plainText: z.string(),
    provenance: z.object({
      adapter: z.object({ id: z.literal("sep"), version: z.literal("1") }),
      parser: z.object({
        id: z.literal("parse5"),
        version: z.literal("7.3.0"),
      }),
      inputResourceHashes: z.array(
        z.object({
          identity: z.string().min(1),
          sha256: z.string().regex(/^[0-9a-f]{64}$/),
        }),
      ),
    }),
  })
  .superRefine((reading, context) => {
    for (const [index, component] of reading.components.entries()) {
      const projection = (
        reading.version === 1
          ? projectVersionOneReadingArticle
          : projectReadingArticle
      )(component.introductoryBlocks, component.sections);
      if (projection.text !== component.plainText) {
        context.addIssue({
          code: "custom",
          message:
            "Reading component plain text does not match its typed content",
          path: ["components", index, "plainText"],
        });
      }
    }
    const main = reading.components.find(
      (component) => component.identity === reading.mainComponent.identity,
    );
    if (!main) {
      context.addIssue({
        code: "custom",
        message: "Reading main component is missing",
        path: ["mainComponent", "identity"],
      });
    } else if (reading.plainText !== main.plainText) {
      context.addIssue({
        code: "custom",
        message: "Reading plain text does not match its main component",
        path: ["plainText"],
      });
    }
  });

export type SepReadingContract = z.infer<typeof sepReadingContractSchema>;

export function readSepReadingDerivative(value: unknown): SepReadingContract {
  return sepReadingContractSchema.parse(value);
}
export { derivativeKind as sepReadingDerivativeKind };
