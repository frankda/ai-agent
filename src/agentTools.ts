import type { AgentAction } from "./types/agentAction.js";
import type { PageSnapshot } from "./types/pageSnapshot.js";
import type { SessionState } from "./types/session.js";
import { openWebsite, getPage, getExistingPage } from "./browser.js";
import { tryClickByRadioOrCheckbox, tryClickByButton } from "./shoppingActions.js";
import { isRiskyLabel } from "./clickActions.js";
import { fillInputField } from "./inputActions.js";
import { detectCustomerField, updateState } from "./sessionState.js";
import { clickPlanCard } from "./vodafonePlans.js";
import { fillSelectByLabel } from "./selectActions.js";
import { waitForPageIdle } from "./utils/pageIdle.js";
import { findSimilarRecent, type QAEntry } from "./utils/qaMemory.js";

export interface ToolOutcome {
  ok: boolean;
  message: string;
  shouldExit?: boolean;
  awaitsUser?: boolean;
}

// Stop ONLY at real terminal pages. Cart, /checkout intro, plan, SIM, account-creation
// are all transitions and must NOT trigger stop.
const CHECKOUT_URL_PATTERNS = [/\/payment/i, /\/review/i, /\/credit-check/i, /\/order-confirmation/i];
const CHECKOUT_TITLE_PATTERNS = [/payment/i, /^review/i, /credit check/i, /order summary/i];

export function isCheckoutLikePage(snapshot: PageSnapshot): boolean {
  if (!snapshot.url && !snapshot.title) return false;
  if (CHECKOUT_URL_PATTERNS.some((p) => p.test(snapshot.url))) return true;
  if (CHECKOUT_TITLE_PATTERNS.some((p) => p.test(snapshot.title))) return true;
  return false;
}

