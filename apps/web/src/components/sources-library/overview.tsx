import { BookOpenIcon, CalendarDaysIcon, Layers3Icon } from "lucide-react";

import { formatRelativeDate } from "./format";

export function LibraryOverview({
  latestAdmission,
  sourceCount,
  stateCount,
}: {
  latestAdmission: string | undefined;
  sourceCount: number;
  stateCount: number;
}) {
  return (
    <section
      aria-label="Library overview"
      className="grid gap-px border border-border bg-border sm:grid-cols-3"
    >
      <LibraryStat icon={Layers3Icon} label="Sources" value={sourceCount} />
      <LibraryStat
        icon={CalendarDaysIcon}
        label="Source states"
        value={stateCount}
      />
      <LibraryStat
        icon={BookOpenIcon}
        label="Latest admission"
        value={formatRelativeDate(latestAdmission)}
      />
    </section>
  );
}

function LibraryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Layers3Icon;
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center gap-3 bg-card px-4 py-3">
      <Icon aria-hidden="true" className="size-4 text-primary" />
      <div>
        <p className="font-mono text-lg leading-none">{value}</p>
        <p className="mt-1 text-[0.65rem] text-muted-foreground uppercase tracking-[0.12em]">
          {label}
        </p>
      </div>
    </div>
  );
}
