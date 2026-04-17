/**
 * executor.js
 * -----------
 * Executes structured commands returned by aiParser.js.
 *
 * Supported command types:
 * - open_website
 * - get_title
 * - get_url
 * - close_browser
 * - inspect_page
 * - list_buttons
 * - list_links
 * - list_inputs
 * - click_text
 * - confirm_click_text
 * - fill_input
 * - exit
 * - unknown
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
const { inspectFormFields } = require("./formInspector");

let pendingClickTarget = null;

function formatList(title, items) {
  if (!items || items.length === 0) {
    return `${title}\nNone`;
  }

  return `${title}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function formatInputFields(fields) {
  if (!fields || fields.length === 0) {
    return "🧾 Fillable fields:\nNone found";
  }

  const lines = fields.map((field, index) => {
    const sensitiveMark = field.sensitive ? " 🔒" : "";
    const typeInfo = field.type ? ` (${field.type})` : "";
    return `${index + 1}. ${field.displayName}${typeInfo}${sensitiveMark}`;
  });

  return `🧾 Fillable fields:\n${lines.join("\n")}`;
}

async function executeCommand(command) {
  if (!command || typeof command !== "object" || !command.type) {
    return {
      success: false,
      message: "⚠️ Invalid command received.",
    };
  }

  switch (command.type) {
    case "exit": {
      await closeBrowser();
      pendingClickTarget = null;

      return {
        success: true,
        message: "👋 Exiting...",
        shouldExit: true,
      };
    }

    case "open_website": {
      const target = (command.target || "").trim();

      if (!target) {
        return {
          success: false,
          message: "⚠️ No website target provided.",
        };
      }

      const result = await openWebsite(target);

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
        data: info,
      };
    }

    case "list_buttons": {
      const page = getExistingPage();
      const info = await inspectPage(page);

      return {
        success: true,
        message: formatList(`🔘 Visible buttons (${info.buttons.length}):`, info.buttons),
        data: info.buttons,
      };
    }

    case "list_links": {
      const page = getExistingPage();
      const info = await inspectPage(page);

      return {
        success: true,
        message: formatList(`🔗 Visible links (${info.links.length}):`, info.links),
        data: info.links,
      };
    }

    case "list_inputs": {
      const page = getExistingPage();
      const result = await inspectFormFields(page);

      if (!result.success) {
        return result;
      }

      return {
        success: true,
        message: formatInputFields(result.fields),
        fields: result.fields,
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
      const result = await clickByVisibleText(page, target);

      return result;
    }

    case "confirm_click_text": {
      const target = (command.target || "").trim();

      if (!target) {
        return {
          success: false,
          message: "⚠️ No confirmation target provided.",
        };
      }

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
            `⚠️ Confirmation target mismatch.\n` +
            `Pending: "${pendingClickTarget}"\n` +
            `Received: "${target}"`,
        };
      }

      const page = getExistingPage();
      const result = await clickByVisibleText(page, target);
      pendingClickTarget = null;

      return result;
    }

    case "fill_input": {
      const page = getExistingPage();
      const field = (command.target || "").trim();
      const value = (command.value || "").trim();

      if (!field) {
        return {
          success: false,
          message: "⚠️ No input field target provided.",
        };
      }

      if (!value) {
        return {
          success: false,
          message: "⚠️ No input value provided.",
        };
      }

      return await fillInputField(page, field, value);
    }

    case "close_browser": {
      await closeBrowser();
      pendingClickTarget = null;

      return {
        success: true,
        message: "🛑 Browser closed.",
      };
    }

    case "unknown":
    default:
      return {
        success: false,
        message:
          "🤖 I couldn't understand that yet.\n" +
          "Try:\n" +
          "  open google.com\n" +
          "  inspect page\n" +
          "  list buttons\n" +
          "  list links\n" +
          "  list inputs\n" +
          "  click Gmail\n" +
          "  type Frank Da into Name\n" +
          "  title\n" +
          "  url\n" +
          "  close browser\n" +
          "  exit",
      };
  }
}

module.exports = {
  executeCommand,
};