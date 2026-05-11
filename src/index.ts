import { decideNextAction, type HistoryEntry } from "./agent.js";
import { executeAction, isCheckoutLikePage } from "./agentTools.js";
import { readPage } from "./pageReader.js";
import { getExistingPage } from "./browser.js";
import { getState, formatState, resetState } from "./sessionState.js";
import { TextInputProvider } from "./io/textProvider.js";
import { VoiceInputProvider } from "./io/voiceProvider.js";
import type { InputProvider } from "./types/inputProvider.js";

const useVoice = process.argv.includes("--voice");
const io: InputProvider = useVoice
  ? new VoiceInputProvider()
  : new TextInputProvider();

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
    await io.speakToUser("👋 bye");
    io.close();
    process.exit(0);
  }
  if (lower === "show state" || lower === "memory" || lower === "session") {
    await io.sendOutput(formatState());
    return true;
  }
  if (lower === "reset state" || lower === "clear state") {
    resetState();
    history.length = 0;
    await io.sendOutput("🧹 state and history cleared");
    return true;
  }
  if (lower === "debug snapshot") {
    const page = getExistingPage();
    const snapshot = await readPage(page);
    const { summarizeSnapshot } = await import("./pageReader.js");
    await io.sendOutput(summarizeSnapshot(snapshot));
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
      await io.speakToUser(msg);
      pushHistory("agent", msg);
      return;
    }

    const action = await decideNextAction(history, snapshot, state);

    if (action.thought) {
      await io.sendOutput(`💭 ${action.thought}`);
    }

    const outcome = await executeAction(action, snapshot, lastUserMessage);

    if (action.type === "ask_user" || action.type === "done") {
      await io.speakToUser(outcome.message);
    } else {
      await io.sendOutput(outcome.message);
    }

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

  await io.sendOutput("⚠️ Reached step limit for this turn. Tell me what to do next.");
}

async function main(): Promise<void> {
  await io.sendOutput("✅ Vodafone Sales Assistant (agent loop)");
  await io.sendOutput("Try: I want to buy an iPhone 17 Pro Max");
  await io.sendOutput("Meta commands: show state | reset state | debug snapshot | exit");

  while (true) {
    const answer = await io.getInput();
    const trimmed = answer.trim();
    if (!trimmed) continue;

    try {
      if (isMetaCommand(trimmed)) {
        await handleMetaCommand(trimmed);
      } else {
        await runAgentTurn(trimmed);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await io.sendError(`❌ Error: ${message}`);
    }
  }
}

main();
