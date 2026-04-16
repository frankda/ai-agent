/**
 * aiParser.js
 * -----------
 * AI SDK 6 style:
 * - generateText(...)
 * - output: Output.object({ schema })
 *
 * This returns a structured command object for your CLI browser assistant.
 */

const { generateText, Output } = require("ai");
const { createOpenAICompatible } = require("@ai-sdk/openai-compatible");
const { z } = require("zod");

const commandSchema = z.object({
  type: z.enum([
    "open_website",
    "get_title",
    "get_url",
    "close_browser",
    "exit",
    "unknown",
  ]),
  target: z.string().optional(),
});

const localProvider = createOpenAICompatible({
  name: "local",
  baseURL: process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:1234/v1",
  apiKey: process.env.LOCAL_LLM_API_KEY || "local",
  supportsStructuredOutputs: true,
});

function parseSimpleCommands(message) {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "exit") return { type: "exit" };
  if (lower === "title") return { type: "get_title" };
  if (lower === "url") return { type: "get_url" };
  if (lower === "close browser") return { type: "close_browser" };

  return null;
}

function normalizeCommand(obj) {
  if (!obj || typeof obj !== "object") {
    return { type: "unknown" };
  }

  const allowedTypes = new Set([
    "open_website",
    "get_title",
    "get_url",
    "close_browser",
    "exit",
    "unknown",
  ]);

  if (!obj.type || !allowedTypes.has(obj.type)) {
    return { type: "unknown" };
  }

  if (obj.type === "open_website") {
    if (!obj.target || typeof obj.target !== "string" || !obj.target.trim()) {
      return { type: "unknown" };
    }

    return {
      type: "open_website",
      target: obj.target.trim(),
    };
  }

  return { type: obj.type };
}

async function parseCommandWithAI(message) {
  // deterministic shortcuts first
  const simple = parseSimpleCommands(message);
  if (simple) return simple;

  try {
    const result = await generateText({
      model: localProvider.chatModel(
        process.env.LOCAL_LLM_MODEL || "local-model"
      ),
      temperature: 0,
      output: Output.object({
        schema: commandSchema,
        name: "browser_command",
        description: "A CLI browser command for a simple assistant",
      }),
      system: `
You are a command parser for a tiny CLI browser assistant.

Map the user's message to exactly one command object.

Rules:
- If the user wants to open, visit, go to, navigate to, or launch a website,
  return type="open_website" and include the site/domain in "target".
- If the user asks for the page title, return type="get_title".
- If the user asks for the current URL, return type="get_url".
- If the user asks to close the browser, return type="close_browser".
- If the user asks to quit, return type="exit".
- If unsure, return type="unknown".
      `.trim(),
      prompt: message,
    });

    console.log("DEBUG structured output:", result.output);

    return normalizeCommand(result.output);
  } catch (err) {
    console.error("AI parser error:", err.message);
    return { type: "unknown" };
  }
}

module.exports = {
  parseCommandWithAI,
};