import type { WorkflowDefinition } from "../../server/workflows/workflow-definition.js";

export const syntheticResumeWorkflow: WorkflowDefinition = {
  workflowId: "synthetic-resume",
  version: 1,
  steps: [
    {
      kind: "work",
      stepId: "gather",
      artifactShape: { type: "object", requiredKeys: ["summary"] },
      requiredReferences: [],
      budget: { leaseSeconds: 2, maxAttempts: 3 },
    },
    {
      kind: "work",
      stepId: "refine",
      artifactShape: { type: "object", requiredKeys: ["summary"] },
      requiredReferences: [{ kind: "derivative", min: 1 }],
      budget: { leaseSeconds: 2, maxAttempts: 3 },
    },
    {
      kind: "human-gate",
      stepId: "approve",
      prompt: "Approve the refined result?",
      decisionShape: { type: "object", requiredKeys: ["outcome", "note"] },
      budget: { leaseSeconds: 60, maxAttempts: 1 },
    },
    {
      kind: "work",
      stepId: "publish",
      artifactShape: { type: "object", requiredKeys: ["summary"] },
      requiredReferences: [{ kind: "derivative", min: 1 }],
      budget: { leaseSeconds: 2, maxAttempts: 3 },
    },
  ],
};
