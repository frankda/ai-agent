/**
 * Step 6: command parser
 * ----------------------
 * Converts raw user chat into a structured command object.
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

  if (
    lower === "inspect page" ||
    lower === "what page is this" ||
    lower === "page info"
  ) {
    return { type: "inspect_page" };
  }

  if (lower === "list buttons") {
    return { type: "list_buttons" };
  }

  if (lower === "list links") {
    return { type: "list_links" };
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
