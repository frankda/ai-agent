import { decideNextAction, snapshotKey, type HistoryEntry } from "./agent.js";
import { executeAction, isCheckoutLikePage } from "./agentTools.js";
import { readPage } from "./pageReader.js";
import { getExistingPage } from "./browser.js";
import { getState, formatState, resetState } from "./sessionState.js";
import type { QAEntry } from "./utils/qaMemory.js";
import { TextInputProvider } from "./io/textProvider.js";
import { VoiceInputProvider } from "./io/voiceProvider.js";
import type { InputProvider } from "./types/inputProvider.js";
import { getModelSource } from "./llm.js";

const useVoice = process.argv.includes("--voice");
const io: InputProvider = useVoice
  ? new VoiceInputProvider()
  : new TextInputProvider();

const history: HistoryEntry[] = [];
const MAX_STEPS_PER_TURN = 8;
// Tracks the page identifier seen on the previous LLM turn so the agent can be
// told explicitly when the page has just changed.
let lastSeenSnapshotKey: string | null = null;
// Q&A memory: every ask_user the customer responds to gets stored here so the
// agent (and the tool layer) can refuse to ask the same thing again.
const qaMemory: QAEntry[] = [];
let pendingQuestion: string | null = null;
let turnCounter = 0;

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
    lastSeenSnapshotKey = null;
    qaMemory.length = 0;
    pendingQuestion = null;
    turnCounter = 0;
    await io.sendOutput("🧹 state, history, and Q&A memory cleared");
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
  // If the agent was awaiting an answer, record the Q→A pair so it won't re-ask.
  if (pendingQuestion) {
    qaMemory.push({ question: pendingQuestion, answer: userMessage, turn: turnCounter });
    if (qaMemory.length > 20) qaMemory.shift();
    pendingQuestion = null;
  }
  turnCounter += 1;
  let lastUserMessage: string = userMessage;
  let consecutiveFailures = 0;

  for (let step = 0; step < MAX_STEPS_PER_TURN; step++) {
    const page = getExistingPage();
    const snapshot = await readPage(page);
    const state = getState();

    if (snapshot.url && isCheckoutLikePage(snapshot)) {
      const msg = `🛑 Reached payment/review page (${snapshot.title || snapshot.url}). Stopping here as planned.`;
      await io.speakToUser(msg);
      pushHistory("agent", msg);
      return;
    }

    const currentKey = snapshotKey(snapshot);
    if (lastSeenSnapshotKey && lastSeenSnapshotKey !== currentKey) {
      await io.sendOutput(`🔄 Page changed → ${snapshot.title || snapshot.url}`);
    }

    await io.sendOutput("🤔 thinking...");
    const action = await decideNextAction(history, snapshot, state, lastSeenSnapshotKey, qaMemory);
    lastSeenSnapshotKey = currentKey;

    if (action.thought) {
      await io.sendOutput(`💭 ${action.thought}`);
    }

    let outcome;
    try {
      outcome = await executeAction(action, snapshot, lastUserMessage, qaMemory);
    } catch (error) {
      const m = error instanceof Error ? error.message : String(error);
      outcome = { ok: false, message: `❌ Tool threw: ${m}` };
    }

    // If this turn's action is ask_user and it was accepted, remember the
    // question — next user message will pair with it.
    if (action.type === "ask_user" && outcome.ok) {
      pendingQuestion = action.question;
    }

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
      consecutiveFailures += 1;
      if (consecutiveFailures >= 3) {
        await io.sendOutput(
          "⚠️ Three consecutive tool failures — handing back to you. Tell me what to do next."
        );
        return;
      }
      continue;
    }
    consecutiveFailures = 0;
  }

  await io.sendOutput("⚠️ Reached step limit for this turn. Tell me what to do next.");
}

async function main(): Promise<void> {
  await io.sendOutput("✅ Vodafone Sales Assistant (agent loop)");
  await io.sendOutput(`🧠 LLM: ${getModelSource() === "openai" ? "OpenAI" : "local"}`);
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
