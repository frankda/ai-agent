import { Output, generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { commandSchema, type Command } from "./types/commands.js";

const localProvider = createOpenAICompatible({
  name: "local",
  baseURL: process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:1234/v1",
  apiKey: process.env.LOCAL_LLM_API_KEY || "local",
  supportsStructuredOutputs: true,
});

function normalizeText(text: string | null | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function parseSimpleCommands(message: string): Command | null {
  const trimmed = normalizeText(message);
  const lower = trimmed.toLowerCase();

  if (lower === "exit") return { type: "exit" };
  if (lower === "title") return { type: "get_title" };
  if (lower === "url") return { type: "get_url" };
  if (lower === "close browser") return { type: "close_browser" };

  if (lower === "inspect page" || lower === "what page is this" || lower === "page info") {
    return { type: "inspect_page" };
  }

  if (lower === "list buttons") return { type: "list_buttons" };
  if (lower === "list links") return { type: "list_links" };

  if (
    lower === "list inputs" ||
    lower === "inspect form" ||
    lower === "list fields" ||
    lower === "show inputs"
  ) {
    return { type: "list_inputs" };
  }

  if (lower.startsWith("click ")) {
    const target = normalizeText(trimmed.slice(6));
    return target ? { type: "click_text", target } : { type: "unknown" };
  }

  if (lower.startsWith("confirm click ")) {
    const target = normalizeText(trimmed.slice("confirm click ".length));
    return target ? { type: "confirm_click_text", target } : { type: "unknown" };
  }

  const typeIntoMatch = trimmed.match(/^type\s+(.+)\s+into\s+(.+)$/i);
  if (typeIntoMatch) {
    const value = normalizeText(typeIntoMatch[1]?.replace(/^"|"$/g, ""));
    const target = normalizeText(typeIntoMatch[2]?.replace(/^"|"$/g, ""));

    if (value && target) {
      return {
        type: "fill_input",
        target,
        value,
      };
    }

    return { type: "unknown" };
  }

  if (lower.startsWith("open ")) {
    const target = normalizeText(trimmed.slice(5));
    return target ? { type: "open_website", target } : { type: "unknown" };
  }

  return null;
}

function normalizeCommand(obj: unknown): Command {
  if (!obj || typeof obj !== "object") {
    return { type: "unknown" };
  }

  const record = obj as { type?: unknown; target?: unknown; value?: unknown };

  if (record.type === "open_website" || record.type === "click_text" || record.type === "confirm_click_text") {
    if (typeof record.target !== "string" || !normalizeText(record.target)) {
      return { type: "unknown" };
    }

    return {
      type: record.type,
      target: normalizeText(record.target),
    };
  }

  if (record.type === "fill_input") {
    if (
      typeof record.target !== "string" ||
      !normalizeText(record.target) ||
      typeof record.value !== "string" ||
      !normalizeText(record.value)
    ) {
      return { type: "unknown" };
    }

    return {
      type: "fill_input",
      target: normalizeText(record.target),
      value: normalizeText(record.value),
    };
  }

  const simpleTypes = new Set([
    "get_title",
    "get_url",
    "close_browser",
    "inspect_page",
    "list_buttons",
    "list_links",
    "list_inputs",
    "exit",
    "unknown",
  ]);

  if (typeof record.type === "string" && simpleTypes.has(record.type)) {
    return { type: record.type as Command["type"] } as Command;
  }

  return { type: "unknown" };
}

export async function parseCommandWithAI(message: string): Promise<Command> {
  const simple = parseSimpleCommands(message);
  if (simple) {
    return simple;
  }

  try {
    const result = await generateText({
      model: localProvider.chatModel(process.env.LOCAL_LLM_MODEL || "local-model"),
      temperature: 0,
      output: Output.object({
        schema: commandSchema,
        name: "browser_command",
        description: "A CLI browser command for a simple browser assistant",
      }),
      system: `
You are a command parser for a CLI browser assistant.

Your job:
- Convert the user's message into exactly one structured command object.
- Do not explain.
- Do not add extra narrative.
- Return only the structured command matching the schema.

Supported commands:

1. open_website
- Use when the user wants to open, visit, go to, launch, or navigate to a website
- Put the site/domain into "target"

2. get_title
- Use when the user asks for the current page title

3. get_url
- Use when the user asks for the current page URL

4. close_browser
- Use when the user wants to close the browser

5. inspect_page
- Use when the user asks what page this is
- Use when the user asks for page info or to inspect the current page

6. list_buttons
- Use when the user asks to list visible buttons

7. list_links
- Use when the user asks to list visible links

8. list_inputs
- Use when the user asks to list inputs, fields, form fields, or inspect the form

9. click_text
- Use when the user wants to click a visible button or link
- Put the visible label into "target"
- Example: "click Gmail"

10. confirm_click_text
- Use when the user explicitly confirms a previously requested click
- Put the same visible label into "target"
- Example: "confirm click Checkout"

11. fill_input
- Use when the user wants to type text into an input field
- Put the field name into "target"
- Put the text to enter into "value"
- Examples:
  - "type Frank Da into Name"
  - "type 0400111222 into Phone"
  - "type iPhone into Search"

12. exit
- Use when the user wants to quit the CLI

13. unknown
- Use when none of the above apply

Rules:
- Only include "target" for:
  - open_website
  - click_text
  - confirm_click_text
  - fill_input
- Only include "value" for fill_input
- Do not invent websites
- Do not invent button labels
- Do not invent input field names
- If unsure, return type="unknown"
      `.trim(),
      prompt: message,
    });

    console.log("DEBUG structured output:", result.output);

    return normalizeCommand(result.output);
  } catch (error: unknown) {
    const messageText = error instanceof Error ? error.message : String(error);
    console.error("AI parser error:", messageText);
    return { type: "unknown" };
  }
}
