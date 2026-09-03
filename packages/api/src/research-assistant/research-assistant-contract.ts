export const researchAssistantModelIds = [
  "moonshotai/kimi-k3",
  "deepseek/deepseek-v4-flash-0731",
  "z-ai/glm-5.3-flash",
] as const;

export type ResearchAssistantModel = (typeof researchAssistantModelIds)[number];

export const defaultResearchAssistantModel: ResearchAssistantModel =
  "z-ai/glm-5.3-flash";

export const researchAssistantModelLabels: Record<
  ResearchAssistantModel,
  string
> = {
  "moonshotai/kimi-k3": "Kimi K3",
  "deepseek/deepseek-v4-flash-0731": "DeepSeek V4 Flash 0731",
  "z-ai/glm-5.3-flash": "GLM 5.3 Flash",
};

export function snapshotDerivativeId(sourceStateId: string) {
  return `${sourceStateId}:snapshot`;
}
