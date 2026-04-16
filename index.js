/**
 * Step 4: CLI chat + parser + executor
 * ------------------------------------
 * index.js is now only responsible for:
 * - reading user input
 * - parsing commands
 * - executing commands
 * - printing results
 */

const readline = require("readline");
const { parseCommandWithAI } = require("./aiParser");
const { executeCommand } = require("./executor");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function handleUserMessage(message) {
  const command = await parseCommandWithAI(message);
  const result = await executeCommand(command);

  console.log(result.message);

  if (result.shouldExit) {
    process.exit(0);
  }
}

function prompt() {
  rl.question("\nYou> ", async (answer) => {
    try {
      await handleUserMessage(answer);
    } catch (err) {
      console.error("❌ Error:", err.message);
    }

    prompt();
  });
}

console.log("✅ Simple CLI Chat Started");
console.log("Try:");
console.log("  open google.com");
console.log("  title");
console.log("  url");
console.log("  close browser");
console.log("  exit");

prompt();
``