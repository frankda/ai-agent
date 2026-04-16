/**
 * aiParser.js
 * -----------
 * AI SDK 6 style structured command parser.
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
    "inspect_page",
    "list_buttons",
    "list_links",
    "click_text",
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

  if (
    lower === "inspect page" ||
    lower === "what page is this" ||
    lower === "page info"
  ) {
    return { type: "inspect_page" };
  }

  if (lower === "list buttons") {
    return { type: "list_buttons" };
  }

  if (lower === "list links") {
    return { type: "list_links" };
  }

  if (lower.startsWith("click ")) {
    const target = trimmed.slice(6).trim();
    return target ? { type: "click_text", target } : { type: "unknown" };
  }

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
    "inspect_page",
    "list_buttons",
    "list_links",
    "click_text",
    "exit",
    "unknown",
  ]);

  if (!obj.type || !allowedTypes.has(obj.type)) {
    return { type: "unknown" };
  }

  if (obj.type === "open_website" || obj.type === "click_text") {
    if (!obj.target || typeof obj.target !== "string" || !obj.target.trim()) {
      return { type: "unknown" };
    }

    return {
      type: obj.type,
      target: obj.target.trim(),
    };
  }

  return { type: obj.type };
}

async function parseCommandWithAI(message) {
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

Supported commands:

1. open_website
- If the user wants to open, visit, go to, launch, or navigate to a website
- Include the site/domain in "target"

2. get_title
- If the user asks for the current page title

3. get_url
- If the user asks for the current page URL

4. close_browser
- If the user wants to close the browser

5. inspect_page
- If the user asks what page this is
- If the user asks for page info or to inspect the page

6. list_buttons
- If the user asks to list visible buttons on the page

7. list_links
- If the user asks to list visible links on the page

8. click_text
- If the user wants to click a button or link by visible text
- Put the visible label into "target"
- Examples:
  - "click Gmail"
  - "click Images"
  - "click Sign in"

9. exit
- If the user wants to quit the CLI

10. unknown
- If none of the above apply

Rules:
- If user mentions a website/domain, prefer "open_website"
- Only include "target" for "open_website" and "click_text"
- Do not invent websites
- Do not invent button/link labels
- If unsure, return "unknown"
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
