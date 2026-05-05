import { Output, generateText } from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import {
  agentActionSchema,
  normalizeAgentAction,
  type AgentAction,
} from "./types/agentAction.js";
import type { PageSnapshot } from "./types/pageSnapshot.js";
import type { SessionState } from "./types/session.js";
import { summarizeSnapshot } from "./pageReader.js";

const localProvider = createOpenAICompatible({
  name: "local",
  baseURL: process.env.LOCAL_LLM_BASE_URL || "http://127.0.0.1:1234/v1",
  apiKey: process.env.LOCAL_LLM_API_KEY || "local",
  supportsStructuredOutputs: true,
});

export type HistoryRole = "user" | "agent" | "tool";

export interface HistoryEntry {
  role: HistoryRole;
  content: string;
}

const DEFAULT_TARGET_URL =
  "https://www.vodafone.com.au/mobile/mobile-phones/apple/iphone-17-pro-max?capacity=256GB&color=Cosmic%20Orange&contractTerm=36";

const SYSTEM_PROMPT = `
You are a sales assistant guiding a user through a Vodafone Australia iPhone purchase in a real browser.

Your goal: progress the purchase flow page-by-page until reaching a CHECKOUT page (cart/review/payment summary). Stop there. Do NOT submit payment.

Each turn you receive:
- conversation history
- a structured snapshot of the current browser page (option groups, inputs, buttons, inline errors)
- the current session state (what the user already chose / told you)

You must reply with EXACTLY ONE structured action from this set:

1. open_url { url }
   - Use this only when no page is open yet, or when the user has not landed on the Vodafone iPhone product page.
   - Default target if user wants to buy iPhone 17 Pro Max: ${DEFAULT_TARGET_URL}

2. ask_user { question, suggestions? }
   - Use when you need information from the user.
   - Ask ONE thing per turn. Do not assume defaults.
   - Use suggestions to list options actually visible in the snapshot.
   - ALWAYS use ask_user before clicking any button labeled "risky" (isRisky=true) — confirm the action with a clear summary first.

3. select_option { groupLabel, optionLabel }
   - Use when the user has already told you what to pick AND the option appears in the current snapshot's optionGroups.
   - groupLabel and optionLabel must match the snapshot text (substring match is OK).
   - NEVER invent options that are not in the snapshot.

4. fill_field { fieldLabel, value }
   - Use to fill a form input that exists in the snapshot's inputs list.
   - Refuse if the field is marked sensitive — for sensitive fields, ask_user first.
   - Reuse known session state to avoid asking the user again.

5. click_button { buttonLabel }
   - Use to progress to the next page (e.g. "Select this phone", "Continue", "Next").
   - buttonLabel must match a button in the snapshot.
   - If isRisky, you MUST have already asked the user for explicit confirmation in the immediately previous turn.

6. done { reason }
   - Use when:
     - The current URL or title indicates a CHECKOUT/review/payment page (stop here, do not click further).
     - The flow is blocked and needs human intervention (e.g., login wall, captcha).
     - The user said to stop.

Hard rules:
- Only reference optionGroups / inputs / buttons that actually exist in the current snapshot.
- Never click a "risky" button without an immediately preceding ask_user confirmation answered "yes" by the user.
- Never proceed past a checkout/payment page.
- If snapshot.inlineErrors is non-empty, address the error before progressing (usually ask_user).
- One action per turn. Never combine.
- The "thought" field is optional and short — explain WHY you chose this action.

Do not output prose outside the structured action.
`.trim();

function formatSessionState(state: SessionState): string {
  const lines: string[] = [];
  const product: Array<[string, string | null]> = [
    ["model", state.deviceModel],
    ["color", state.color],
    ["storage", state.storage],
    ["sim", state.simChoice],
    ["contractTerm", state.contractTerm],
  ];
  const customer: Array<[string, string | null]> = [
    ["name", state.customerName],
    ["phone", state.customerPhone],
    ["email", state.customerEmail],
    ["address", state.customerAddress],
  ];

  for (const [k, v] of product) {
    if (v) lines.push(`product.${k}: ${v}`);
  }
  for (const [k, v] of customer) {
    if (v) lines.push(`customer.${k}: ${v}`);
  }
  lines.push(`journeyStep: ${state.journeyStep}`);
  if (state.currentUrl) lines.push(`currentUrl: ${state.currentUrl}`);

  return lines.length > 0 ? lines.join("\n") : "(empty)";
}

function formatHistory(history: HistoryEntry[]): string {
  const tail = history.slice(-24);
  return tail
    .map((h) => {
      const role =
        h.role === "user" ? "USER" : h.role === "agent" ? "AGENT" : "TOOL";
      return `[${role}] ${h.content}`;
    })
    .join("\n");
}

export async function decideNextAction(
  history: HistoryEntry[],
  snapshot: PageSnapshot,
  state: SessionState
): Promise<AgentAction> {
  const userMessage = [
    "<conversation>",
    formatHistory(history) || "(empty)",
    "</conversation>",
    "",
    "<page_snapshot>",
    snapshot.url ? summarizeSnapshot(snapshot) : "(no page open)",
    "</page_snapshot>",
    "",
    "<session_state>",
    formatSessionState(state),
    "</session_state>",
    "",
    "Decide the next action.",
  ].join("\n");

  try {
    const result = await generateText({
      model: localProvider.chatModel(process.env.LOCAL_LLM_MODEL || "local-model"),
      temperature: 0,
      output: Output.object({
        schema: agentActionSchema,
        name: "agent_action",
        description: "The next action the sales assistant should take.",
      }),
      system: SYSTEM_PROMPT,
      prompt: userMessage,
    });

    const normalized = normalizeAgentAction(result.output);
    if (normalized) {
      return normalized;
    }
    return {
      type: "ask_user",
      question:
        "I couldn't decide on the next step from the page. Could you tell me what to do next?",
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      type: "ask_user",
      question: `I hit an error deciding what to do (${message}). What would you like me to do next?`,
    };
  }
}

export { DEFAULT_TARGET_URL };
