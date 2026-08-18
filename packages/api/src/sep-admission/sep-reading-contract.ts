import { z } from "zod";

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
  z.object({ kind: z.literal("diagnostic"), diagnostic: diagnosticSchema }),
]);
const sectionSchema: z.ZodType<ReadingSection> = z.object({
  id: z.string().min(1),
  title: z.array(inlineSchema).min(1),
  level: z.number().int().min(2).max(6),
  blocks: z.array(blockSchema),
  children: z.array(z.lazy(() => sectionSchema)),
});
const figureSchema = z.object({
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

export const sepReadingContractSchema = z.object({
  version: z.literal(1),
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
    parser: z.object({ id: z.literal("parse5"), version: z.literal("7.3.0") }),
    inputResourceHashes: z.array(
      z.object({
        identity: z.string().min(1),
        sha256: z.string().regex(/^[0-9a-f]{64}$/),
      }),
    ),
  }),
});

export type SepReadingContract = z.infer<typeof sepReadingContractSchema>;
export type ReadingInline =
  | { kind: "text"; text: string }
  | {
      kind: "emphasis" | "subscript" | "superscript";
      children: ReadingInline[];
    }
  | { kind: "tex"; source: string; display: boolean }
  | {
      kind: "link";
      href: string;
      internal: boolean;
      children: ReadingInline[];
    }
  | {
      kind: "citation";
      mentionId: string;
      label: string;
      state: "resolved" | "ambiguous" | "unresolved";
      candidates: string[];
      rule: string;
      evidence: string;
      entryId?: string;
    };
export interface ReadingBibliographyGroup {
  id: string;
  title: string;
  entries: Array<{
    id: string;
    label: string;
    text: string;
    anchor: string;
    links: Array<{ label: string; href: string; onlineOnly: true }>;
    provenance: { componentIdentity: string; locator: string };
  }>;
  provenance: { componentIdentity: string; locator: string };
}
export type ReadingBlock =
  | { kind: "paragraph" | "quotation"; children: ReadingInline[] }
  | { kind: "statement"; label: ReadingInline[]; body: ReadingInline[] }
  | { kind: "list"; ordered: boolean; items: ReadingInline[][] }
  | {
      kind: "table";
      caption: ReadingInline[];
      head: Array<{ cells: ReadingInline[][] }>;
      body: Array<{ cells: ReadingInline[][] }>;
    }
  | { kind: "diagnostic"; diagnostic: ReadingDiagnostic };
export interface ReadingDiagnostic {
  level: "info" | "warning";
  code: string;
  message: string;
  source: { componentIdentity: string; locator: string };
}
export interface ReadingSection {
  id: string;
  title: ReadingInline[];
  level: number;
  blocks: ReadingBlock[];
  children: ReadingSection[];
}
export interface ReadingTocItem {
  id: string;
  title: string;
  children: ReadingTocItem[];
}
export interface ReadingFigure {
  id: string;
  caption: ReadingInline[];
  description: { text: ReadingInline[]; componentIdentity?: string };
  dimensions: { width?: number; height?: number };
  assetIdentity?: string;
  assetDataUrl?: string;
  diagnostics: ReadingDiagnostic[];
}
export interface ReadingComponent {
  identity: string;
  role:
    | "main"
    | "supplement"
    | "notes"
    | "figure-description"
    | "unknown-component";
  label: string;
  parentIdentity?: string;
  order: number;
  requestedUrl: string;
  finalUrl: string;
  retrievedAt: string;
  sha256: string;
  toc: ReadingTocItem[];
  introductoryBlocks: ReadingBlock[];
  sections: ReadingSection[];
  figures: ReadingFigure[];
  bibliography: ReadingBibliographyGroup[];
  plainText: string;
}

export function readSepReadingDerivative(value: unknown): SepReadingContract {
  return sepReadingContractSchema.parse(value);
}
export { derivativeKind as sepReadingDerivativeKind };
