import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

type ChatModel = ReturnType<ReturnType<typeof createOpenAICompatible>["chatModel"]>;

let cachedModel: ChatModel | null = null;
let cachedSource: "openai" | "local" | null = null;

function buildModel(): { model: ChatModel; source: "openai" | "local" } {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (openaiKey) {
    const provider = createOpenAICompatible({
      name: "openai",
      baseURL: process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1",
      apiKey: openaiKey,
      supportsStructuredOutputs: true,
    });
    const modelId = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
    return { model: provider.chatModel(modelId), source: "openai" };
  }

  const provider = createOpenAICompatible({
    name: "local",
    baseURL: process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:1234/v1",
    apiKey: process.env.LOCAL_LLM_API_KEY || "local",
    supportsStructuredOutputs: true,
  });
  const modelId = process.env.LOCAL_LLM_MODEL || "local-model";
  return { model: provider.chatModel(modelId), source: "local" };
}

export function getModel(): ChatModel {
  if (!cachedModel) {
    const built = buildModel();
    cachedModel = built.model;
    cachedSource = built.source;
  }
  return cachedModel;
}

export function getModelSource(): "openai" | "local" {
  if (!cachedSource) {
    getModel();
  }
  return cachedSource as "openai" | "local";
}
