/**
 * executor.js
 * -----------
 * Executes structured commands.
 */

const {
  openWebsite,
  closeBrowser,
  getCurrentTitle,
  getCurrentUrl,
  getExistingPage,
} = require("./browser");

const { inspectPage } = require("./pageInspector");
const { clickByVisibleText, isRiskyLabel } = require("./clickActions");
const { fillInputField } = require("./inputActions");

let pendingClickTarget = null;

async function executeCommand(command) {
  if (!command || typeof command !== "object" || !command.type) {
    return {
      success: false,
      message: "⚠️ Invalid command received.",
    };
  }

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

    case "inspect_page": {
      const page = getExistingPage();
      const info = await inspectPage(page);

      return {
        success: true,
        message:
          `📄 Title: ${info.title}\n` +
          `🌐 URL: ${info.url}\n` +
          `🔘 Buttons (${info.buttons.length}): ${info.buttons.join(", ") || "None"}\n` +
          `🔗 Links (${info.links.length}): ${info.links.join(", ") || "None"}`,
      };
    }

    case "list_buttons": {
      const page = getExistingPage();
      const info = await inspectPage(page);

      return {
        success: true,
        message:
          `🔘 Visible buttons (${info.buttons.length}):\n` +
          (info.buttons.length ? info.buttons.map((b) => `- ${b}`).join("\n") : "None"),
      };
    }

    case "list_links": {
      const page = getExistingPage();
      const info = await inspectPage(page);

      return {
        success: true,
        message:
          `🔗 Visible links (${info.links.length}):\n` +
          (info.links.length ? info.links.map((l) => `- ${l}`).join("\n") : "None"),
      };
    }

    case "click_text": {
      const target = (command.target || "").trim();

      if (!target) {
        return {
          success: false,
          message: "⚠️ No click target provided.",
        };
      }

      if (isRiskyLabel(target)) {
        pendingClickTarget = target;
        return {
          success: false,
          message:
            `⚠️ Risky click detected: "${target}"\n` +
            `If you really want it, say: confirm click ${target}`,
        };
      }

      const page = getExistingPage();
      return await clickByVisibleText(page, target);
    }

    case "confirm_click_text": {
      const target = (command.target || "").trim();

      if (!pendingClickTarget) {
        return {
          success: false,
          message: "⚠️ There is no pending risky click to confirm.",
        };
      }

      if (pendingClickTarget.toLowerCase() !== target.toLowerCase()) {
        return {
          success: false,
          message:
            `⚠️ Confirmation target mismatch.\nPending: "${pendingClickTarget}"\nReceived: "${target}"`,
        };
      }

      const page = getExistingPage();
      const result = await clickByVisibleText(page, target);
      pendingClickTarget = null;
      return result;
    }

    case "fill_input": {
      const page = getExistingPage();
      return await fillInputField(page, command.target || "", command.value || "");
    }

    case "close_browser":
      pendingClickTarget = null;
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
          "🤖 I couldn't understand that yet.\nTry:\n" +
          "  open google.com\n" +
          "  inspect page\n" +
          "  list buttons\n" +
          "  list links\n" +
          "  click Gmail\n" +
          "  type Frank Da into Name\n" +
          "  close browser\n" +
          "  exit",
      };
  }
}

module.exports = {
  executeCommand,
};