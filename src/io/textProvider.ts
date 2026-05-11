import readline from "node:readline";
import type { InputProvider } from "../types/inputProvider.js";

type ReadlineInterface = ReturnType<typeof readline.createInterface>;

export class TextInputProvider implements InputProvider {
  private rl: ReadlineInterface;

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
  }

  getInput(): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question("\nYou> ", (answer: string) => {
        resolve(answer);
      });
    });
  }

  async sendOutput(message: string): Promise<void> {
    console.log(message);
  }

  async sendError(message: string): Promise<void> {
    console.error(message);
  }

  async speakToUser(message: string): Promise<void> {
    console.log(message);
  }

  close(): void {
    this.rl.close();
  }
}
