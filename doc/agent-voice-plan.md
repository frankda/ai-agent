# Plan: Voice Input/Output Support

## TL;DR

Add voice-based ordering alongside existing text chat by introducing an `InputProvider` abstraction over I/O in `src/index.ts`, then creating a `VoiceInputProvider` backed by a local Whisper STT server and a local Piper TTS server. The entire agent pipeline (`agent.ts` → `agentTools.ts` → browser modules) is input-source agnostic and requires zero changes.

---

## Phase 1 — Extract I/O Interface

Decouple all user-facing I/O from `src/index.ts` into an `InputProvider` interface so that text and voice are swappable.

### Steps

1. **Create `src/types/inputProvider.ts`** — Define the `InputProvider` interface:
   - `getInput(): Promise<string>` — blocking call that returns the next user message as text
   - `sendOutput(message: string): Promise<void>` — delivers agent output to the user
   - `sendError(message: string): Promise<void>` — delivers error output
   - `close(): void` — cleanup (close readline, stop mic, etc.)

2. **Create `src/io/textProvider.ts`** — Implements `InputProvider` by wrapping the existing `readline` logic currently in `index.ts`:
   - Constructor creates `readline.createInterface({ input: process.stdin, output: process.stdout })`
   - `getInput()` wraps `rl.question("\nYou> ")` in a Promise
   - `sendOutput()` calls `console.log()`
   - `sendError()` calls `console.error()`
   - `close()` calls `rl.close()`

3. **Refactor `src/index.ts`** to use `InputProvider` instead of direct readline/console calls:
   - Remove `const rl = readline.createInterface(...)` — now inside `TextInputProvider`
   - Replace recursive `prompt()` function with an async `while(true)` main loop calling `io.getInput()`
   - Replace every `console.log(...)` in `runAgentTurn` and `handleMetaCommand` with `io.sendOutput(...)`
   - Replace `console.error("❌ Error:", message)` with `io.sendError(...)`
   - `runAgentTurn` gains a second parameter: `io: InputProvider`
   - `handleMetaCommand` gains an `io: InputProvider` parameter
   - Keep `process.exit(0)` for "exit"/"quit" — call `io.close()` before it
   - Startup banner (`console.log("✅ Vodafone Sales Assistant...")`) goes through `io.sendOutput()`
   - Select provider based on `process.argv.includes("--voice")`

   **Specific I/O replacements in `index.ts`:**
   | Current code | Replacement |
   |---|---|
   | `rl.question("\nYou> ", cb)` | `await io.getInput()` |
   | `console.log("👋 bye")` | `await io.sendOutput("👋 bye")` |
   | `console.log(formatState())` | `await io.sendOutput(formatState())` |
   | `console.log("🧹 state and history cleared")` | `await io.sendOutput("🧹 ...")` |
   | `console.log(summarizeSnapshot(snapshot))` | `await io.sendOutput(summarizeSnapshot(...))` |
   | `console.log("🛑 Reached checkout-like page...")` | `await io.sendOutput("🛑 ...")` |
   | `console.log("💭 " + action.thought)` | `await io.sendOutput("💭 ...")` |
   | `console.log(outcome.message)` | `await io.sendOutput(outcome.message)` |
   | `console.log("⚠️ Reached step limit...")` | `await io.sendOutput("⚠️ ...")` |
   | `console.error("❌ Error:", message)` | `await io.sendError("❌ Error: " + message)` |

### Verification (Phase 1)
- `pnpm build` — no type errors
- `pnpm start` (no `--voice` flag) — text mode works identically to current behaviour
- All meta commands (`show state`, `reset state`, `debug snapshot`, `exit`) work
- Agent turn loop (`runAgentTurn`) works end-to-end with a real Vodafone page

---

## Phase 2 — STT Module (Speech-to-Text)

Stand up a local Whisper server and create a Node client that captures microphone audio and returns transcribed text.

### Steps

