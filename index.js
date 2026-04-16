const readline = require("readline");
const { parseCommandWithAI } = require("./aiParser");
const { executeCommand } = require("./executor");

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function handleUserMessage(message) {
  const command = await parseCommandWithAI(message);
  console.log("DEBUG command:", command);

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
console.log("Examples:");
console.log("  open google.com");
console.log("  inspect page");
console.log("  list links");
console.log("  click Gmail");
console.log("  type Frank Da into Name");
console.log("  exit");

prompt();
