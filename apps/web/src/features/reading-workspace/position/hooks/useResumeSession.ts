import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { inquiry } from "@/clients/inquiry";
import { offlineWorkingSets } from "@/features/offline-working-set/workingSets";
import type { ReadingDerivative } from "../../article/components/Content";
import type {
  ReadingNavigation,
  ReadingNavigationHandle,
} from "../../navigation/model";
import type { ReadingScrollOwner } from "../../navigation/observations";
import { historyPositionKey } from "../history";

export function useReadingResumeSession({
  active,
  component,
  navigation,
  owner,
  sourceId,
  stateId,
}: {
  active: boolean;
  component: ReadingDerivative["components"][number] | undefined;
  navigation: ReadingNavigation;
  owner: ReadingScrollOwner;
  sourceId: string;
  stateId: string;
}) {
  const { mutate } = useMutation({
    mutationFn: (
      input: Parameters<typeof offlineWorkingSets.saveProgress>[0],
    ) => offlineWorkingSets.saveProgress(input),
  });
  const resumeQuery = inquiry.sources.resume.get.queryOptions({
    input: component
      ? { sourceId, stateId, componentIdentity: component.identity }
      : {},
  });
  const { data: resume, isPending } = useQuery({
    ...resumeQuery,
    enabled: active && Boolean(component),
  });
  const [resumeIntent, setResumeIntent] = useState<{
    handle: ReadingNavigationHandle;
    key: string;
  } | null>(null);
  const componentIdentity = active ? component?.identity : undefined;
  const resumeKey = componentIdentity
    ? historyPositionKey(sourceId, stateId, componentIdentity)
    : undefined;

  useEffect(() => {
    if (!(componentIdentity && resumeKey)) return;
    const intent = {
      handle: navigation.request({
        cause: "resume",
        owner,
        target: `resume-position:${componentIdentity}`,
      }),
      key: resumeKey,
    };
    setResumeIntent(intent);
    return () => {
      intent.handle.cancel();
      setResumeIntent((current) => (current === intent ? null : current));
    };
  }, [componentIdentity, navigation, owner, resumeKey]);

  return { isPending, mutate, resume, resumeIntent };
}
