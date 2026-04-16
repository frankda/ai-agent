/**
 * aiParser.js
 * -----------
 * AI SDK 6 structured command parser.
 * No commands.js needed.
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
    "confirm_click_text",
    "fill_input",
    "exit",
    "unknown",
  ]),
  target: z.string().optional(),
  value: z.string().optional(),
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

  if (lower === "list buttons") return { type: "list_buttons" };
  if (lower === "list links") return { type: "list_links" };

  if (lower.startsWith("click ")) {
    const target = trimmed.slice(6).trim();
    return target ? { type: "click_text", target } : { type: "unknown" };
  }

  if (lower.startsWith("confirm click ")) {
    const target = trimmed.slice("confirm click ".length).trim();
    return target ? { type: "confirm_click_text", target } : { type: "unknown" };
  }

  // type <value> into <field>
  const typeIntoMatch = trimmed.match(/^type\s+(.+)\s+into\s+(.+)$/i);
  if (typeIntoMatch) {
    const value = typeIntoMatch[1].trim().replace(/^"|"$/g, "");
    const target = typeIntoMatch[2].trim().replace(/^"|"$/g, "");

    if (value && target) {
      return {
        type: "fill_input",
        target,
        value,
      };
    }
  }

  if (lower.startsWith("open ")) {
    const target = trimmed.slice(5).trim();
    return target ? { type: "open_website", target } : { type: "unknown" };
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
    "confirm_click_text",
    "fill_input",
    "exit",
    "unknown",
  ]);

  if (!obj.type || !allowedTypes.has(obj.type)) {
    return { type: "unknown" };
  }

  if (
    obj.type === "open_website" ||
    obj.type === "click_text" ||
    obj.type === "confirm_click_text"
  ) {
    if (!obj.target || typeof obj.target !== "string" || !obj.target.trim()) {
      return { type: "unknown" };
    }

    return {
      type: obj.type,
      target: obj.target.trim(),
    };
  }

  if (obj.type === "fill_input") {
    if (
      !obj.target ||
      typeof obj.target !== "string" ||
      !obj.target.trim() ||
      !obj.value ||
      typeof obj.value !== "string" ||
      !obj.value.trim()
    ) {
      return { type: "unknown" };
    }

    return {
      type: "fill_input",
      target: obj.target.trim(),
      value: obj.value.trim(),
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
- Put the site/domain into "target"

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
- If the user asks to list visible buttons

7. list_links
- If the user asks to list visible links

8. click_text
- If the user wants to click a visible button or link
- Put the visible label into "target"

9. confirm_click_text
- If the user explicitly confirms a previously requested risky click
- Put the same visible label into "target"

10. fill_input
- If the user wants to type text into an input field
- Put the field name into "target"
- Put the text value into "value"
- Examples:
  - "type Frank Da into Name"
  - "type 0400111222 into Phone"
  - "type iPhone into Search"

11. exit
- If the user wants to quit the CLI

12. unknown
- If none of the above apply

Rules:
- Only include "target" for:
  - open_website
  - click_text
  - confirm_click_text
  - fill_input
- Only include "value" for fill_input
- Do not invent sites
- Do not invent button labels
- Do not invent field names
- If unsure, return unknown
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