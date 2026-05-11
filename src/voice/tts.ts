import { execFile } from "node:child_process";

const TTS_VOICE = process.env["TTS_VOICE"];

/** Strip emoji and other non-speech characters from text. */
function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F600}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE00}-\u{FE0F}]/gu, "")
    .replace(/[\u{200D}]/gu, "")
    .trim();
}

/** Speak text aloud using macOS `say`. Resolves when speech finishes. */
export function speak(text: string): Promise<void> {
  const stripped = stripEmoji(text);
  if (!stripped) return Promise.resolve();

  const args = TTS_VOICE ? ["-v", TTS_VOICE, stripped] : [stripped];

  return new Promise((resolve, reject) => {
    execFile("say", args, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}
