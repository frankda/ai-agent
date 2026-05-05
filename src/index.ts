import readline from "node:readline";
import { decideNextAction, type HistoryEntry } from "./agent.js";
import { executeAction, isCheckoutLikePage } from "./agentTools.js";
import { readPage } from "./pageReader.js";
import { getExistingPage } from "./browser.js";
import { getState, formatState, resetState } from "./sessionState.js";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

const history: HistoryEntry[] = [];
const MAX_STEPS_PER_TURN = 8;

function pushHistory(role: HistoryEntry["role"], content: string): void {
  history.push({ role, content });
  if (history.length > 60) {
    history.splice(0, history.length - 60);
  }
}

function isMetaCommand(input: string): boolean {
  const lower = input.trim().toLowerCase();
  return (
    lower === "exit" ||
    lower === "quit" ||
    lower === "show state" ||
    lower === "memory" ||
    lower === "session" ||
    lower === "reset state" ||
    lower === "clear state" ||
    lower === "debug snapshot"
  );
}

async function handleMetaCommand(input: string): Promise<boolean> {
  const lower = input.trim().toLowerCase();
  if (lower === "exit" || lower === "quit") {
    console.log("👋 bye");
    process.exit(0);
  }
  if (lower === "show state" || lower === "memory" || lower === "session") {
    console.log(formatState());
    return true;
  }
  if (lower === "reset state" || lower === "clear state") {
    resetState();
    history.length = 0;
    console.log("🧹 state and history cleared");
    return true;
  }
  if (lower === "debug snapshot") {
    const page = getExistingPage();
    const snapshot = await readPage(page);
    const { summarizeSnapshot } = await import("./pageReader.js");
    console.log(summarizeSnapshot(snapshot));
    return true;
  }
  return false;
}

async function runAgentTurn(userMessage: string): Promise<void> {
  pushHistory("user", userMessage);
  let lastUserMessage: string = userMessage;

  for (let step = 0; step < MAX_STEPS_PER_TURN; step++) {
    const page = getExistingPage();
    const snapshot = await readPage(page);
    const state = getState();

    if (snapshot.url && isCheckoutLikePage(snapshot)) {
      const msg = `🛑 Reached checkout-like page (${snapshot.title || snapshot.url}). Stopping here as planned.`;
      console.log(msg);
      pushHistory("agent", msg);
      return;
    }

    const action = await decideNextAction(history, snapshot, state);

    if (action.thought) {
      console.log(`💭 ${action.thought}`);
    }

    const outcome = await executeAction(action, snapshot, lastUserMessage);
    console.log(outcome.message);

    const historyTag = action.type === "ask_user" ? "agent" : "tool";
    pushHistory(historyTag, `${action.type}: ${outcome.message}`);

    if (outcome.awaitsUser) {
      return;
    }

    if (action.type === "open_url" || action.type === "click_button") {
      lastUserMessage = "";
    }

    if (!outcome.ok) {
      // Let next step try a recovery (LLM will see the failure in history)
      continue;
    }
  }

  console.log("⚠️ Reached step limit for this turn. Tell me what to do next.");
}

function prompt(): void {
  rl.question("\nYou> ", async (answer: string) => {
    try {
      const trimmed = answer.trim();
      if (!trimmed) {
        prompt();
        return;
      }

      if (isMetaCommand(trimmed)) {
        await handleMetaCommand(trimmed);
      } else {
        await runAgentTurn(trimmed);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("❌ Error:", message);
    }

    prompt();
  });
}

console.log("✅ Vodafone Sales Assistant (agent loop)");
console.log("Try: I want to buy an iPhone 17 Pro Max");
console.log("Meta commands: show state | reset state | debug snapshot | exit");

prompt();
