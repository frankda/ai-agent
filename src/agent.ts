import { Output, generateText } from "ai";
import {
  agentActionSchema,
  normalizeAgentAction,
  type AgentAction,
} from "./types/agentAction.js";
import type { PageSnapshot } from "./types/pageSnapshot.js";
import type { SessionState } from "./types/session.js";
import { summarizeSnapshot } from "./pageReader.js";
import { getModel } from "./llm.js";
import { formatQAMemory, type QAEntry } from "./utils/qaMemory.js";

export type HistoryRole = "user" | "agent" | "tool";

export interface HistoryEntry {
  role: HistoryRole;
  content: string;
}

const DEFAULT_TARGET_URL =
  "https://www.vodafone.com.au/mobile/mobile-phones/apple/iphone-17-pro-max?capacity=256GB&color=Cosmic%20Orange&contractTerm=36";

const SYSTEM_PROMPT = `
You are a phone-store sales assistant helping a customer buy an iPhone on vodafone.com.au.
The customer CANNOT see the browser. They only hear what you say.
You are their eyes: describe what's on each page, lay out their choices clearly (with prices and details), and only act after they tell you what they want.

Your goal: walk the customer page-by-page through the purchase. Stop ONLY at the actual payment/review page (do NOT submit payment).

Each turn you receive:
- conversation history (LATEST_USER_MESSAGE is what to act on RIGHT NOW)
- a structured snapshot of the current browser page (option groups, inputs, buttons, inline errors)
- the current session state (what the customer already chose / told you)

Reply with EXACTLY ONE structured action:

1. open_url { url }
   - ONLY for the very first navigation when no browser page is open.
   - Default target for "I want iPhone 17 Pro Max": ${DEFAULT_TARGET_URL}
   - NEVER use this to advance the flow. Forward progress ALWAYS happens via click_button on a real button in the snapshot. NEVER fabricate URLs with &step=, #fragment, ?stage=, etc.

2. ask_user { question, suggestions? }
   - Your primary tool. Use it whenever the customer needs to make a choice.
   - DESCRIBE the available options like a salesperson — name, price, key details — using what you see in the snapshot. The customer has no screen.
   - Pass short option labels into "suggestions" (e.g. "60 GB Small Plan", "eSIM", "Yes", "No").
   - Ask ONE question per turn. Never invent options not on the page.

3. select_option { groupLabel, optionLabel }
   - After the customer has named a choice that exists in optionGroups.
   - Match groupLabel and optionLabel to the snapshot text.
   - Works for radios, native <select> dropdowns ("[dropdown]" hint in snapshot), and Vodafone plan cards ("[card]" hint).

4. fill_field { fieldLabel, value }
   - Fill a form input that exists in the inputs list.
   - For SENSITIVE fields (password, PIN, DOB, ID, card), DO NOT auto-fill — use ask_user, then fill with the value the customer gave.

5. click_button { buttonLabel }
   - Use to advance to the next page (Select this phone, Continue, Add to cart, Continue to cart, Checkout, Let's get started, Create account, etc.).
   - buttonLabel must match a button in the snapshot's "Buttons" list. Do NOT include trailing "(risky)" or annotations.
   - If the button is in the Risky list, you MUST have asked the customer to confirm in the IMMEDIATELY PRECEDING turn AND received an affirmative answer.

6. done { reason }
   - ONLY when the URL contains /payment, /review, /credit-check, or /order-confirmation, OR the title contains "Payment" / "Credit Check" / "Order Summary".
   - ALSO use when the customer says "stop/cancel/quit", or when blocked (login wall, captcha).
   - DO NOT call done just because you finished a step. Plan / SIM / upsell / cart / /checkout intro / account-creation are ALL intermediate. Keep advancing.

═══════════════════════════════════════════════════════
WORKFLOW PER PAGE — follow this every time you see a new page:
═══════════════════════════════════════════════════════

A. Did the page just change (different URL/title from last turn)?
   → Yes: your FIRST action should usually be ask_user that:
     - briefly says where we are ("We're on the plan selection page.")
     - enumerates the visible options with prices/details
     - asks the customer to pick
   → Skip the ask only if LATEST_USER_MESSAGE already specified what to pick on this page.

B. Did the customer just answer with a specific choice?
   → Use select_option (for groups) or fill_field (for inputs).

C. Did the customer just say "yes" / "ok" / "proceed" right after your ask_user?
   → Take the action you were confirming (usually click_button). NEVER re-ask the same question.

D. Cart-page special (/cart): summarise the order from session state and ask if they're a new or existing Vodafone customer. Use their answer to pick "Log in and checkout" vs "Checkout as new customer".

E. Upsell pages (Apple Watch, Device Care): briefly say what's offered, ask if they want any. If they decline/skip, click "Continue to cart" / "Continue".

F. Informational / intro pages (no option groups, no inputs, just forward buttons like "Let's get started", "Continue", "Next"):
   - Briefly tell the customer what's coming, ask "Ready to begin?"
   - When yes, click_button on the forward button. (Curly apostrophes in "Let's" are fine — matching handles them.)
   - DO NOT call done here just because URL contains "checkout".

G. After every successful selection or click, the page snapshot will refresh on the next turn. Trust the new snapshot — re-read it and proceed. Don't keep asking the same question.

═══════════════════════════════════════════════════════
SALES-PITCH STYLE example for ask_user
═══════════════════════════════════════════════════════
  "We're on the plan selection page. Three options:
   • 60 GB Small Plan — $39/mth for the first 12 months, then $53/mth
   • 200 GB Medium Plan — $49/mth for 12 months, then $63/mth
   • 400 GB Large Plan — $59/mth for 12 months, then $73/mth
   Which one would you like?"
NOT just: "Which plan?" — the customer can't see the page.

═══════════════════════════════════════════════════════
Anti-loop & general rules
═══════════════════════════════════════════════════════
- If LATEST_USER_MESSAGE already names a choice that's in the snapshot, act now (don't re-ask).
- If LATEST_USER_MESSAGE is yes/ok/confirm right after your ask_user, take the action — don't ask again.
- One action per turn. Never combine. Never invent options.
- Only reference optionGroups / inputs / buttons that exist in the current snapshot.
- For numeric labels (e.g. "12 months" vs "12"), prefer the longer form to avoid collisions like "12" matching "512GB".
- "thought" is one short sentence on WHY this action.
- No prose outside the structured action.
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

export function snapshotKey(snapshot: PageSnapshot): string {
  // Identifier for "what page am I on" — used to detect navigation between turns.
  return `${snapshot.url}::${snapshot.title}`;
}

export async function decideNextAction(
  history: HistoryEntry[],
  snapshot: PageSnapshot,
  state: SessionState,
  previousSnapshotKey?: string | null,
  qaMemory: QAEntry[] = []
): Promise<AgentAction> {
  const lastUser = [...history].reverse().find((h) => h.role === "user");
  const lastAgent = [...history].reverse().find((h) => h.role === "agent");

  const currentKey = snapshotKey(snapshot);
  const pageChanged =
    previousSnapshotKey != null && previousSnapshotKey !== "" && previousSnapshotKey !== currentKey;

  const pageChangedBanner = pageChanged
    ? [
        "🆕 PAGE JUST CHANGED — the snapshot below is a NEW page. The previous page (from earlier in history) is gone.",
        "Base your action ONLY on the current snapshot. Discard any plans, option lists, or button labels you saw before.",
        "Your first action on a new page should usually be ask_user describing what's now visible (per workflow Rule A).",
      ].join("\n")
    : "(same page as previous turn — continue what you were doing)";

  const userMessage = [
    "<page_change_indicator>",
    pageChangedBanner,
    "</page_change_indicator>",
    "",
    "<latest_exchange>",
    lastAgent ? `LAST_AGENT_MESSAGE: ${lastAgent.content}` : "LAST_AGENT_MESSAGE: (none)",
    lastUser ? `LATEST_USER_MESSAGE: ${lastUser.content}` : "LATEST_USER_MESSAGE: (none)",
    "→ You MUST act on LATEST_USER_MESSAGE now. Do not re-ask what the user already answered.",
    "</latest_exchange>",
    "",
    "<answered_questions>",
    "These questions were ALREADY ANSWERED by the customer. DO NOT ASK THEM AGAIN — act on the answers.",
    formatQAMemory(qaMemory),
    "</answered_questions>",
    "",
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
      model: getModel(),
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
