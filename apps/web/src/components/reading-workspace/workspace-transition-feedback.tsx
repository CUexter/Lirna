import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@lirna/ui/components/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@lirna/ui/components/alert-dialog";
import { TriangleAlertIcon } from "lucide-react";

export interface WorkspaceTransitionFeedbackProps {
  annotationDiscard: {
    onCancel: () => void;
    onConfirm: () => void;
    open: boolean;
  };
  unavailable?: { reason: string; target: string };
}

export function WorkspaceTransitionFeedback({
  annotationDiscard,
  unavailable,
}: WorkspaceTransitionFeedbackProps) {
  return (
    <>
      {unavailable ? (
        <div className="mx-auto w-full max-w-[104rem] px-4 pt-6 sm:px-6 lg:px-10">
          <Alert variant="destructive">
            <TriangleAlertIcon aria-hidden="true" />
            <AlertTitle>Reading destination unavailable</AlertTitle>
            <AlertDescription>
              Lirna could not open {unavailable.target}. The Reading workspace
              did not change.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}
      <AlertDialog
        onOpenChange={(open) => {
          if (!open) annotationDiscard.onCancel();
        }}
        open={annotationDiscard.open}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave unsaved annotation work?</AlertDialogTitle>
            <AlertDialogDescription>
              Your annotation changes are not saved. Stay here to save them, or
              leave and keep the local unfinished work for later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Stay</AlertDialogCancel>
            <AlertDialogAction onClick={annotationDiscard.onConfirm}>
              Leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