4. **Stand up local Whisper server** — Use `faster-whisper-server` (Python, runs on CPU or GPU):
   - Install: `pip install faster-whisper-server`
   - Run: `faster-whisper-server --model Systran/faster-whisper-base.en --host 127.0.0.1 --port 8282`
   - Exposes OpenAI-compatible endpoint: `POST http://127.0.0.1:8282/v1/audio/transcriptions`
   - Document the startup command in README or a `scripts/` helper

5. **Create `src/voice/stt.ts`** — Whisper HTTP client:
   - `transcribe(audioBuffer: Buffer): Promise<string>`
     - POST multipart form to `http://127.0.0.1:8282/v1/audio/transcriptions` (configurable via `STT_BASE_URL` env var)
     - Body: `file` = audio buffer as WAV, `model` = "whisper-base.en"
     - Parse JSON response → return `.text` field
   - Use native `fetch` (Node 18+) — no extra HTTP deps needed

6. **Create `src/voice/audioCapture.ts`** — Microphone recording:
   - `recordUntilSilence(): Promise<Buffer>` — records from default mic, stops after ~1.5s of silence
   - Use `node-record-lpcm16` (spawns `sox` or `rec` under the hood — available on macOS via `brew install sox`)
   - Returns raw PCM buffer, wrapped with WAV header for Whisper
   - Alternative: use `sox` directly via `child_process.spawn` for fewer deps

### Verification (Phase 2)
- Unit-test `transcribe()` by sending a known WAV file to the running Whisper server
- Manual test: run `audioCapture.recordUntilSilence()` in a scratch script → verify it produces a buffer → send to `transcribe()` → verify text output matches spoken words

---

## Phase 3 — TTS Module (Text-to-Speech)

Stand up a local TTS server and create a Node client that converts text to speech and plays it.

### Steps

7. **Stand up local Piper TTS server** — lightweight, fast, runs on CPU:
   - Install: download Piper binary + an English voice model (e.g., `en_US-lessac-medium`)
   - Run via HTTP wrapper or use `piper-tts` npm package for direct invocation
   - Alternative: use macOS built-in `say` command for zero-infra TTS (lower quality but no server needed)
   - Document the startup command

8. **Create `src/voice/tts.ts`** — TTS client + playback:
   - `speak(text: string): Promise<void>`
   - **Option A (Piper server):** POST text to Piper HTTP endpoint → receive WAV bytes → play via `afplay` (macOS) using `child_process.execFile`
   - **Option B (macOS `say`):** `child_process.execFile("say", [text])` — zero infra, good enough for demo
   - Make strategy configurable via `TTS_BACKEND` env var (`"piper"` | `"say"`)
   - Strip emoji from text before speaking (regex: remove chars outside BMP or known emoji ranges) — TTS engines choke on emoji

### Verification (Phase 3)
- Manual test: call `speak("Hello, I am your sales assistant")` → audio plays through speakers
- Verify emoji stripping: `speak("🛑 Reached checkout")` → speaks "Reached checkout" without errors

---

## Phase 4 — Voice Provider & Integration

Combine STT + TTS into a `VoiceInputProvider` and wire it into `index.ts`.

### Steps

9. **Create `src/io/voiceProvider.ts`** — Implements `InputProvider`:
   - `getInput()`:
     1. Play a short beep or speak "listening..." cue (optional)
     2. Call `recordUntilSilence()` from `audioCapture.ts`
     3. Call `transcribe(audioBuffer)` from `stt.ts`
     4. Also echo transcribed text to console: `console.log("🎤 You said: " + text)` (for debug/demo visibility)
     5. Return text
   - `sendOutput(message)`:
     1. `console.log(message)` — always print to terminal for visibility
     2. `await speak(message)` — also speak it aloud
   - `sendError(message)`:
     1. `console.error(message)` — print
     2. `await speak(message)` — speak error too
   - `close()`:
     - Stop any in-progress recording, no-op cleanup

10. **Update `src/index.ts` main entrypoint** — Add provider selection:
    - Import both `TextInputProvider` and `VoiceInputProvider`
    - `const useVoice = process.argv.includes("--voice")`
    - Instantiate the appropriate provider
    - Pass to main loop

