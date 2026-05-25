import { z } from "zod";

export const agentActionSchema = z.object({
  type: z.enum([
    "open_url",
    "ask_user",
    "select_option",
    "fill_field",
    "click_button",
    "done",
  ]),
  url: z.string().nullable(),
  question: z.string().nullable(),
  suggestions: z.array(z.string()).nullable(),
  groupLabel: z.string().nullable(),
  optionLabel: z.string().nullable(),
  fieldLabel: z.string().nullable(),
  value: z.string().nullable(),
  buttonLabel: z.string().nullable(),
  reason: z.string().nullable(),
  thought: z.string().nullable(),
});

export type AgentActionRaw = z.infer<typeof agentActionSchema>;

export type AgentAction =
  | { type: "open_url"; url: string; thought?: string }
  | { type: "ask_user"; question: string; suggestions?: string[]; thought?: string }
  | { type: "select_option"; groupLabel: string; optionLabel: string; thought?: string }
  | { type: "fill_field"; fieldLabel: string; value: string; thought?: string }
  | { type: "click_button"; buttonLabel: string; thought?: string }
  | { type: "done"; reason: string; thought?: string };

export function normalizeAgentAction(raw: AgentActionRaw): AgentAction | null {
  const thought = raw.thought?.trim();

  switch (raw.type) {
    case "open_url":
      if (!raw.url || !raw.url.trim()) return null;
      return { type: "open_url", url: raw.url.trim(), thought };
    case "ask_user":
      if (!raw.question || !raw.question.trim()) return null;
      return {
        type: "ask_user",
        question: raw.question.trim(),
        suggestions: raw.suggestions?.filter((s) => s && s.trim()),
        thought,
      };
    case "select_option":
      if (!raw.groupLabel || !raw.optionLabel) return null;
      return {
        type: "select_option",
        groupLabel: raw.groupLabel.trim(),
        optionLabel: raw.optionLabel.trim(),
        thought,
      };
    case "fill_field":
      if (!raw.fieldLabel || raw.value === undefined || raw.value === null) return null;
      return {
        type: "fill_field",
        fieldLabel: raw.fieldLabel.trim(),
        value: raw.value,
        thought,
      };
    case "click_button":
      if (!raw.buttonLabel || !raw.buttonLabel.trim()) return null;
      return {
        type: "click_button",
        buttonLabel: raw.buttonLabel.trim(),
        thought,
      };
    case "done":
      return { type: "done", reason: (raw.reason || "").trim() || "Stopped.", thought };
    default:
      return null;
  }
}
