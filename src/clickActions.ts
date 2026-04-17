import type { Locator, Page } from "playwright";
import type { ClickResult } from "./types/results.js";

const RISKY_LABEL_PATTERNS = [
  /checkout/i,
  /place order/i,
  /submit order/i,
  /confirm order/i,
  /pay now/i,
  /continue to payment/i,
  /buy now/i,
];

interface ClickLocatorResult {
  clicked: boolean;
  matchedText?: string;
}

async function tryClickLocator(locator: Locator, targetText: string): Promise<ClickLocatorResult> {
  const count = await locator.count();

  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);

    try {
      const visible = await item.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }

      let text = await item.innerText().catch(() => "");
      text = text.replace(/\s+/g, " ").trim();

      if (!text) {
        continue;
      }

      if (text.toLowerCase() === targetText.toLowerCase()) {
        await item.click();
        return {
          clicked: true,
          matchedText: text,
        };
      }
    } catch {
      // Ignore individual locator failures.
    }
  }

  return { clicked: false };
}

export function isRiskyLabel(label: string): boolean {
  return RISKY_LABEL_PATTERNS.some((pattern) => pattern.test(label));
}

export async function clickByVisibleText(page: Page | undefined, rawTarget: string): Promise<ClickResult> {
  if (!page) {
    return {
      success: false,
      message: "⚠️ No page is open.",
    };
  }

  const target = (rawTarget || "").trim();

  if (!target) {
    return {
      success: false,
      message: "⚠️ No click target provided.",
    };
  }

  const buttonLocator = page.locator("button, input[type='button'], input[type='submit']");
  const linkLocator = page.locator("a");

  let result = await tryClickLocator(buttonLocator, target);
  if (result.clicked) {
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    return {
      success: true,
      message: `✅ Clicked button: ${result.matchedText}`,
    };
  }

  result = await tryClickLocator(linkLocator, target);
  if (result.clicked) {
    await page.waitForLoadState("domcontentloaded").catch(() => undefined);
    return {
      success: true,
      message: `✅ Clicked link: ${result.matchedText}`,
    };
  }

  return {
    success: false,
    message: `⚠️ Could not find a visible button or link with text: "${target}"`,
  };
}
