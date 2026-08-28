import { Badge } from "@lirna/ui/components/badge";
import { Button, buttonVariants } from "@lirna/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import { Checkbox } from "@lirna/ui/components/checkbox";
import { Label } from "@lirna/ui/components/label";
import { Link } from "@tanstack/react-router";
import { ArrowRightIcon, DatabaseIcon } from "lucide-react";
import { useState } from "react";
import type { InquiryOutputs } from "@/clients/inquiry";
import { ServerErrorMessage } from "@/components/server-error-message";
import type { FormattedServerError } from "@/utils/server-error";

import type { SepAdmissionPreviewData } from "./preview";

type ObservationKey = SepAdmissionPreviewData["observations"][number]["key"];
type AdmissionResult = InquiryOutputs["sepAdmission"]["admit"];

interface SepAdmissionDecisionProps {
  preview: SepAdmissionPreviewData;
  pending: boolean;
  disabled: boolean;
  result?: AdmissionResult;
  error?: FormattedServerError;
  onAdmit: (observationKeys: ObservationKey[]) => void;
}

export function SepAdmissionDecision({
  preview,
  pending,
  disabled,
  result,
  error,
  onAdmit,
}: SepAdmissionDecisionProps) {
  const [selected, setSelected] = useState<ObservationKey[]>(["submitted"]);
  const [confirmed, setConfirmed] = useState(false);

  function toggle(key: ObservationKey, checked: boolean) {
    setSelected((current) =>
      checked ? [...current, key] : current.filter((item) => item !== key),
    );
    setConfirmed(false);
  }

  if (result) {
    return (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Source admitted</Badge>
            <CardTitle className="font-serif text-xl">
              Admission complete
            </CardTitle>
          </div>
          <CardDescription>
            Changed bytes create immutable states; unchanged bytes reuse the
            matching state. Captured HTML is never injected.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="font-medium">
            {result.outcomes.some(
              ({ disposition }) => disposition === "created",
            )
              ? "Immutable states created"
              : "Existing immutable states reused"}
          </p>
          <AdmissionReadingStatus result={result} />
          {result.states.map((state) => (
            <Link
              className={buttonVariants({
                className: "justify-between",
                variant: "outline",
              })}
              key={state.id}
              params={{ sourceId: result.sourceId, stateId: state.id }}
              to="/sources/$sourceId/$stateId"
            >
              <span>
                State {state.sequence + 1}:{" "}
                {observationLabel(state.observationKey)}
                {result.outcomes.find(
                  ({ observationKey }) =>
                    observationKey === state.observationKey,
                )?.disposition === "unchanged"
                  ? " (unchanged)"
                  : " (created)"}
              </span>
              <ArrowRightIcon data-icon="inline-end" />
            </Link>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <DatabaseIcon className="size-4 text-muted-foreground" />
          <CardTitle className="font-serif text-xl">
            Admission decision
          </CardTitle>
        </div>
        <CardDescription>{preview.comparison.message}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <fieldset className="flex flex-col gap-3">
          <legend className="font-medium text-sm">
            Choose the observations to preserve
          </legend>
          {preview.observations.map((observation) => {
            const checked = selected.includes(observation.key);
            const id = `observation-${observation.key}`;
            return (
              <div
                className="flex items-start gap-3 rounded-md border p-4"
                key={observation.key}
              >
                <Checkbox
                  aria-label={observation.label}
                  checked={checked}
                  disabled={disabled}
                  id={id}
                  onCheckedChange={(value) => toggle(observation.key, value)}
                />
                <Label
                  className="flex min-w-0 flex-col items-start gap-1"
                  htmlFor={id}
                >
                  <span>{observation.label}</span>
                  <span className="break-all font-normal text-muted-foreground text-xs">
                    {observation.canonicalUrl} · {observation.resources.length}{" "}
                    retained resource
                    {observation.resources.length === 1 ? "" : "s"}
                  </span>
                </Label>
              </div>
            );
          })}
        </fieldset>

        <div className="flex items-start gap-3 rounded-md bg-muted/50 p-4">
          <Checkbox
            aria-label="Create one immutable Source state for each selected observation using exactly the retained preview bytes. Admission does not fetch SEP again."
            checked={confirmed}
            disabled={disabled}
            id="confirm-admission"
            onCheckedChange={setConfirmed}
          />
          <Label className="font-normal leading-5" htmlFor="confirm-admission">
            Create one immutable Source state for each selected observation when
            its retained preview bytes differ. Unchanged bundles reuse their
            existing state. Admission does not fetch SEP again.
          </Label>
        </div>
        {selected.length === 0 ? (
          <p className="text-destructive text-sm" role="alert">
            Select at least one observation.
          </p>
        ) : null}
        {error ? <ServerErrorMessage error={error} /> : null}
      </CardContent>
      <CardFooter>
        <Button
          disabled={disabled || !confirmed || selected.length === 0}
          onClick={() => onAdmit(selected)}
        >
          <DatabaseIcon data-icon="inline-start" />
          {pending ? "Admitting Source…" : admissionLabel(selected)}
        </Button>
      </CardFooter>
    </Card>
  );
}

function AdmissionReadingStatus({ result }: { result: AdmissionResult }) {
  const unavailableReading = unavailableReadingDerivative(result);
  if (!unavailableReading) return null;
  return (
    <p
      className="border border-destructive/30 bg-destructive/10 p-3 text-destructive text-sm"
      role="alert"
    >
      Source state was admitted, but its Reading Derivative needs regeneration
      before the Reading workspace is available.
      {unavailableReading.generationError
        ? ` ${unavailableReading.generationError}`
        : ""}
    </p>
  );
}

function unavailableReadingDerivative(result: AdmissionResult) {
  const state = result.states.find(
    (candidate) =>
      candidate.derivatives.some(({ valid }) => !valid) &&
      candidate.derivatives.every(
        ({ currentActivation }) => !currentActivation,
      ),
  );
  if (!state) return undefined;
  return {
    generationError: state.derivatives.find(
      ({ generationError }) => generationError,
    )?.generationError,
  };
}

function admissionLabel(selected: ObservationKey[]) {
  if (selected.length === 2) return "Admit active and archive";
  return selected[0] === "recommended-archive"
    ? "Admit recommended archive"
    : "Admit active observation";
}

function observationLabel(key: ObservationKey) {
  return key === "submitted" ? "Active" : "Recommended archive";
}
