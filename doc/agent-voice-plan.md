# Plan: Voice Input/Output Support

## TL;DR

Add voice-based ordering alongside existing text chat by introducing an `InputProvider` abstraction over I/O in `src/index.ts`, then creating a `VoiceInputProvider` backed by a local Whisper STT server and macOS `say` for TTS. The entire agent pipeline (`agent.ts` → `agentTools.ts` → browser modules) is input-source agnostic and requires zero changes.

---

## Phase 1 — Extract I/O Interface

Decouple all user-facing I/O from `src/index.ts` into an `InputProvider` interface so that text and voice are swappable.

### Steps

1. **Create `src/types/inputProvider.ts`** — Define the `InputProvider` interface:
   - `getInput(): Promise<string>` — blocking call that returns the next user message as text
   - `sendOutput(message: string): Promise<void>` — prints debug/status output to terminal (never spoken)
   - `sendError(message: string): Promise<void>` — prints error output to terminal (never spoken)
   - `speakToUser(message: string): Promise<void>` — delivers a conversational message; in voice mode this is spoken aloud AND printed; in text mode this is just printed
   - `close(): void` — cleanup (close readline, stop mic, etc.)

2. **Create `src/io/textProvider.ts`** — Implements `InputProvider` by wrapping the existing `readline` logic currently in `index.ts`:
   - Constructor creates `readline.createInterface({ input: process.stdin, output: process.stdout })`
   - `getInput()` wraps `rl.question("\nYou> ")` in a Promise
   - `sendOutput()` calls `console.log()`
   - `sendError()` calls `console.error()`
   - `close()` calls `rl.close()`

3. **Refactor `src/index.ts`** to route output through `InputProvider` while retaining all existing terminal output for text-mode users:

   **Key principle:** Text-mode behaviour is unchanged. `TextInputProvider.sendOutput()` calls `console.log()` internally, and `TextInputProvider.sendError()` calls `console.error()` internally. Every message that currently appears in the terminal continues to appear identically. The abstraction exists solely so that `VoiceInputProvider` can additionally speak messages aloud (while still printing them to the terminal).

   Changes:
   - Move `const rl = readline.createInterface(...)` into `TextInputProvider` (it is still created and used — just encapsulated)
   - Replace recursive `prompt()` function with an async `while(true)` main loop calling `io.getInput()`
   - Route output through `io.sendOutput(...)` / `io.sendError(...)` instead of calling `console.log` / `console.error` directly
   - `runAgentTurn` gains a second parameter: `io: InputProvider`
   - `handleMetaCommand` gains an `io: InputProvider` parameter
   - Keep `process.exit(0)` for "exit"/"quit" — call `io.close()` before it
   - Select provider based on `process.argv.includes("--voice")`

   **What this means for each provider:**

   | Provider | `sendOutput(msg)` behaviour | `sendError(msg)` behaviour |
   |---|---|---|
   | `TextInputProvider` | `console.log(msg)` — identical to current behaviour | `console.error(msg)` — identical to current behaviour |
   | `VoiceInputProvider` | `console.log(msg)` — printed to terminal only (debug/troubleshooting visibility); NOT spoken aloud | `console.error(msg)` — printed to terminal only; NOT spoken aloud |

   Voice-mode users hear only **agent conversational messages** (i.e. `ask_user` questions and `done` reasons). All other output (thoughts, tool outcomes, state dumps, warnings) is debug information and is printed to the terminal silently without TTS.

   To support this distinction, `InputProvider` gains one additional method:
   - `speakToUser(message: string): Promise<void>` — delivers a conversational message that voice users should hear. In `TextInputProvider` this is just `console.log(msg)`. In `VoiceInputProvider` this is `console.log(msg)` AND `await speak(msg)`.

   Usage in `index.ts`:
   - `io.sendOutput(...)` — for all debug/status/log messages (terminal only, never spoken)
   - `io.speakToUser(...)` — for agent conversational replies that the user needs to hear (spoken in voice mode)

   **Specific routing in `index.ts` (text users see no difference):**
   | Current code | Routed through | Voice mode |
   |---|---|---|
   | `rl.question("\nYou> ", cb)` | `await io.getInput()` | Mic capture + STT |
   | `console.log("👋 bye")` | `await io.speakToUser("👋 bye")` | Spoken (conversational) |
   | `console.log(formatState())` | `await io.sendOutput(formatState())` | Terminal only (debug) |
   | `console.log("🧹 state and history cleared")` | `await io.sendOutput("🧹 ...")` | Terminal only (debug) |
   | `console.log(summarizeSnapshot(snapshot))` | `await io.sendOutput(summarizeSnapshot(...))` | Terminal only (debug) |
   | `console.log("🛑 Reached checkout-like page...")` | `await io.speakToUser("🛑 ...")` | Spoken (conversational) |
   | `console.log("💭 " + action.thought)` | `await io.sendOutput("💭 ...")` | Terminal only (debug) |
   | `console.log(outcome.message)` — when `ask_user` | `await io.speakToUser(outcome.message)` | Spoken (conversational) |
   | `console.log(outcome.message)` — other actions | `await io.sendOutput(outcome.message)` | Terminal only (debug) |
   | `console.log("⚠️ Reached step limit...")` | `await io.sendOutput("⚠️ ...")` | Terminal only (debug) |
   | `console.error("❌ Error:", message)` | `await io.sendError("❌ Error: " + message)` | Terminal only (debug) |

   **Rule of thumb:** Only messages the user needs to *respond to* or *act on* (agent questions, confirmations, stop notices) go through `speakToUser`. Everything else is debug output routed through `sendOutput`/`sendError`.

