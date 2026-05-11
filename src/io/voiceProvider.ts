import type { InputProvider } from "../types/inputProvider.js";
import { recordUntilSilence } from "../voice/audioCapture.js";
import { transcribe } from "../voice/stt.js";
import { speak } from "../voice/tts.js";

export class VoiceInputProvider implements InputProvider {
  async getInput(): Promise<string> {
    console.log("\n🎙️  Listening...");
    const audioBuffer = await recordUntilSilence();
    const text = await transcribe(audioBuffer);
    console.log(`🎤 You said: ${text}`);
    return text;
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