11. **Update `package.json`**:
    - Add dependency: `node-record-lpcm16` (for mic capture)
    - Add scripts:
      - `"start:voice": "node dist/index.js --voice"`
      - `"dev:voice": "npm run build && npm run start:voice"`
    - Document `sox` as a system prerequisite (macOS: `brew install sox`)

### Verification (Phase 4)
- `pnpm build` — no type errors
- `pnpm start` — text mode works unchanged (regression check)
- `pnpm start:voice` — voice mode:
  1. Agent speaks the startup banner
  2. Mic captures user speech → transcribes → echoes to console
  3. Agent processes command via existing pipeline
  4. Agent speaks the response
  5. Full Vodafone purchase loop works end-to-end via voice

---

## Relevant Files

**New files:**
- `src/types/inputProvider.ts` — `InputProvider` interface definition
- `src/io/textProvider.ts` — readline-based `InputProvider` (extracts existing logic from `index.ts`)
- `src/io/voiceProvider.ts` — STT+TTS-based `InputProvider`
- `src/voice/stt.ts` — Whisper HTTP client (`transcribe()`)
- `src/voice/tts.ts` — TTS client + audio playback (`speak()`)
- `src/voice/audioCapture.ts` — Microphone recording (`recordUntilSilence()`)

**Modified files:**
- `src/index.ts` — Refactor to use `InputProvider`; add `--voice` flag; replace recursive `prompt()` with async loop
- `package.json` — Add `node-record-lpcm16` dep; add `start:voice` and `dev:voice` scripts

**Unchanged files (no modifications needed):**
- `src/agent.ts` — `decideNextAction()` receives strings, returns `AgentAction`
- `src/agentTools.ts` — `executeAction()` receives `AgentAction`, returns `ToolOutcome`
- `src/pageReader.ts`, `src/browser.ts`, `src/clickActions.ts`, `src/inputActions.ts`
- `src/shoppingActions.ts`, `src/formInspector.ts`, `src/pageInspector.ts`
- `src/sessionState.ts`, `src/types/session.ts`, `src/types/agentAction.ts`
- `src/types/commands.ts`, `src/types/forms.ts`, `src/types/pageSnapshot.ts`
- `src/utils/fieldConstants.ts`

---

## Verification (End-to-End)

1. **Text mode regression:** `pnpm dev` → full Vodafone iPhone purchase loop works identically to before
2. **Voice mode smoke test:** `pnpm dev:voice` → say "I want to buy an iPhone 17 Pro Max" → agent speaks responses, navigates pages, asks questions via speech
3. **Meta commands via voice:** say "show state" → agent speaks the state summary
4. **Mixed verification:** console always shows text transcript alongside voice — confirm the `🎤 You said:` echo appears for every voice input
5. **Error handling:** unplug mic / kill Whisper server → agent should catch error and report it rather than crash

---

## Decisions

- **Reuse existing Mistral LLM server** — STT (Whisper) and TTS (Piper/`say`) are separate services, not LLMs. Mistral is unchanged.
- **`InputProvider` interface over I/O** — cleanest separation; the agent pipeline is already input-agnostic, only `index.ts` does I/O.
- **macOS `say` as fallback TTS** — zero infrastructure for demos; Piper for production-quality voice.
- **Console echo in voice mode** — always print to terminal even when speaking, for debug visibility.
- **`sox` as system dep** — required by `node-record-lpcm16` for mic capture on macOS. Document in README.

## Further Considerations

1. **Silence detection tuning** — `node-record-lpcm16` has a `silence` threshold parameter. May need tuning for noisy environments. Start with 1.5s silence / threshold 0.5 and adjust.
2. **Concurrent speech** — If the agent is speaking (TTS) when the user starts talking, the mic may capture the agent's own voice. Consider muting mic during TTS playback, or using a push-to-talk model for v1.
3. **Streaming TTS** — For long agent responses, waiting for full TTS synthesis before playback adds latency. v1 can use sentence-level chunking (split on `.` / `?` / `!`, speak each chunk). Not required for initial implementation.