### Verification (Phase 1)
- `pnpm build` — no type errors
- `pnpm start` (no `--voice` flag) — text mode works identically to current behaviour
- All meta commands (`show state`, `reset state`, `debug snapshot`, `exit`) work
- Agent turn loop (`runAgentTurn`) works end-to-end with a real Vodafone page

---

## Phase 2 — Stand Up Whisper STT Server

Install OpenAI Whisper and run a thin HTTP wrapper for speech-to-text transcription.

### Steps

4. **Stand up local Whisper server** — Use OpenAI's `openai-whisper` package (trusted publisher, MIT license, 99k+ GitHub stars) with a thin FastAPI wrapper:
   - Install prerequisites: `brew install ffmpeg` (required by Whisper)
   - Install Whisper: `pip3 install openai-whisper fastapi uvicorn python-multipart`
   - Create a minimal server script (`scripts/whisper_server.py`) and `scripts/__init__.py` (empty, makes `scripts` a Python package):
     ```python
     from fastapi import FastAPI, UploadFile, File, Form
     import whisper, tempfile, os

     app = FastAPI()
     model = whisper.load_model("base.en")

     @app.post("/v1/audio/transcriptions")
     async def transcribe(file: UploadFile = File(...), model_name: str = Form(default="base.en", alias="model")):
         with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
             tmp.write(await file.read())
             tmp_path = tmp.name
         try:
             result = model.transcribe(tmp_path)
             return {"text": result["text"].strip()}
         finally:
             os.unlink(tmp_path)
     ```
   - Run: `python3 -m uvicorn scripts.whisper_server:app --host 127.0.0.1 --port 8282`
   - Exposes endpoint: `POST http://127.0.0.1:8282/v1/audio/transcriptions`

   **Why OpenAI Whisper over `faster-whisper-server`:**
   - Trusted publisher (OpenAI), 99k+ stars, 84 contributors, MIT licensed
   - The `faster-whisper-server` PyPI package (v0.0.2) is an unrelated, single-release package with no linked source repo — potential name-squatting risk
   - The well-known GitHub project (`fedirz/faster-whisper-server`) has been renamed to `speaches` and is not the same as the PyPI package
   - OpenAI Whisper is compatible with Python 3.8–3.11, including the system Python 3.9 on macOS — no need to install a newer Python version

### Verification (Phase 2)
- Server starts without errors and listens on `http://127.0.0.1:8282`
- Test with curl:
  ```bash
  say -o /tmp/test-stt.wav --data-format=LEI16@16000 "hello world"
  curl -s http://127.0.0.1:8282/v1/audio/transcriptions \
    -F "file=@/tmp/test-stt.wav" \
    -F "model=base.en"
  ```
- Response should contain `{"text": "hello world"}`

---

## Phase 3 — STT Client Module (Speech-to-Text)

Create a Node client that captures microphone audio and sends it to the Whisper server for transcription.

### Steps

5. **Create `src/voice/stt.ts`** — Whisper HTTP client:
   - `transcribe(audioBuffer: Buffer): Promise<string>`
     - POST multipart form to `http://127.0.0.1:8282/v1/audio/transcriptions` (configurable via `STT_BASE_URL` env var)
     - Body: `file` = audio buffer as WAV, `model` = "base.en"
     - Parse JSON response → return `.text` field
   - Use native `fetch` (Node 18+) — no extra HTTP deps needed

6. **Create `src/voice/audioCapture.ts`** — Microphone recording:
   - `recordUntilSilence(): Promise<Buffer>` — records from default mic, stops after ~1.5s of silence
   - Spawn `sox` directly via `child_process.spawn` (available on macOS via `brew install sox`) — no npm wrapper needed
   - Command: `sox -d -t wav -r 16000 -c 1 -b 16 - silence 1 0.1 0.5% 1 1.5 0.5%`
   - Captures 16kHz mono 16-bit WAV from default mic, stops after 1.5s of silence
   - Returns the WAV buffer directly (already in correct format for Whisper)

