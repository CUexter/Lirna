import { env } from "@lirna/env/web";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@lirna/ui/components/card";

import type { ReadingData } from "./content";
import { Diagnostic } from "./content";

export function ReadingCaptureStatus({
  capture,
}: {
  capture: ReadingData["capture"];
}) {
  if (
    !env.VITE_SHOW_DIAGNOSTICS ||
    (capture.readingReadiness !== "degraded" &&
      capture.diagnostics.length === 0)
  ) {
    return null;
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-serif text-xl">
          Capture and rendering status
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        <p>
          Bundle capture is {capture.completeness}; Reading is{" "}
          {capture.readingReadiness}.
        </p>
        {capture.readinessReasons.map((reason) => (
          <p key={reason}>{reason}</p>
        ))}
        {capture.diagnostics.map((diagnostic) => (
          <Diagnostic
            key={`${diagnostic.code}:${diagnostic.source.locator}`}
            diagnostic={diagnostic}
          />
        ))}
      </CardContent>
    </Card>
  );
}
