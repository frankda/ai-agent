# Vodafone Sales Assistant

An AI-powered browser automation agent that navigates the Vodafone website and places orders on your behalf. Supports both text and voice interaction modes.

---

## Prerequisites

You need the following installed on your Mac before starting.

### Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### Node.js (v22+)

```bash
brew install node@22
```

Verify: `node --version` should show `v22.x.x`

### pnpm

```bash
corepack enable
corepack prepare pnpm@10.33.0 --activate
```

Verify: `pnpm --version`

### Local LLM server

The agent uses a local LLM via an OpenAI-compatible API at `http://127.0.0.1:1234/v1`. Install [LM Studio](https://lmstudio.ai/), load a model, and start the local server on port 1234.

---

## Project Setup

```bash
git clone <repo-url>
cd ai-agent
pnpm install
npx playwright install
```

---

## Text Mode

Text mode requires no additional tooling beyond the prerequisites above. You type messages in the terminal and the agent responds with text.

### Running

1. Start your LLM server in LM Studio on port 1234
2. Run the agent:

```bash
pnpm dev
```

### Usage

- Type a request at the `You>` prompt (e.g. `I want to buy an iPhone 17 Pro Max`)
- The agent navigates the Vodafone website, selects products, and walks you through the purchase
- Meta commands: `show state`, `reset state`, `debug snapshot`, `exit`

---

## Voice Mode

Voice mode lets you speak requests and hear responses. It requires additional tooling for speech-to-text (Whisper) and uses the built-in macOS `say` command for text-to-speech.

### Additional Prerequisites

#### Python 3 (system Python is fine)

macOS ships with Python 3.9 via Xcode Command Line Tools. Verify:

```bash
python3 --version
```

If missing: `xcode-select --install`

#### ffmpeg (required by Whisper for audio processing)

```bash
brew install ffmpeg
```

#### sox (required for microphone capture)

```bash
brew install sox
```

#### Python dependencies (Whisper STT server)

```bash
pip3 install openai-whisper fastapi uvicorn python-multipart
```

The Whisper model (~140MB) downloads automatically on first use.

### Microphone Permissions

macOS requires explicit microphone access for Terminal. On first run, macOS will prompt you to grant microphone access to your terminal app. **You must allow this** or recording will fail silently.

You can pre-grant it via: **System Settings → Privacy & Security → Microphone → Toggle on for Terminal**.

### Running

1. Start your LLM server in LM Studio on port 1234
2. Run the agent in voice mode:

```bash
pnpm dev:voice
```

This single command:
1. Kills any stale Whisper server from a previous session
2. Starts the Whisper STT server on port 8282
3. Waits for the model to load
4. Builds the TypeScript project
5. Launches the agent in voice mode

### Usage

- When you see `🎙️ Listening (5s)...`, speak your request (e.g. "I want to buy an iPhone 17 Pro Max")
- You have 5 seconds to speak (configurable via `RECORD_SECONDS` env var)
- The agent transcribes your speech, navigates the Vodafone website, and speaks responses back to you
- To stop: press `Ctrl+C` (kills both the agent and the Whisper server)

---

## Environment Variables

All optional — sensible defaults are provided.

| Variable | Default | Description |
|---|---|---|
| `LOCAL_LLM_BASE_URL` | `http://127.0.0.1:1234/v1` | LLM server endpoint |
| `LOCAL_LLM_API_KEY` | `local` | LLM API key |
| `LOCAL_LLM_MODEL` | `local-model` | LLM model name |
| `STT_BASE_URL` | `http://127.0.0.1:8282` | Whisper STT server endpoint |
| `TTS_VOICE` | system default | macOS `say` voice name (e.g. `Samantha`) |
| `RECORD_SECONDS` | `5` | Mic recording duration in seconds |