### Verification (Phase 3)
- Unit-test `transcribe()` by sending a known WAV file to the running Whisper server
- Manual test: run `audioCapture.recordUntilSilence()` in a scratch script → verify it produces a buffer → send to `transcribe()` → verify text output matches spoken words

---

## Phase 4 — TTS Setup (macOS `say`)

Use the macOS built-in `say` command for text-to-speech — zero infrastructure, no server, no model downloads.

### Steps

7. **Verify `say` is available** — macOS ships with `say` pre-installed:
   - Run `say "hello world"` — confirm audio plays through speakers
   - Select a voice: `say -v '?'` lists available voices. Default is fine; optionally use `say -v Samantha` for a natural US English voice
   - No installation, no server, no model downloads required

### Verification (Phase 4)
- Run `say "hello world"` in terminal → audio plays
- Run `say -v Samantha "I am your sales assistant"` → confirms voice selection works

---

## Phase 5 — TTS Client Module (Text-to-Speech)

Create a Node client that converts text to speech using macOS `say`.

### Steps

8. **Create `src/voice/tts.ts`** — TTS via macOS `say`:
   - `speak(text: string): Promise<void>`
   - Implementation: `child_process.execFile("say", [stripped])` wrapped in a Promise
   - Strip emoji from text before speaking (regex: remove chars outside BMP or known emoji ranges) — `say` chokes on emoji
   - Optionally accept a voice name via `TTS_VOICE` env var (default: system default voice)

### Verification (Phase 5)
- Manual test: call `speak("Hello, I am your sales assistant")` → audio plays through speakers
- Verify emoji stripping: `speak("🛑 Reached checkout")` → speaks "Reached checkout" without errors

---

## Phase 6 — Voice Provider & Integration

Combine STT + TTS into a `VoiceInputProvider` and wire it into `index.ts`.

### Steps

9. **Create `src/io/voiceProvider.ts`** — Implements `InputProvider`:
   - `getInput()`:
     1. Play a short beep or speak "listening..." cue (optional)
     2. Call `recordUntilSilence()` from `audioCapture.ts`
     3. Call `transcribe(audioBuffer)` from `stt.ts`
     4. Echo transcribed text to console: `console.log("🎤 You said: " + text)` (debug visibility only)
     5. Return text
   - `sendOutput(message)`:
     1. `console.log(message)` — print to terminal only (debug/troubleshooting; NOT spoken)
   - `sendError(message)`:
     1. `console.error(message)` — print to terminal only (NOT spoken)
   - `speakToUser(message)`:
     1. `console.log(message)` — print to terminal for visibility
     2. `await speak(message)` — speak aloud to the user
   - `close()`:
     - Stop any in-progress recording, no-op cleanup

10. **Update `src/index.ts` main entrypoint** — Add provider selection:
    - Import both `TextInputProvider` and `VoiceInputProvider`
    - `const useVoice = process.argv.includes("--voice")`
    - Instantiate the appropriate provider
    - Pass to main loop

11. **Update `package.json`**:
    - Add scripts:
      - `"start:voice": "node dist/index.js --voice"`
      - `"dev:voice": "npm run build && npm run start:voice"`
    - Document `sox` as a system prerequisite (macOS: `brew install sox`)
    - No new npm dependencies needed — mic capture uses direct `sox` spawn, TTS uses macOS `say`

### Verification (Phase 6)
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
- `package.json` — Add `start:voice` and `dev:voice` scripts (no new npm deps)

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
- **macOS `say` for TTS** — zero infrastructure, no server, no model downloads. Ships with macOS. Good enough quality for a voice ordering agent.
- **Direct `sox` spawn for mic capture** — no npm wrapper (`node-record-lpcm16` is abandoned 6 years). Spawn `sox` via `child_process` directly. Requires `brew install sox`.
- **Console echo in voice mode** — always print to terminal even when speaking, for debug visibility.

## Further Considerations

1. **Silence detection tuning** — `sox` silence parameters may need tuning for noisy environments. Start with 1.5s silence / 0.5% threshold and adjust.
2. **Concurrent speech** — If the agent is speaking (TTS) when the user starts talking, the mic may capture the agent's own voice. Consider muting mic during TTS playback, or using a push-to-talk model for v1.
3. **Streaming TTS** — For long agent responses, waiting for full TTS synthesis before playback adds latency. v1 can use sentence-level chunking (split on `.` / `?` / `!`, speak each chunk). Not required for initial implementation.
