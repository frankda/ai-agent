/**
 * Step 4: command executor
 * ------------------------
 * Takes a structured command object and executes the correct action.
 *
 * This keeps index.js very small and makes the app easier to extend later.
 */

const {
  openWebsite,
  closeBrowser,
  getCurrentTitle,
  getCurrentUrl,
} = require("./browser");

async function executeCommand(command) {
  switch (command.type) {
    case "exit":
      await closeBrowser();
      return {
        success: true,
        message: "👋 Exiting...",
        shouldExit: true,
      };

    case "open_website": {
      const result = await openWebsite(command.target);

      return {
        success: true,
        message: `✅ Page opened: ${result.url}\n📄 Page title: ${result.title}`,
      };
    }

    case "get_title": {
      const title = await getCurrentTitle();

      return {
        success: true,
        message: `📄 Current page title: ${title}`,
      };
    }

    case "get_url": {
      const url = await getCurrentUrl();

      return {
        success: true,
        message: `🌐 Current page URL: ${url}`,
      };
    }

    case "close_browser":
      await closeBrowser();
      return {
        success: true,
        message: "🛑 Browser closed.",
      };

    case "unknown":
    default:
      return {
        success: false,
        message:
          "🤖 I don't understand yet.\nTry:\n  open google.com\n  title\n  url\n  close browser\n  exit",
      };
  }
}

module.exports = {
  executeCommand,
};
