import type { Page } from "playwright";
import { scoreLabelMatch } from "./shoppingActions.js";

export interface VodafonePlanCard {
  data: string;
  title: string;
  price: string;
  summary: string;
  selected: boolean;
  visibleIndex: number;
}

const PLAN_CARD_SELECTOR = '[data-testid^="plan-card-AU"]';

function isElementVisibleSrc(): string {
  return `
    function isElementVisible(el) {
      const html = el;
      if (!html.offsetParent && getComputedStyle(html).position !== "fixed") return false;
      const rect = html.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const style = getComputedStyle(html);
      if (style.visibility === "hidden" || style.display === "none" || parseFloat(style.opacity) === 0) {
        return false;
      }
      return true;
    }
  `;
}

export async function extractPlanCards(page: Page): Promise<VodafonePlanCard[]> {
  try {
    return await page.evaluate(
      ({ cardSel, isVisibleSrc }) => {
        function clean(s: string | null | undefined): string {
          return (s || "").replace(/\s+/g, " ").trim();
        }
        // eslint-disable-next-line no-new-func
        const isVisible = new Function("el", `${isVisibleSrc}; return isElementVisible(el);`) as (
          el: Element
        ) => boolean;

        const allCards = Array.from(document.querySelectorAll(cardSel));
        const visibleCards = allCards.filter((c) => isVisible(c));

        return visibleCards.map((card, visibleIndex) => {
          const dataEl = card.querySelector('[data-testid="uplifted-plan-card-head-section"]');
          const priceEl = card.querySelector('[data-testid="uplifted-plan-card-price"]');
          const titleEl = card.querySelector('[data-testid^="plan-card-title-"]');

          const data = clean(dataEl ? (dataEl as HTMLElement).innerText : "");
          const price = clean(priceEl ? (priceEl as HTMLElement).innerText : "");
          const titleRaw = clean(titleEl ? (titleEl as HTMLElement).innerText : "");
          const title = (titleRaw.split(/\n|\./)[0] || "").trim();

          const cta = card.querySelector('[data-testid="select-plan-cta"]');
          const ctaText = clean(cta ? (cta as HTMLElement).innerText : "");
          const isSelected = /selected|added|in cart/i.test(ctaText);

          const summaryParts = [data, title, price].filter(Boolean);
          const summary =
            summaryParts.join(" — ") || clean((card as HTMLElement).innerText).slice(0, 120);

          return {
            data,
            title,
            price,
            summary,
            selected: isSelected,
            visibleIndex,
          };
        });
      },
      { cardSel: PLAN_CARD_SELECTOR, isVisibleSrc: isElementVisibleSrc() }
    );
  } catch {
    return [];
  }
}

export async function hasPlanCards(page: Page): Promise<boolean> {
  try {
    return (await page.locator(PLAN_CARD_SELECTOR).count()) > 0;
  } catch {
    return false;
  }
}

export interface PlanClickResult {
  success: boolean;
  matchedSummary?: string;
  message?: string;
}

export async function clickPlanCard(page: Page, label: string): Promise<PlanClickResult> {
  const cards = await extractPlanCards(page);
  if (cards.length === 0) {
    return { success: false, message: "No plan cards visible on this page." };
  }

  const scored = cards
    .map((c) => {
      const candidates = [c.summary, c.data, c.title, `${c.data} ${c.title}`];
      const score = Math.max(...candidates.map((cand) => scoreLabelMatch(cand, label)));
      return { card: c, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) {
    return {
      success: false,
      message: `No plan card matches "${label}". Available: ${cards.map((c) => c.summary).join(" | ")}`,
    };
  }

  const visibleCards = page.locator(`${PLAN_CARD_SELECTOR}:visible`);
  const cardLocator = visibleCards.nth(best.card.visibleIndex);
  const cta = cardLocator.locator('[data-testid="select-plan-cta"]:visible').first();

  try {
    await cta.scrollIntoViewIfNeeded().catch(() => undefined);
    await cta.click();
    await page.waitForTimeout(1200);
    return { success: true, matchedSummary: best.card.summary };
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    return { success: false, message: `Failed to click plan card "${best.card.summary}": ${m}` };
  }
}
