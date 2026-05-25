export interface QAEntry {
  question: string;
  answer: string;
  turn: number;
}

/** Normalize a question/answer string for fuzzy comparison. */
function normalize(s: string): string {
  return (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Tokenize and drop trivial stop words. */
function tokens(s: string): Set<string> {
  const stop = new Set([
    "the", "a", "an", "is", "are", "do", "you", "to", "of", "for", "on", "at",
    "and", "or", "with", "we", "re", "your", "this", "that", "would", "like",
    "want", "ready", "now", "please", "i", "in", "be", "can", "could", "have",
    "has", "what", "which", "any",
  ]);
  return new Set(
    normalize(s)
      .split(" ")
      .filter((w) => w.length > 1 && !stop.has(w))
  );
}

/** Jaccard similarity over content tokens. */
export function similarity(a: string, b: string): number {
  const A = tokens(a);
  const B = tokens(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter += 1;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Find a recent question similar to `candidate`. Used to block the agent
 * from re-asking something the user already answered.
 */
export function findSimilarRecent(
  candidate: string,
  memory: QAEntry[],
  options: { threshold?: number; lookback?: number } = {}
): QAEntry | null {
  const threshold = options.threshold ?? 0.55;
  const lookback = options.lookback ?? 5;
  const recent = memory.slice(-lookback);
  let best: { entry: QAEntry; score: number } | null = null;
  for (const entry of recent) {
    const s = similarity(candidate, entry.question);
    if (s >= threshold && (!best || s > best.score)) {
      best = { entry, score: s };
    }
  }
  return best ? best.entry : null;
}

export function formatQAMemory(memory: QAEntry[], maxEntries = 8): string {
  if (memory.length === 0) return "(no questions answered yet)";
  return memory
    .slice(-maxEntries)
    .map((m) => `Q: ${m.question}\nA: ${m.answer}`)
    .join("\n");
}
