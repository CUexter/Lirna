export function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(
    new Date(value),
  );
}

export function formatState(value: string | undefined) {
  return value === "recommended-archive" ? "recommended archive" : "active";
}

export function formatRelativeDate(value: string | undefined) {
  if (!value) return "—";
  const days = Math.floor(
    (Date.now() - new Date(value).getTime()) / (1000 * 60 * 60 * 24),
  );
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return formatDate(value);
}
