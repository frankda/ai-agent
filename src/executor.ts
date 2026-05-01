import {
  closeBrowser,
  getCurrentTitle,
  getCurrentUrl,
  getExistingPage,
  openWebsite,
} from "./browser.js";
import { clickByVisibleText, isRiskyLabel } from "./clickActions.js";
import { inspectFormFields } from "./formInspector.js";
import { fillInputField } from "./inputActions.js";
import { inspectPage } from "./pageInspector.js";
import { addSim, selectColor, selectContractTerm, selectModel, selectStorage } from "./shoppingActions.js";
import {
  detectCustomerField,
  formatState,
  resetState,
  updateState,
} from "./sessionState.js";
import type { Command } from "./types/commands.js";
import type { FormField } from "./types/forms.js";
import type { ExecutionResult } from "./types/results.js";

let pendingClickTarget: string | null = null;

function formatList(title: string, items: string[]): string {
  if (!items || items.length === 0) {
    return `${title}\nNone`;
  }

  return `${title}\n${items.map((item) => `- ${item}`).join("\n")}`;
}

function formatInputFields(fields: FormField[]): string {
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

export async function executeCommand(command: Command): Promise<ExecutionResult> {
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
      const target = command.target.trim();
      if (!target) {
        return {
          success: false,
          message: "⚠️ No website target provided.",
        };
      }

      const result = await openWebsite(target);
      updateState({ currentUrl: result.url, journeyStep: "product_selection" });
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
      const target = command.target.trim();
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
      return clickByVisibleText(page, target);
    }

    case "confirm_click_text": {
      const target = command.target.trim();
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
      const field = command.target.trim();
      const value = command.value.trim();

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

      const fillResult = await fillInputField(page, field, value);

      if (fillResult.success) {
        const stateKey = detectCustomerField(field);
        if (stateKey) {
          updateState({ [stateKey]: value });
        }
      }

      return fillResult;
    }

    case "show_state": {
      return {
        success: true,
        message: formatState(),
      };
    }

    case "reset_state": {
      resetState();
      return {
        success: true,
        message: "🔄 Session state has been reset.",
      };
    }

    case "select_model": {
      const target = command.target.trim();
      if (!target) {
        return {
          success: false,
          message: "⚠️ No model provided.",
        };
      }

      const page = getExistingPage();
      return selectModel(page, target);
    }

    case "select_color": {
      const target = command.target.trim();
      if (!target) {
        return {
          success: false,
          message: "⚠️ No color provided.",
        };
      }

      const page = getExistingPage();
      return selectColor(page, target);
    }

    case "select_storage": {
      const target = command.target.trim();
      if (!target) {
        return {
          success: false,
          message: "⚠️ No storage capacity provided.",
        };
      }

      const page = getExistingPage();
      return selectStorage(page, target);
    }

    case "add_sim": {
      const target = command.target.trim();
      if (!target) {
        return {
          success: false,
          message: "⚠️ No SIM choice provided.",
        };
      }

      const page = getExistingPage();
      return addSim(page, target);
    }

    case "select_contract": {
      const target = command.target.trim();
      if (!target) {
        return {
          success: false,
          message: "⚠️ No contract term provided.",
        };
      }

      const page = getExistingPage();
      return selectContractTerm(page, target);
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
