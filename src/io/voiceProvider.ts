import type { InputProvider } from "../types/inputProvider.js";
import { recordUntilSilence } from "../voice/audioCapture.js";
import { transcribe } from "../voice/stt.js";
import { speak } from "../voice/tts.js";

export class VoiceInputProvider implements InputProvider {
  async getInput(): Promise<string> {
    const secs = process.env["RECORD_SECONDS"] ?? "5";
    console.log(`\n🎙️  Listening (${secs}s)...`);
    try {
      const audioBuffer = await recordUntilSilence();
      const text = await transcribe(audioBuffer);
      console.log(`🎤 You said: ${text}`);
      return text;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`⚠️ Voice input failed: ${msg}`);
      console.error("Retrying...");
      return this.getInput();
    }
  }

  async sendOutput(message: string): Promise<void> {
    console.log(message);
  }

  async sendError(message: string): Promise<void> {
    console.error(message);
  }

  async speakToUser(message: string): Promise<void> {
    console.log(message);
    await speak(message);
  }

  close(): void {
    // no-op — no persistent resources to clean up
  }
}