const AFFIRMATIVE =
  /^\s*(yes|y|yeah|yep|sure|ok|okay|confirm(ed)?|do it|proceed|go ahead|please|continue)\s*[.!]?\s*$/i;

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
  lastUserMessage: string | null,
  qaMemory: QAEntry[] = []
): Promise<ToolOutcome> {
  switch (action.type) {
    case "ask_user": {
      // Block re-asking a question the customer already answered recently.
      const similar = findSimilarRecent(action.question, qaMemory, {
        threshold: 0.55,
        lookback: 6,
      });
      if (similar) {
        return {
          ok: false,
          message:
            `⚠️ You ALREADY asked: "${similar.question}" and the customer answered: "${similar.answer}". ` +
            `Do NOT ask again. Take the next concrete action: click the appropriate button (Checkout / Continue / Add to cart / etc.) or fill the appropriate field. ` +
            `If you genuinely need different information, rephrase substantially.`,
        };
      }
      const lines = [`❓ ${action.question}`];
      if (action.suggestions && action.suggestions.length > 0) {
        lines.push(`   Options: ${action.suggestions.join(" | ")}`);
      }
      return { ok: true, message: lines.join("\n"), awaitsUser: true };
    }

    case "done": {
      const userSaidStop = lastUserMessage
        ? /\b(stop|cancel|quit|exit|abort|nevermind|never mind|that'?s enough)\b/i.test(lastUserMessage)
        : false;
      const blockedKeywords = /(login|captcha|verification|hand back)/i.test(action.reason);

      if (!isCheckoutLikePage(snapshot) && !userSaidStop && !blockedKeywords) {
        return {
          ok: false,
          message:
            `⚠️ Refusing 'done': not at a payment/review page yet (current URL: ${snapshot.url || "unknown"}). ` +
            `The customer wants to keep going. Look at the snapshot's buttons for the forward action (Continue / Add to cart / Checkout / Continue to cart / Let's get started / Create account / etc.), ` +
            `briefly tell the customer what choices the page has, and advance with click_button after they confirm.`,
        };
      }
      return { ok: true, message: `🛑 ${action.reason}`, awaitsUser: true };
    }

    case "open_url": {
      // Sanitize URL: LLMs sometimes append JSON syntax fragments like }]}, or trailing
      // braces/brackets/quotes. Cut at the first non-URL character and trim.
      let cleanUrl = action.url.trim();
      // Strip everything from first occurrence of disallowed characters
      const badCharIdx = cleanUrl.search(/[\s{}\[\]"'<>`\\]/);
      if (badCharIdx >= 0) {
        cleanUrl = cleanUrl.slice(0, badCharIdx);
      }
      // Remove trailing punctuation that isn't valid at end of URL
      cleanUrl = cleanUrl.replace(/[,.;:!?]+$/, "");

      if (!cleanUrl || !/^https?:\/\//i.test(cleanUrl)) {
        return {
          ok: false,
          message: `⚠️ Refused open_url: malformed URL "${action.url}". Provide a clean https:// URL only.`,
        };
      }

      const existing = getExistingPage();
      if (existing) {
        const currentUrl = existing.url();
        try {
          const currentHost = new URL(currentUrl).hostname;
          const targetHost = new URL(cleanUrl).hostname;
          if (currentHost === targetHost) {
            return {
              ok: false,
              message:
                `⚠️ Refused open_url to ${cleanUrl}. A page on ${currentHost} is already open. ` +
                `To advance the flow, find the appropriate button in the snapshot (Select this phone / Continue / Add to cart / Checkout / Let's get started) and use click_button.`,
            };
          }
        } catch {
          return {
            ok: false,
            message: `⚠️ Refused open_url: could not parse URL "${cleanUrl}".`,
          };
        }
      }
      try {
        const result = await openWebsite(cleanUrl);
        updateState({ currentUrl: result.url, journeyStep: "product_selection" });
        return { ok: true, message: `✅ Opened ${result.url} (title: ${result.title})` };
      } catch (error: unknown) {
        const m = error instanceof Error ? error.message : String(error);
        return { ok: false, message: `⚠️ Failed to open URL: ${m}` };
      }
    }

    case "select_option": {
      const page = await getPage();
      const term = action.optionLabel;
      const groupLower = action.groupLabel.toLowerCase();

      const matchedGroup = snapshot.optionGroups.find(
        (g) => g.groupLabel.toLowerCase() === groupLower
      );

      // Native <select>
      if (matchedGroup?.kind === "select") {
        const r = await fillSelectByLabel(page, action.groupLabel, term);
        if (r.success) {
          const customerKey = detectCustomerField(action.groupLabel);
          if (customerKey) updateState({ [customerKey]: term } as Partial<SessionState>);
          return { ok: true, message: `✅ Picked ${r.matchedField}: ${r.matchedOption}` };
        }
        return { ok: false, message: r.message || "Dropdown selection failed." };
      }

      // Vodafone plan cards
      if (matchedGroup?.kind === "plan-card" || /plan/.test(groupLower)) {
        const p = await clickPlanCard(page, term);
        if (p.success) {
          return { ok: true, message: `✅ Selected plan: ${p.matchedSummary}` };
        }
        if (matchedGroup?.kind === "plan-card") {
          return { ok: false, message: p.message || "Plan-card click failed." };
        }
        // fall through
      }

      // Last-resort dropdown fallback (in case kind wasn't tagged)
      const selectFallback = await fillSelectByLabel(page, action.groupLabel, term);
      if (selectFallback.success) {
        const customerKey = detectCustomerField(action.groupLabel);
        if (customerKey) updateState({ [customerKey]: term } as Partial<SessionState>);
        return {
          ok: true,
          message: `✅ Picked ${selectFallback.matchedField}: ${selectFallback.matchedOption}`,
        };
      }

      let result = await tryClickByRadioOrCheckbox(page, term);
      if (!result.success) {
        result = await tryClickByButton(page, term);
      }

      if (!result.success) {
        const available = matchedGroup?.options.map((o) => o.label).slice(0, 8);
        const hint =
          available && available.length > 0
            ? `\nAvailable in "${action.groupLabel}": ${available.join(", ")}`
            : "";
        return {
          ok: false,
          message: `⚠️ Could not select "${term}" in group "${action.groupLabel}".${hint}`,
        };
      }

      const update = inferStateUpdateFromGroup(action.groupLabel, result.matchedText || term);
      if (update) updateState(update);

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
      // Demo override: set ALLOW_SENSITIVE_FILL=true in .env to skip the sensitive-field guard.
      const allowSensitive = (process.env.ALLOW_SENSITIVE_FILL || "").toLowerCase() === "true";
      if (matchingField?.sensitive && !allowSensitive) {
        return {
          ok: false,
          message: `⚠️ Refusing to auto-fill sensitive field "${matchingField.displayName}". Ask the user (ask_user) and they will enter it manually. (Set ALLOW_SENSITIVE_FILL=true in .env to bypass for demos.)`,
        };
      }

      // Dropdown via fill_field
      const matchingSelectGroup = snapshot.optionGroups.find(
        (g) =>
          g.kind === "select" &&
          g.groupLabel.toLowerCase().includes(action.fieldLabel.toLowerCase())
      );
      if (matchingSelectGroup) {
        const r = await fillSelectByLabel(page, action.fieldLabel, action.value);
        if (r.success) {
          const customerKey = detectCustomerField(action.fieldLabel);
          if (customerKey)
            updateState({ [customerKey]: action.value } as Partial<SessionState>);
          return { ok: true, message: `✅ Picked ${r.matchedField}: ${r.matchedOption}` };
        }
        return { ok: false, message: r.message || "Dropdown fill failed." };
      }

      const result = await fillInputField(page, action.fieldLabel, action.value);
      if (result.success) {
        const customerKey = detectCustomerField(action.fieldLabel);
        if (customerKey)
          updateState({ [customerKey]: action.value } as Partial<SessionState>);
      }
      return { ok: result.success, message: result.message };
    }

    case "click_button": {
      const page = await getPage();
      // Strip any trailing "(risky)"/"(sensitive)" annotation the LLM may have copied
      const cleanLabel = action.buttonLabel
        .replace(/\s*\((risky|sensitive|warning)[^)]*\)\s*$/i, "")
        .trim();

      const buttonInfo = snapshot.primaryButtons.find(
        (b) => b.label.toLowerCase() === cleanLabel.toLowerCase()
      );
      const risky = (buttonInfo && buttonInfo.isRisky) || isRiskyLabel(cleanLabel);

      if (risky && !(lastUserMessage && isAffirmative(lastUserMessage))) {
        return {
          ok: false,
          message:
            `⚠️ Risky button "${cleanLabel}" needs explicit user confirmation. ` +
            `Use ask_user first with a clear summary; click only after a yes.`,
        };
      }

      const urlBefore = page.url();
      const result = await tryClickByButton(page, cleanLabel);
      if (!result.success) {
        const visible = snapshot.primaryButtons.map((b) => b.label).slice(0, 8).join(" | ");
        return {
          ok: false,
          message: `⚠️ Could not click button "${cleanLabel}". Visible buttons: ${visible}`,
        };
      }
      // Wait until the tab spinner stops: domcontentloaded → load →
      // networkidle → readyState=complete → no visible spinner. This is
      // what stops readPage from snapshotting a half-rendered DOM.
      await waitForPageIdle(page, { maxMs: 12000, settleMs: 400 });
      const urlAfter = page.url();
      if (urlAfter !== urlBefore) {
        // Navigation happened — one more brief settle for SPA route hydration
        await page.waitForTimeout(300).catch(() => undefined);
      }
      updateState({ currentUrl: page.url() });
      return { ok: true, message: `✅ Clicked: ${result.matchedText}` };
    }
  }
}
