import { spawn, execFile } from "node:child_process";
import { readFileSync, unlinkSync } from "node:fs";

const RECORD_SECONDS = process.env["RECORD_SECONDS"] ?? "5";

/**
 * Records audio from the default microphone for a fixed duration.
 * Requires `sox` to be installed (`brew install sox`).
 * Returns a WAV buffer (16kHz, mono, 16-bit signed LE).
 */
export function recordUntilSilence(): Promise<Buffer> {
  const tmpFile = `/tmp/voice-capture-${Date.now()}.wav`;

  return new Promise((resolve, reject) => {
    const sox = spawn("sox", [
      "-d",
      "-t", "wav",
      "-r", "16000",
      "-c", "1",
      "-b", "16",
      tmpFile,
      "trim", "0", RECORD_SECONDS,
    ]);

    sox.stderr.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("FAIL") || msg.includes("error")) {
        reject(new Error(`sox error: ${msg}`));
      }
    });

    sox.on("error", (err) => {
      reject(new Error(`Failed to spawn sox: ${err.message}. Is sox installed? (brew install sox)`));
    });

    sox.on("close", (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`sox exited with code ${code}`));
        return;
      }
      try {
        const buf = readFileSync(tmpFile);
        unlinkSync(tmpFile);
        resolve(buf);
      } catch (e: unknown) {
        reject(new Error(`Failed to read recorded audio: ${(e as Error).message}`));
      }
    });
  });
}
