import type { Page } from "playwright";
import type { AgentAction } from "./types/agentAction.js";
import type { PageSnapshot } from "./types/pageSnapshot.js";
import type { SessionState } from "./types/session.js";
import { openWebsite, getPage } from "./browser.js";
import { tryClickByRadioOrCheckbox, tryClickByButton } from "./shoppingActions.js";
import { clickByVisibleText, isRiskyLabel } from "./clickActions.js";
import { fillInputField } from "./inputActions.js";
import { detectCustomerField, updateState } from "./sessionState.js";

export interface ToolOutcome {
  ok: boolean;
  message: string;
  shouldExit?: boolean;
  awaitsUser?: boolean;
}

const CHECKOUT_URL_PATTERNS = [/\/checkout/i, /\/cart\b/i, /\/review/i, /\/payment/i];
const CHECKOUT_TITLE_PATTERNS = [/checkout/i, /review/i, /payment/i, /order summary/i];

export function isCheckoutLikePage(snapshot: PageSnapshot): boolean {
  if (!snapshot.url && !snapshot.title) return false;
  if (CHECKOUT_URL_PATTERNS.some((p) => p.test(snapshot.url))) return true;
  if (CHECKOUT_TITLE_PATTERNS.some((p) => p.test(snapshot.title))) return true;
  return false;
}

const AFFIRMATIVE = /^\s*(yes|y|yeah|yep|sure|ok|okay|confirm(ed)?|do it|proceed|go ahead|please)\s*[.!]?\s*$/i;

export function isAffirmative(text: string): boolean {
  return AFFIRMATIVE.test(text || "");
}

function inferStateUpdateFromGroup(
  groupLabel: string,
  optionLabel: string
): Partial<SessionState> | null {
  const g = groupLabel.toLowerCase();
  if (/colou?r/.test(g)) return { color: optionLabel };
  if (/storage|capacity|gb|tb/.test(g)) return { storage: optionLabel };
  if (/contract|term|month|plan length/.test(g)) return { contractTerm: optionLabel };
  if (/sim/.test(g)) return { simChoice: optionLabel };
  if (/model|device|phone/.test(g)) return { deviceModel: optionLabel };
  return null;
}

export async function executeAction(
  action: AgentAction,
  snapshot: PageSnapshot,
  lastUserMessage: string | null
): Promise<ToolOutcome> {
  switch (action.type) {
    case "ask_user": {
      const lines = [`❓ ${action.question}`];
      if (action.suggestions && action.suggestions.length > 0) {
        lines.push(`   Options: ${action.suggestions.join(" | ")}`);
      }
      return { ok: true, message: lines.join("\n"), awaitsUser: true };
    }

    case "done": {
      return {
        ok: true,
        message: `🛑 ${action.reason}`,
        awaitsUser: true,
      };
    }

    case "open_url": {
      try {
        const result = await openWebsite(action.url);
        updateState({ currentUrl: result.url, journeyStep: "product_selection" });
        return {
          ok: true,
          message: `✅ Opened ${result.url} (title: ${result.title})`,
        };
      } catch (error: unknown) {
        const m = error instanceof Error ? error.message : String(error);
        return { ok: false, message: `⚠️ Failed to open URL: ${m}` };
      }
    }

    case "select_option": {
      const page = await getPage();
      const term = action.optionLabel;

      let result = await tryClickByRadioOrCheckbox(page, term);
      if (!result.success) {
        result = await tryClickByButton(page, term);
      }

      if (!result.success) {
        const available = snapshot.optionGroups
          .find((g) => g.groupLabel.toLowerCase().includes(action.groupLabel.toLowerCase()))
          ?.options.map((o) => o.label)
          .slice(0, 8);
        const hint = available && available.length > 0
          ? `\nAvailable in "${action.groupLabel}": ${available.join(", ")}`
          : "";
        return {
          ok: false,
          message: `⚠️ Could not select "${action.optionLabel}" in group "${action.groupLabel}".${hint}`,
        };
      }

      const update = inferStateUpdateFromGroup(action.groupLabel, result.matchedText || term);
      if (update) {
        updateState(update);
      }

      return {
        ok: true,
        message: `✅ Selected ${action.groupLabel}: ${result.matchedText || term}`,
      };
    }

    case "fill_field": {
      const page = await getPage();
      const matchingField = snapshot.inputs.find((f) =>
        f.displayName.toLowerCase().includes(action.fieldLabel.toLowerCase())
      );
      if (matchingField?.sensitive) {
        return {
          ok: false,
          message: `⚠️ Refusing to auto-fill sensitive field "${matchingField.displayName}". Ask the user to enter it manually in the browser.`,
        };
      }

      const result = await fillInputField(page, action.fieldLabel, action.value);

      if (result.success) {
        const customerKey = detectCustomerField(action.fieldLabel);
        if (customerKey) {
          updateState({ [customerKey]: action.value } as Partial<SessionState>);
        }
      }

      return { ok: result.success, message: result.message };
    }

    case "click_button": {
      const page = await getPage();
      const buttonInfo = snapshot.primaryButtons.find(
        (b) => b.label.toLowerCase() === action.buttonLabel.toLowerCase()
      );
      const risky =
        (buttonInfo && buttonInfo.isRisky) || isRiskyLabel(action.buttonLabel);

      if (risky && !(lastUserMessage && isAffirmative(lastUserMessage))) {
        return {
          ok: false,
          message:
            `⚠️ Risky button "${action.buttonLabel}" requires explicit user confirmation. Ask the user (ask_user) before clicking.`,
        };
      }

      const result = await clickByVisibleText(page, action.buttonLabel);
      if (result.success) {
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);
        updateState({ currentUrl: page.url() });
      }
      return { ok: result.success, message: result.message };
    }
  }
}
