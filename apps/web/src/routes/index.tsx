import { Badge } from "@lirna/ui/components/badge";
import { Button } from "@lirna/ui/components/button";
import {
  Card,
  CardAction,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@lirna/ui/components/input-group";
import { Separator } from "@lirna/ui/components/separator";
import { createFileRoute } from "@tanstack/react-router";
import {
  AlertCircleIcon,
  ArrowRightIcon,
  BookMarkedIcon,
  BookOpenIcon,
  BrainIcon,
  CircleDotIcon,
  FileTextIcon,
  LibraryIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchIcon,
  SparklesIcon,
} from "lucide-react";

import { ModeToggle } from "@/components/mode-toggle";

export const Route = createFileRoute("/")({
  component: RouteComponent,
});

const navigation = [
  { label: "Now", icon: CircleDotIcon, active: true },
  { label: "Research", icon: MessageSquareTextIcon, active: false },
  { label: "Read", icon: BookOpenIcon, active: false },
  { label: "Learn", icon: BrainIcon, active: false },
  {
    label: "Sources",
    icon: LibraryIcon,
    active: false,
    section: "Knowledge",
  },
  { label: "Notes", icon: FileTextIcon, active: false },
] as const;

const mobileNavigation = [
  ...navigation.slice(0, 4),
  { label: "More", icon: MoreHorizontalIcon, active: false },
] as const;

function QuestionComposer({ className }: { className: string }) {
  return (
    <InputGroup className={className}>
      <InputGroupInput
        aria-label="Ask, search, or add something"
        placeholder="Ask, search, or add something…"
      />
      <InputGroupAddon>
        <SearchIcon aria-hidden="true" />
      </InputGroupAddon>
    </InputGroup>
  );
}

function RouteComponent() {
  const formattedDate = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  return (
    <main className="grid min-h-full bg-background lg:grid-cols-[13rem_minmax(0,1fr)]">
      <aside className="hidden min-h-svh flex-col bg-sidebar text-sidebar-foreground lg:flex">
        <div className="flex h-20 items-center px-6 font-semibold font-serif text-2xl tracking-tight">
          Lirna
        </div>
        <nav aria-label="Workspace" className="flex flex-1 flex-col px-3">
          <p className="px-3 pb-2 font-semibold text-[0.65rem] text-sidebar-foreground/70 uppercase tracking-[0.18em]">
            Work
          </p>
          {navigation.map(({ label, icon: Icon, active, ...item }) => (
            <div key={label}>
              {"section" in item ? (
                <p className="px-3 pt-7 pb-2 font-semibold text-[0.65rem] text-sidebar-foreground/70 uppercase tracking-[0.18em]">
                  {item.section}
                </p>
              ) : null}
              <Button
                type="button"
                variant="ghost"
                aria-current={active ? "page" : undefined}
                className="flex w-full justify-start gap-3 rounded-none border-transparent border-l-2 px-3 py-2.5 text-left font-medium text-sidebar-foreground/70 text-sm transition-colors hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground aria-[current=page]:border-l-sidebar-primary aria-[current=page]:bg-sidebar-accent aria-[current=page]:text-sidebar-accent-foreground"
              >
                <Icon aria-hidden="true" />
                {label}
              </Button>
            </div>
          ))}
        </nav>
        <div className="flex items-center gap-2 px-6 py-6 text-sidebar-foreground/60 text-xs">
          <span className="size-2 bg-sidebar-primary" />
          Synced just now
        </div>
      </aside>

      <div className="min-w-0 pb-20 lg:pb-0">
        <header className="sticky top-0 z-10 border-b bg-background/90 px-4 backdrop-blur sm:px-6 lg:px-10">
          <div className="mx-auto flex h-16 w-full max-w-[100rem] items-center gap-3">
            <span className="mr-auto font-semibold font-serif text-xl lg:hidden">
              Lirna
            </span>
            <QuestionComposer className="hidden max-w-xl sm:flex lg:mr-auto" />
            <Button variant="outline" size="sm">
              <PlusIcon data-icon="inline-start" />
              Add
            </Button>
            <ModeToggle />
          </div>
        </header>

        <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-10 lg:py-12">
          <QuestionComposer className="sm:hidden" />

          <div className="flex flex-col gap-1">
            <p className="font-semibold text-muted-foreground text-xs uppercase tracking-[0.18em]">
              {formattedDate} · one useful continuation
            </p>
            <h1 className="font-serif text-3xl tracking-tight sm:text-4xl">
              Welcome back.
            </h1>
          </div>

          <section className="grid gap-4 lg:grid-cols-[1.45fr_0.8fr]">
            <Card className="bg-primary text-primary-foreground [--card-spacing:--spacing(7)]">
              <CardHeader>
                <div className="flex items-center gap-2 font-semibold text-xs uppercase tracking-[0.16em] opacity-80">
                  <SparklesIcon className="size-3.5" aria-hidden="true" />
                  Resume your thought
                </div>
                <CardTitle className="max-w-3xl font-serif text-3xl leading-tight sm:text-4xl">
                  What makes resumption preserve thought rather than just screen
                  state?
                </CardTitle>
                <CardDescription className="text-primary-foreground/80">
                  Research thread · Comparing task context with unresolved
                  questions · 3 References
                </CardDescription>
              </CardHeader>
              <CardFooter className="border-primary-foreground/15">
                <Button variant="secondary">
                  Continue Research thread
                  <ArrowRightIcon data-icon="inline-end" />
                </Button>
              </CardFooter>
            </Card>

            <Card className="[--card-spacing:--spacing(6)]">
              <CardHeader>
                <Badge variant="secondary">Alongside it</Badge>
                <CardTitle className="font-serif text-2xl">
                  Continue the Source
                </CardTitle>
                <CardDescription className="leading-6">
                  Attention and memory in self-directed study, page 18. Your
                  question is parked beside the passage.
                </CardDescription>
              </CardHeader>
              <CardFooter>
                <Button variant="outline">
                  <BookMarkedIcon data-icon="inline-start" />
                  Return to page 18
                </Button>
              </CardFooter>
            </Card>
          </section>

          <section className="flex flex-col gap-4">
            <div className="flex items-end gap-4">
              <div className="flex flex-col gap-1">
                <h2 className="font-serif text-2xl">Other meaningful steps</h2>
                <p className="text-muted-foreground text-sm">
                  Quiet choices connected to work already in motion.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Card size="sm">
                <CardHeader>
                  <Badge variant="outline">Draft review</Badge>
                  <CardTitle className="font-serif text-lg">
                    Resumption cues should preserve intent
                  </CardTitle>
                  <CardDescription>
                    Proposed revision grounded in 2 Citations.
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button variant="outline" size="sm">
                    Review Draft
                  </Button>
                </CardFooter>
              </Card>

              <Card size="sm">
                <CardHeader>
                  <Badge variant="secondary">Learning path</Badge>
                  <CardTitle className="font-serif text-lg">
                    Reliable event-driven workers
                  </CardTitle>
                  <CardDescription>
                    Return to the question your last answer exposed.
                  </CardDescription>
                </CardHeader>
                <CardFooter>
                  <Button variant="outline" size="sm">
                    Continue Lesson
                  </Button>
                </CardFooter>
              </Card>

              <Card size="sm" className="border-l-2 border-l-destructive/60">
                <CardHeader>
                  <Badge variant="destructive">1 exception</Badge>
                  <CardTitle className="font-serif text-lg">
                    Owned note revisions diverged
                  </CardTitle>
                  <CardDescription>
                    No work was discarded. Resolve when ready.
                  </CardDescription>
                  <CardAction>
                    <AlertCircleIcon
                      className="size-4 text-destructive"
                      aria-hidden="true"
                    />
                  </CardAction>
                </CardHeader>
                <CardFooter>
                  <Button variant="outline" size="sm">
                    Inspect
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </section>

          <Separator />
          <p className="max-w-2xl text-muted-foreground text-xs leading-5">
            Lirna selects this continuation from explicit durable return state.
            It does not infer your attention or optimize for engagement.
          </p>
        </div>
      </div>

      <nav
        aria-label="Mobile workspace"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-background lg:hidden"
      >
        {mobileNavigation.map(({ label, icon: Icon, active }) => (
          <Button
            key={label}
            type="button"
            variant="ghost"
            aria-current={active ? "page" : undefined}
            className="flex h-16 flex-col items-center justify-center gap-1 font-medium text-[0.65rem] text-muted-foreground aria-[current=page]:text-primary"
          >
            <Icon aria-hidden="true" />
            {label}
          </Button>
        ))}
      </nav>
    </main>
  );
}
