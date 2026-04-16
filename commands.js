/**
 * Step 4: command parser
 * ----------------------
 * Converts raw user chat into a simple structured command object.
 *
 * Supported commands:
 * - open <website>
 * - title
 * - url
 * - close browser
 * - exit
 */

function parseCommand(message) {
  const trimmed = message.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "exit") {
    return { type: "exit" };
  }

  if (lower === "title") {
    return { type: "get_title" };
  }

  if (lower === "url") {
    return { type: "get_url" };
  }

  if (lower === "close browser") {
    return { type: "close_browser" };
  }

  if (lower.startsWith("open ")) {
    const target = trimmed.slice(5).trim();

    return {
      type: "open_website",
      target,
    };
  }

  return {
    type: "unknown",
    raw: message,
  };
}

module.exports = {
  parseCommand,
};
``