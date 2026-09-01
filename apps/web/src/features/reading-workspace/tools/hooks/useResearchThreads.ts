import { useEffect, useState } from "react";

import {
  listResearchThreads,
  loadResearchThread,
  type ResearchThread,
  type ResearchThreadSummary,
} from "../researchAssistantTransport";

interface ResearchThreadScope {
  sourceId: string;
  stateId: string;
}

export function useResearchThreads({
  disabled,
  open,
  preferNew,
  scope,
}: {
  disabled: boolean;
  open: boolean;
  preferNew: boolean;
  scope: ResearchThreadScope;
}) {
  const [threads, setThreads] = useState<ResearchThreadSummary[]>([]);
  const [activeThread, setActiveThread] = useState<ResearchThread>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const { sourceId, stateId } = scope;

  useEffect(() => {
    if (!open || disabled) return;
    let current = true;
    setLoading(true);
    setError(undefined);
    setActiveThread(undefined);
    void listResearchThreads({ sourceId, stateId })
      .then(async (listed) => {
        if (!current) return;
        setThreads(listed);
        const latest = preferNew ? undefined : listed[0];
        if (!latest) return;
        const loaded = await loadResearchThread({
          sourceId,
          stateId,
          threadId: latest.id,
        });
        if (current) setActiveThread(loaded);
      })
      .catch((reason: unknown) => {
        if (current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Research threads could not be loaded",
          );
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [disabled, open, preferNew, sourceId, stateId]);

  async function resume(threadId: string) {
    setLoading(true);
    setError(undefined);
    try {
      setActiveThread(await loadResearchThread({ ...scope, threadId }));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Research thread could not be resumed",
      );
    } finally {
      setLoading(false);
    }
  }

  async function threadCreated(threadId: string) {
    try {
      const [listed, created] = await Promise.all([
        listResearchThreads(scope),
        loadResearchThread({ ...scope, threadId }),
      ]);
      setThreads(listed);
      setActiveThread(created);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Research thread could not be refreshed",
      );
    }
  }

  return {
    activeThread,
    error,
    loading,
    resume,
    startNew: () => setActiveThread(undefined),
    threadCreated,
    threads,
  };
}
