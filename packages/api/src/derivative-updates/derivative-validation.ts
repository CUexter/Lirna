import type { SepReadingContract } from "../sep-admission/sep-reading-contract";
import { sepReadingContractSchema } from "../sep-admission/sep-reading-contract";
import type { DerivativeValidation } from "./derivative-update-contract";
import { visitReading, visitSections } from "./reading-traversal";

const subjects = [
  "typed-structure",
  "internal-targets",
  "component-resources",
  "notation",
  "figures",
  "footnotes",
  "bibliography",
  "diagnostics",
] as const;

export function validateReadingCandidate(value: unknown): DerivativeValidation {
  const parsed = sepReadingContractSchema.safeParse(value);
  if (!parsed.success) {
    return {
      status: "invalid",
      checks: subjects.map((subject) => ({
        subject,
        status: "failed",
        messages:
          subject === "typed-structure"
            ? parsed.error.issues.map(({ message }) => message)
            : ["Typed structure must be valid before this check can run."],
      })),
    };
  }
  const reading = parsed.data;
  const checks = [
    check("typed-structure", []),
    check("internal-targets", internalTargetErrors(reading)),
    check("component-resources", componentReferenceErrors(reading)),
    check("notation", notationErrors(reading)),
    check("figures", figureErrors(reading)),
    check("footnotes", footnoteErrors(reading)),
    check("bibliography", bibliographyErrors(reading)),
    check("diagnostics", diagnosticErrors(reading)),
  ];
  return {
    status: checks.every(({ status }) => status === "passed")
      ? "valid"
      : "invalid",
    checks,
  };
}

function check(subject: (typeof subjects)[number], messages: string[]) {
  return {
    subject,
    status: messages.length === 0 ? ("passed" as const) : ("failed" as const),
    messages,
  };
}

function internalTargetErrors(reading: SepReadingContract) {
  const targets = new Map(
    reading.components.map(({ identity }) => [identity, new Set<string>()]),
  );
  visitReading(reading, (inline, componentIdentity) => {
    if (inline.kind === "anchor")
      targets.get(componentIdentity)?.add(inline.id);
  });
  for (const component of reading.components)
    visitSections(component.sections, ({ id }) =>
      targets.get(component.identity)?.add(id),
    );
  const errors: string[] = [];
  visitReading(reading, (inline, componentIdentity) => {
    if (
      inline.kind === "link" &&
      inline.internal &&
      inline.href.startsWith("#") &&
      !targets.get(componentIdentity)?.has(inline.href.slice(1))
    )
      errors.push(`Missing internal target ${inline.href}.`);
  });
  return errors;
}

function componentReferenceErrors(reading: SepReadingContract) {
  const identities = new Set(
    reading.components.map(({ identity }) => identity),
  );
  const hashes = new Map(
    reading.provenance.inputResourceHashes.map((item) => [
      item.identity,
      item.sha256,
    ]),
  );
  return reading.components.flatMap((component) => {
    const errors: string[] = [];
    if (component.parentIdentity && !identities.has(component.parentIdentity))
      errors.push(`Missing parent component ${component.parentIdentity}.`);
    if (hashes.get(component.identity) !== component.sha256)
      errors.push(
        `Component ${component.identity} does not match its resource hash.`,
      );
    return errors;
  });
}

function notationErrors(reading: SepReadingContract) {
  const errors: string[] = [];
  visitReading(reading, (inline) => {
    if (inline.kind === "tex" && !inline.source.trim())
      errors.push("Notation contains an empty TeX source.");
  });
  return errors;
}

function figureErrors(reading: SepReadingContract) {
  return reading.components.flatMap((component) =>
    component.figures.flatMap((figure) =>
      figure.id && (figure.assetDataUrl || figure.diagnostics.length > 0)
        ? []
        : [
            `Figure ${figure.id || "without identity"} lacks evidence or diagnostics.`,
          ],
    ),
  );
}

function footnoteErrors(reading: SepReadingContract) {
  const notes = reading.components.filter(({ role }) => role === "notes");
  const targets = componentTargets(reading);
  const errors: string[] = [];
  visitReading(reading, (inline, componentIdentity) => {
    if (inline.kind !== "link" || !/notes?\.html/i.test(inline.href)) return;
    const source = reading.components.find(
      ({ identity }) => identity === componentIdentity,
    );
    const resolved = source
      ? resolveUrl(inline.href, source.finalUrl)
      : undefined;
    const target = resolved
      ? notes.find((component) =>
          [component.requestedUrl, component.finalUrl].some(
            (url) => withoutFragment(url) === withoutFragment(resolved.href),
          ),
        )
      : undefined;
    if (!target) {
      errors.push(
        `Footnote target ${inline.href} has no matching notes component.`,
      );
      return;
    }
    const fragment = resolved?.hash.slice(1);
    if (fragment && !targets.get(target.identity)?.has(fragment))
      errors.push(
        `Footnote target ${inline.href} has no matching note anchor.`,
      );
  });
  return errors;
}

function componentTargets(reading: SepReadingContract) {
  const targets = new Map(
    reading.components.map(({ identity }) => [identity, new Set<string>()]),
  );
  visitReading(reading, (inline, componentIdentity) => {
    if (inline.kind === "anchor")
      targets.get(componentIdentity)?.add(inline.id);
  });
  for (const component of reading.components)
    visitSections(component.sections, ({ id }) =>
      targets.get(component.identity)?.add(id),
    );
  return targets;
}

function resolveUrl(href: string, base: string) {
  try {
    return new URL(href, base);
  } catch {
    return undefined;
  }
}

function withoutFragment(value: string) {
  const url = resolveUrl(value, value);
  if (!url) return value;
  url.hash = "";
  return url.href;
}

function bibliographyErrors(reading: SepReadingContract) {
  const entries = new Map(
    reading.components.map((component) => [
      component.identity,
      new Set(
        component.bibliography.flatMap((group) =>
          group.entries.map(({ id }) => id),
        ),
      ),
    ]),
  );
  const errors: string[] = [];
  visitReading(reading, (inline, componentIdentity) => {
    if (
      inline.kind === "citation" &&
      inline.state === "resolved" &&
      inline.entryId &&
      !entries.get(componentIdentity)?.has(inline.entryId) &&
      !entries.get(reading.mainComponent.identity)?.has(inline.entryId)
    )
      errors.push(`Citation ${inline.mentionId} has no Bibliography entry.`);
  });
  return errors;
}

function diagnosticErrors(reading: SepReadingContract) {
  return reading.capture.diagnostics.flatMap((diagnostic) =>
    diagnostic.code.trim() &&
    diagnostic.message.trim() &&
    diagnostic.source.componentIdentity.trim() &&
    diagnostic.source.locator.trim()
      ? []
      : ["A diagnostic is missing its code, message, or provenance."],
  );
}
