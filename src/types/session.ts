export type JourneyStep =
  | "idle"
  | "product_selection"
  | "cart"
  | "checkout"
  | "customer_info"
  | "review";

export interface SessionState {
  // Product selection
  deviceModel: string | null;
  color: string | null;
  storage: string | null;
  simChoice: string | null;

  // Customer information
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  customerAddress: string | null;

  // Journey tracking
  journeyStep: JourneyStep;
  currentUrl: string | null;

  // Conversation flow
  pendingQuestion: string | null;
}
