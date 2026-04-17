import readline from "node:readline";
import { parseCommandWithAI } from "./aiParser.js";
import { executeCommand } from "./executor.js";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function handleUserMessage(message: string): Promise<void> {
  const command = await parseCommandWithAI(message);
  console.log("DEBUG command:", command);

  const result = await executeCommand(command);
  console.log(result.message);

  if (result.shouldExit) {
    process.exit(0);
  }
}

function prompt(): void {
  rl.question("\nYou> ", async (answer: string) => {
    try {
      await handleUserMessage(answer);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("❌ Error:", message);
    }

    prompt();
  });
}

console.log("✅ Simple CLI Chat Started");
console.log("Examples:");
console.log("  open google.com");
console.log("  inspect page");
console.log("  list links");
console.log("  click Gmail");
console.log("  type Frank Da into Name");
console.log("  exit");

prompt();
