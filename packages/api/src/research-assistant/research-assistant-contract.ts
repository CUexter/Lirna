export const researchAssistantModelIds = [
  "moonshotai/kimi-k3",
  "z-ai/glm-5.3-flash",
] as const;

export type ResearchAssistantModel = (typeof researchAssistantModelIds)[number];

export const defaultResearchAssistantModel: ResearchAssistantModel =
  "moonshotai/kimi-k3";

export const researchAssistantModelLabels: Record<
  ResearchAssistantModel,
  string
> = {
  "moonshotai/kimi-k3": "Kimi K3",
  "z-ai/glm-5.3-flash": "GLM 5.3 Flash",
};
