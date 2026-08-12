export type WorkflowInput = Record<string, JsonValue>;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

export function isWorkflowInput(value: unknown): value is WorkflowInput {
  return isJsonObject(value);
}

function isJsonObject(value: unknown): value is Record<string, JsonValue> {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    Object.values(value).every(isJsonValue);
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isJsonObject(value);
}
