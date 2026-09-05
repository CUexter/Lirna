import { ORPCError } from "@orpc/client";
import { useEffect, useRef, useState } from "react";

import {
  createRelatedResearchThread,
  listResearchThreads,
  loadResearchThread,
  loadResearchThreadLineage,
  type ResearchThread,
  type ResearchThreadLineage,
  type ResearchThreadSummary,
  reviseResearchQuestion,
  reviseResearchQuestionWithHistory,
  selectResearchAnswer,
  selectResearchQuestion,
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
  const [activeThreadId, setActiveThreadId] = useState<string>();
  const [lineage, setLineage] = useState<ResearchThreadLineage>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const { sourceId, stateId } = scope;
  const requestRevisionRef = useRef(0);
  const scopeKey = `${sourceId}:${stateId}`;
  const scopeKeyRef = useRef(scopeKey);
  scopeKeyRef.current = scopeKey;

  useEffect(() => {
    if (!open || disabled) return;
    let current = true;
    const requestRevision = ++requestRevisionRef.current;
    setLoading(true);
    setError(undefined);
    setActiveThread(undefined);
    setActiveThreadId(undefined);
    setLineage(undefined);
    void listResearchThreads({ sourceId, stateId })
      .then(async (listed) => {
        if (
          !current ||
          requestRevisionRef.current !== requestRevision ||
          scopeKeyRef.current !== scopeKey
        )
          return;
        setThreads(listed);
        const latest = preferNew ? undefined : listed[0];
        if (!latest) return;
        const loaded = await loadResearchThread({
          sourceId,
          stateId,
          threadId: latest.id,
        });
        if (
          current &&
          requestRevisionRef.current === requestRevision &&
          scopeKeyRef.current === scopeKey
        ) {
          setActiveThread(loaded);
          setActiveThreadId(loaded?.id);
        }
      })
      .catch((reason: unknown) => {
        if (
          current &&
          requestRevisionRef.current === requestRevision &&
          scopeKeyRef.current === scopeKey
        )
          setError(
            reason instanceof Error
              ? reason.message
              : "Research threads could not be loaded",
          );
      })
      .finally(() => {
        if (
          current &&
          requestRevisionRef.current === requestRevision &&
          scopeKeyRef.current === scopeKey
        )
          setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [disabled, open, preferNew, scopeKey, sourceId, stateId]);

  useEffect(() => {
    if (!activeThreadId || disabled) {
      setLineage(undefined);
      return;
    }
    let current = true;
    void loadResearchThreadLineage({
      sourceId,
      stateId,
      threadId: activeThreadId,
    })
      .then((loaded) => {
        if (current) setLineage(loaded);
      })
      .catch(() => {
        if (current) setLineage(undefined);
      });
    return () => {
      current = false;
    };
  }, [activeThreadId, disabled, sourceId, stateId]);

  async function resume(threadId: string) {
    const requestScopeKey = scopeKey;
    const requestRevision = ++requestRevisionRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const loaded = await loadResearchThread({ ...scope, threadId });
      if (
        requestRevisionRef.current !== requestRevision ||
        scopeKeyRef.current !== requestScopeKey
      )
        return;
      setActiveThread(loaded);
      setActiveThreadId(loaded?.id);
    } catch (reason) {
      if (
        requestRevisionRef.current === requestRevision &&
        scopeKeyRef.current === requestScopeKey
      )
        setError(
          reason instanceof Error
            ? reason.message
            : "Research thread could not be resumed",
        );
    } finally {
      if (
        requestRevisionRef.current === requestRevision &&
        scopeKeyRef.current === requestScopeKey
      )
        setLoading(false);
    }
  }

  async function threadCreated(threadId: string) {
    const requestScopeKey = scopeKey;
    const requestRevision = ++requestRevisionRef.current;
    try {
      const listed = await listResearchThreads(scope);
      if (
        requestRevisionRef.current !== requestRevision ||
        scopeKeyRef.current !== requestScopeKey
      )
        return;
      setThreads(listed);
      setActiveThreadId(threadId);
    } catch (reason) {
      if (
        requestRevisionRef.current === requestRevision &&
        scopeKeyRef.current === requestScopeKey
      )
        setError(
          reason instanceof Error
            ? reason.message
            : "Research thread could not be refreshed",
        );
    }
  }

  async function selectAnswer(
    answerMessageId: string,
    expectedSelectedLeafMessageId: string,
  ) {
    if (!activeThreadId) return undefined;
    const requestScopeKey = scopeKey;
    const requestRevision = ++requestRevisionRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const loaded = await selectResearchAnswer({
        ...scope,
        threadId: activeThreadId,
        answerMessageId,
        expectedSelectedLeafMessageId,
      });
      if (
        requestRevisionRef.current !== requestRevision ||
        scopeKeyRef.current !== requestScopeKey
      )
        return undefined;
      setActiveThread(loaded);
      return loaded;
    } catch (reason) {
      if (
        requestRevisionRef.current === requestRevision &&
        scopeKeyRef.current === requestScopeKey
      )
        setError(
          reason instanceof Error
            ? reason.message
            : "Research answer could not be selected",
        );
      return undefined;
    } finally {
      if (
        requestRevisionRef.current === requestRevision &&
        scopeKeyRef.current === requestScopeKey
      )
        setLoading(false);
    }
  }

  async function reviseQuestion(
    questionMessageId: string,
    expectedSelectedLeafMessageId: string,
    question: string,
    attachments: Parameters<typeof reviseResearchQuestion>[0]["attachments"],
  ) {
    if (!activeThreadId) return undefined;
    return updateActiveThread(
      () =>
        reviseResearchQuestion({
          ...scope,
          threadId: activeThreadId,
          questionMessageId,
          expectedSelectedLeafMessageId,
          question,
          ...(attachments?.length ? { attachments } : {}),
        }),
      "Research question could not be revised",
    );
  }

  async function updateActiveThread(
    request: () => Promise<ResearchThread>,
    fallbackError: string,
  ) {
    const requestScopeKey = scopeKey;
    const requestRevision = ++requestRevisionRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const loaded = await request();
      if (
        requestRevisionRef.current !== requestRevision ||
        scopeKeyRef.current !== requestScopeKey
      )
        return undefined;
      setActiveThread(loaded);
      return loaded;
    } catch (reason) {
      if (
        requestRevisionRef.current === requestRevision &&
        scopeKeyRef.current === requestScopeKey
      )
        setError(reason instanceof Error ? reason.message : fallbackError);
      return undefined;
    } finally {
      if (
        requestRevisionRef.current === requestRevision &&
        scopeKeyRef.current === requestScopeKey
      )
        setLoading(false);
    }
  }

  async function selectQuestion(
    questionMessageId: string,
    expectedSelectedLeafMessageId: string,
  ) {
    if (!activeThreadId) return undefined;
    return updateActiveThread(
      () =>
        selectResearchQuestion({
          ...scope,
          threadId: activeThreadId,
          questionMessageId,
          expectedSelectedLeafMessageId,
        }),
      "Research question could not be selected",
    );
  }

  async function reviseQuestionWithHistory(
    questionMessageId: string,
    expectedSelectedLeafMessageId: string,
    question: string,
  ) {
    if (!activeThreadId) return undefined;
    return updateActiveThread(
      () =>
        reviseResearchQuestionWithHistory({
          ...scope,
          threadId: activeThreadId,
          questionMessageId,
          expectedSelectedLeafMessageId,
          question,
        }),
      "Research question history could not be revised",
    );
  }

  async function resumeSourceAnswer(threadId: string, answerMessageId: string) {
    const requestScopeKey = scopeKey;
    const requestRevision = ++requestRevisionRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const source = await loadResearchThread({ ...scope, threadId });
      const selectedLeafMessageId = source.messages.at(-1)?.id;
      if (!selectedLeafMessageId)
        throw new Error("Source Research answer is unavailable");
      const loaded = await selectResearchAnswer({
        ...scope,
        threadId,
        answerMessageId,
        expectedSelectedLeafMessageId: selectedLeafMessageId,
      });
      if (
        requestRevisionRef.current !== requestRevision ||
        scopeKeyRef.current !== requestScopeKey
      )
        return;
      setActiveThread(loaded);
      setActiveThreadId(loaded.id);
    } catch (reason) {
      if (
        requestRevisionRef.current === requestRevision &&
        scopeKeyRef.current === requestScopeKey
      )
        setError(
          reason instanceof Error
            ? reason.message
            : "Source Research answer is unavailable",
        );
    } finally {
      if (
        requestRevisionRef.current === requestRevision &&
        scopeKeyRef.current === requestScopeKey
      )
        setLoading(false);
    }
  }

  async function createRelated(input: {
    creationId: string;
    sourceAnswerMessageId: string;
    sourceThreadId: string;
    title: string;
  }) {
    const requestScopeKey = scopeKey;
    const requestRevision = ++requestRevisionRef.current;
    setLoading(true);
    setError(undefined);
    try {
      const created = await createRelatedResearchThread({ ...scope, ...input });
      const listed = await listResearchThreads(scope);
      if (
        requestRevisionRef.current !== requestRevision ||
        scopeKeyRef.current !== requestScopeKey
      )
        return { status: "indeterminate" as const };
      setThreads(listed);
      setActiveThread(created);
      setActiveThreadId(created.id);
      return { status: "created" as const, thread: created };
    } catch (reason) {
      if (
        requestRevisionRef.current === requestRevision &&
        scopeKeyRef.current === requestScopeKey
      )
        setError(
          reason instanceof Error
            ? reason.message
            : "Related Research thread could not be created",
        );
      return {
        status:
          reason instanceof ORPCError &&
          (reason.code === "NOT_FOUND" || reason.code === "CONFLICT")
            ? ("rejected" as const)
            : ("indeterminate" as const),
      };
    } finally {
      if (
        requestRevisionRef.current === requestRevision &&
        scopeKeyRef.current === requestScopeKey
      )
        setLoading(false);
    }
  }

  return {
    activeThread,
    activeThreadId,
    createRelated,
    error,
    lineage,
    loading,
    resume,
    resumeSourceAnswer,
    reviseQuestion,
    reviseQuestionWithHistory,
    selectAnswer,
    selectQuestion,
    startNew: () => {
      requestRevisionRef.current += 1;
      setLoading(false);
      setActiveThread(undefined);
      setActiveThreadId(undefined);
      setLineage(undefined);
    },
    threadCreated,
    threads,
  };
}
