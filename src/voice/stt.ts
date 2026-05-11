const STT_BASE_URL =
  process.env["STT_BASE_URL"] ?? "http://127.0.0.1:8282";

export async function transcribe(audioBuffer: Buffer): Promise<string> {
  const blob = new Blob([audioBuffer as unknown as BlobPart], { type: "audio/wav" });
  const form = new FormData();
  form.append("file", blob, "audio.wav");
  form.append("model", "base.en");

  const res = await fetch(`${STT_BASE_URL}/v1/audio/transcriptions`, {
    method: "POST",
    body: form,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`STT request failed (${res.status}): ${body}`);
  }

  const json = (await res.json()) as { text: string };
  return json.text;
}
