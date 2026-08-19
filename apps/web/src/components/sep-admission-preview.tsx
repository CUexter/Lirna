import { Badge } from "@lirna/ui/components/badge";
import { Button } from "@lirna/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";
import type { InquiryOutputs } from "@/clients/inquiry";
import { Clock3Icon, Trash2Icon } from "lucide-react";
import { SepAdmissionDecision } from "./sep-admission-decision";
import { SepCaptureDetails } from "./sep-capture-details";

export type SepAdmissionPreviewData = InquiryOutputs["sepAdmission"]["get"];

export interface SepAdmissionPreviewProps {
  preview: SepAdmissionPreviewData;
  lifecycle: {
    extendPending: boolean;
    deletePending: boolean;
    retryPending: boolean;
    error?: string;
    onExtend: () => void;
    onDelete: () => void;
    onRetry: () => void;
  };
  admission: {
    pending: boolean;
    result?: InquiryOutputs["sepAdmission"]["admit"];
    error?: string;
    onAdmit: (
      observationKeys: SepAdmissionPreviewData["observations"][number]["key"][],
    ) => void;
  };
}

const numberFormat = new Intl.NumberFormat();
const byteFormat = new Intl.NumberFormat(undefined, {
  style: "unit",
  unit: "byte",
  unitDisplay: "short",
  maximumFractionDigits: 0,
});

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function DetailList({
  details,
}: {
  details: Array<{ label: string; value: string }>;
}) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {details.map(({ label, value }) => (
        <div className="min-w-0" key={label}>
          <dt className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
            {label}
          </dt>
          <dd className="mt-1 break-words text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SepAdmissionPreview({
  preview,
  lifecycle,
  admission,
}: SepAdmissionPreviewProps) {
  const actionsDisabled =
    lifecycle.extendPending ||
    lifecycle.deletePending ||
    lifecycle.retryPending ||
    admission.pending;

  return (
    <section aria-labelledby="preview-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Admission preview</Badge>
          <Badge variant="outline">Temporary evidence</Badge>
        </div>
        <h2
          className="font-serif text-3xl leading-tight tracking-tight"
          id="preview-title"
        >
          {preview.title}
        </h2>
        <p className="break-all text-muted-foreground text-sm">
          {preview.submittedUrl}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-serif text-xl">Identity</CardTitle>
            <CardDescription>
              Publication details extracted from the retained SEP responses.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DetailList
              details={[
                { label: "Authors", value: preview.authors.join(", ") },
                { label: "Publisher", value: preview.publisher },
                {
                  label: "Publication history",
                  value: preview.publicationHistory.join("; "),
                },
                {
                  label: "Recommended archive",
                  value: preview.recommendedArchiveUrl ?? "Not identified",
                },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="font-serif text-xl">
              Policy and cost
            </CardTitle>
            <CardDescription>
              Handling policy and local work before Source admission.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{preview.policy.rightsBasis}</Badge>
              <Badge variant="outline">{preview.policy.sensitivityLevel}</Badge>
            </div>
            <DetailList
              details={[
                {
                  label: "Requests",
                  value: numberFormat.format(preview.metrics.requests),
                },
                {
                  label: "Downloaded",
                  value: byteFormat.format(preview.metrics.downloadedBytes),
                },
                {
                  label: "Retained",
                  value: byteFormat.format(preview.metrics.retainedBytes),
                },
                {
                  label: "Local processing",
                  value: `${numberFormat.format(preview.metrics.processingMilliseconds)} ms`,
                },
              ]}
            />
          </CardContent>
        </Card>
      </div>

      <SepCaptureDetails
        actionsDisabled={actionsDisabled}
        onRetry={lifecycle.onRetry}
        preview={preview}
        retryPending={lifecycle.retryPending}
      />

      <SepAdmissionDecision
        error={admission.error}
        key={`${preview.id}:${preview.capture.budget}`}
        onAdmit={admission.onAdmit}
        pending={admission.pending}
        preview={preview}
        result={admission.result}
      />

      <Card>
        <CardHeader>
          <CardTitle className="font-serif text-xl">Diagnostics</CardTitle>
          <CardDescription>
            Visible capture observations to review before admission.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {preview.diagnostics.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {preview.diagnostics.map((diagnostic) => (
                <li className="flex items-start gap-2" key={diagnostic.code}>
                  <Badge
                    variant={
                      diagnostic.level === "warning"
                        ? "destructive"
                        : "secondary"
                    }
                  >
                    {diagnostic.level}
                  </Badge>
                  <span className="text-sm">{diagnostic.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">
              No capture warnings were reported.
            </p>
          )}
        </CardContent>
        <CardFooter className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <p className="mr-auto text-muted-foreground text-xs">
            Expires {formatDate(preview.expiresAt)}
          </p>
          <Button
            disabled={actionsDisabled}
            onClick={lifecycle.onExtend}
            variant="outline"
          >
            <Clock3Icon data-icon="inline-start" />
            {lifecycle.extendPending ? "Extending…" : "Extend seven days"}
          </Button>
          <Button
            disabled={actionsDisabled}
            onClick={lifecycle.onDelete}
            variant="destructive"
          >
            <Trash2Icon data-icon="inline-start" />
            {lifecycle.deletePending ? "Deleting…" : "Delete preview"}
          </Button>
        </CardFooter>
      </Card>

      {lifecycle.error ? (
        <p className="text-destructive text-sm" role="alert">
          {lifecycle.error}
        </p>
      ) : null}
    </section>
  );
}
