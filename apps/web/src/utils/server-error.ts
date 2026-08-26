import { validationIssuePath } from "@lirna/api/client/error-issues";

export type FormattedServerError = {
  message: string;
  technicalDetails?: string;
};

function formatIssues(
  issues: { message?: unknown; path?: unknown }[] | undefined,
) {
  if (!Array.isArray(issues)) return [];

  const messages: string[] = [];
  for (const issue of issues) {
    if (typeof issue.message !== "string") continue;
    const path = validationIssuePath(issue.path);
    messages.push(path ? `${path}: ${issue.message}` : issue.message);
  }
  return messages;
}

export function formatServerError(error: Error): FormattedServerError {
  const data = (
    error as Error & {
      data?: {
        debug?: { stack?: unknown; type?: unknown };
        issues?: { message?: unknown; path?: unknown }[];
        requestId?: unknown;
      };
    }
  ).data;
  const messages = [error.message, ...formatIssues(data?.issues)];
  if (typeof data?.requestId === "string") {
    messages.push(`Error reference: ${data.requestId}`);
  }

  const debugType = data?.debug?.type;
  const debugStack = data?.debug?.stack;
  const technicalDetails =
    typeof debugStack === "string"
      ? debugStack
      : typeof debugType === "string"
        ? debugType
        : undefined;

  return {
    message: messages.join("\n"),
    ...(technicalDetails ? { technicalDetails } : {}),
  };
}
