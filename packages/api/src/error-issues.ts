export function validationIssuePath(path: unknown) {
  return Array.isArray(path)
    ? path
        .filter(
          (part): part is string | number =>
            typeof part === "string" || typeof part === "number",
        )
        .join(".")
    : "";
}
