export type ReadingInline =
  | { kind: "text"; text: string }
  | { kind: "anchor"; id: string; children: ReadingInline[] }
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
  | { kind: "figure"; figure: ReadingFigure }
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
  // Retained as a catalog so persisted v1 derivatives without placed blocks render.
  figures: ReadingFigure[];
  bibliography: ReadingBibliographyGroup[];
  plainText: string;
}
