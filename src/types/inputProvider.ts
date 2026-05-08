export interface InputProvider {
  /** Blocking call that returns the next user message as text. */
  getInput(): Promise<string>;

  /** Prints debug/status output to terminal. Never spoken in voice mode. */
  sendOutput(message: string): Promise<void>;

  /** Prints error output to terminal. Never spoken in voice mode. */
  sendError(message: string): Promise<void>;

  /**
   * Delivers a conversational message the user needs to hear.
   * In text mode: prints to terminal.
   * In voice mode: prints to terminal AND speaks aloud.
   */
  speakToUser(message: string): Promise<void>;

  /** Cleanup (close readline, stop mic, etc.). */
  close(): void;
}
