import { z } from "zod";

export const commandTypeSchema = z.enum([
  "open_website",
  "get_title",
  "get_url",
  "close_browser",
  "inspect_page",
  "list_buttons",
  "list_links",
  "list_inputs",
  "click_text",
  "confirm_click_text",
  "fill_input",
  "show_state",
  "reset_state",
  "select_model",
  "select_color",
  "select_storage",
  "add_sim",
  "select_contract",
  "exit",
  "unknown",
]);

export const commandSchema = z.object({
  type: commandTypeSchema,
  target: z.string().nullable(),
  value: z.string().nullable(),
});

export type CommandType = z.infer<typeof commandTypeSchema>;

export type Command =
  | { type: "open_website"; target: string }
  | { type: "click_text"; target: string }
  | { type: "confirm_click_text"; target: string }
  | { type: "fill_input"; target: string; value: string }
  | { type: "select_model"; target: string }
  | { type: "select_color"; target: string }
  | { type: "select_storage"; target: string }
  | { type: "add_sim"; target: string }
  | { type: "select_contract"; target: string }
  | { type: "get_title" }
  | { type: "get_url" }
  | { type: "close_browser" }
  | { type: "inspect_page" }
  | { type: "list_buttons" }
  | { type: "list_links" }
  | { type: "list_inputs" }
  | { type: "show_state" }
  | { type: "reset_state" }
  | { type: "exit" }
  | { type: "unknown" };
