import { spawn } from "node:child_process";

/**
 * Records audio from the default microphone until silence is detected.
 * Requires `sox` to be installed (`brew install sox`).
 * Returns a WAV buffer (16kHz, mono, 16-bit signed LE).
 */
export function recordUntilSilence(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    // sox -d          → record from default mic
    // -t wav          → output WAV format
    // -r 16000        → 16kHz sample rate
    // -c 1            → mono
    // -b 16           → 16-bit
    // -                → write to stdout
    // silence 1 0.1 0.5%  → start recording after 0.1s of sound above 0.5% threshold
    // 1 1.5 0.5%      → stop after 1.5s of silence below 0.5% threshold
    const sox = spawn("sox", [
      "-d",
      "-t", "wav",
      "-r", "16000",
      "-c", "1",
      "-b", "16",
      "-",
      "silence", "1", "0.1", "0.5%",
      "1", "1.5", "0.5%",
    ]);

    sox.stdout.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    sox.stderr.on("data", (data: Buffer) => {
      // sox prints status info to stderr — ignore unless it's a real error
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
      resolve(Buffer.concat(chunks));
    });
  });
}
