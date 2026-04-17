import type { SessionState, JourneyStep } from "./types/session.js";

const DEFAULT_STATE: SessionState = {
  deviceModel: null,
  color: null,
  storage: null,
  simChoice: null,
  customerName: null,
  customerPhone: null,
  customerEmail: null,
  customerAddress: null,
  journeyStep: "idle",
  currentUrl: null,
  pendingQuestion: null,
};

let state: SessionState = { ...DEFAULT_STATE };

export function getState(): Readonly<SessionState> {
  return state;
}

export function updateState(updates: Partial<SessionState>): void {
  state = { ...state, ...updates };
}

export function resetState(): void {
  state = { ...DEFAULT_STATE };
}

/**
 * Maps a field display name to a customer session key.
 * Returns null if the field does not match any known customer field.
 */
export function detectCustomerField(
  fieldName: string
): keyof Pick<SessionState, "customerName" | "customerPhone" | "customerEmail" | "customerAddress"> | null {
  const lower = fieldName.toLowerCase();

  if (/\bname\b/.test(lower)) return "customerName";
  if (/phone|mobile|tel/.test(lower)) return "customerPhone";
  if (/email/.test(lower)) return "customerEmail";
  if (/address|street|suburb/.test(lower)) return "customerAddress";

  return null;
}

function row(label: string, value: string | null): string {
  return `  ${label.padEnd(10)} ${value ?? "—"}`;
}

export function formatState(): string {
  const s = state;
  const lines: string[] = [
    "🧠 Session State:",
    "",
    "  Product",
    row("Model:", s.deviceModel),
    row("Color:", s.color),
    row("Storage:", s.storage),
    row("SIM:", s.simChoice),
    "",
    "  Customer",
    row("Name:", s.customerName),
    row("Phone:", s.customerPhone),
    row("Email:", s.customerEmail),
    row("Address:", s.customerAddress),
    "",
    "  Journey",
    row("Step:", s.journeyStep),
    row("URL:", s.currentUrl),
  ];

  if (s.pendingQuestion) {
    lines.push(row("Pending:", s.pendingQuestion));
  }

  return lines.join("\n");
}
