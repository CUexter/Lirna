import { createHash } from "node:crypto";
import type { SepReadingContract } from "../sep-admission/reading/contract";
import type { DerivativeComparison } from "./derivative-update-contract";

const subjects = ["components", "sections", "figures", "bibliography"] as const;

export function compareDerivativeStructure(
  before: SepReadingContract | undefined,
  after: SepReadingContract,
): DerivativeComparison["structure"] {
  return subjects.map((subject) => {
    const previous = structureItems(before, subject);
    const next = structureItems(after, subject);
    return {
      subject,
      before: previous.length,
      after: next.length,
      ...(before ? { beforeSha256: valueHash(previous) } : {}),
      afterSha256: valueHash(next),
    };
  });
}

function valueHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function structureItems(
  reading: SepReadingContract | undefined,
  subject: (typeof subjects)[number],
): unknown[] {
  if (!reading) return [];
  if (subject === "components")
    return reading.components.map(
      ({ identity, role, order, parentIdentity }) => ({
        identity,
        role,
        order,
        ...(parentIdentity ? { parentIdentity } : {}),
      }),
    );
  if (subject === "sections")
    return reading.components.flatMap((component) =>
      sectionItems(component.sections, component.identity),
    );
  if (subject === "figures")
    return reading.components.flatMap((component) =>
      component.figures.map(({ id }) => ({
        componentIdentity: component.identity,
        id,
      })),
    );
  return reading.components.flatMap((component) =>
    component.bibliography.flatMap((group) =>
      group.entries.map(({ id }) => ({
        componentIdentity: component.identity,
        groupId: group.id,
        id,
      })),
    ),
  );
}

function sectionItems(
  sections: SepReadingContract["components"][number]["sections"],
  componentIdentity: string,
  parentId?: string,
): unknown[] {
  return sections.flatMap((section) => [
    {
      componentIdentity,
      id: section.id,
      level: section.level,
      ...(parentId ? { parentId } : {}),
    },
    ...sectionItems(section.children, componentIdentity, section.id),
  ]);
}
