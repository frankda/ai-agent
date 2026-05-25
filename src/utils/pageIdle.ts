import type { Page } from "playwright";

/**
 * Wait until the browser tab is "idle" — equivalent to the Chrome tab
 * spinner stopping. This is more reliable than waitForLoadState alone
 * because it covers:
 *   1. The `load` event has fired
 *   2. Network requests have settled (no in-flight requests for ~500ms)
 *   3. document.readyState === 'complete'
 *   4. No visible spinner / skeleton / loading indicator on the page
 *
 * Each step has a generous timeout; if any one stage times out we still
 * proceed (best-effort) rather than throwing.
 */
export interface IdleOptions {
  /** Hard upper bound for the whole wait (ms). Default 10000. */
  maxMs?: number;
  /** Extra settle time after everything else looks idle (ms). Default 200. */
  settleMs?: number;
}

const SPINNER_SELECTORS = [
  '[role="progressbar"]',
  '[aria-busy="true"]',
  '[data-testid*="loading" i]',
  '[data-testid*="spinner" i]',
  '[class*="spinner" i]',
  '[class*="Spinner" i]',
  '[class*="loader" i]',
  '[class*="Loader" i]',
  '[class*="skeleton" i]',
  '[class*="Skeleton" i]',
];

export async function waitForPageIdle(page: Page, opts: IdleOptions = {}): Promise<void> {
  const maxMs = opts.maxMs ?? 10000;
  const settleMs = opts.settleMs ?? 200;
  const deadline = Date.now() + maxMs;

  const remaining = (): number => Math.max(0, deadline - Date.now());

  // 1) Wait for the 'load' event (window.load)
  await page
    .waitForLoadState("load", { timeout: Math.min(remaining(), 5000) })
    .catch(() => undefined);

  // 2) Wait for network to be idle (no requests for 500ms)
  await page
    .waitForLoadState("networkidle", { timeout: Math.min(remaining(), 5000) })
    .catch(() => undefined);

  // 3) Wait for document.readyState === 'complete' (defensive — usually
  //    already true after 'load', but SPAs occasionally re-enter loading)
  await page
    .waitForFunction(
      () => (document as Document).readyState === "complete",
      undefined,
      { timeout: Math.min(remaining(), 3000) }
    )
    .catch(() => undefined);

  // 4) Wait for any visible spinner / skeleton elements to disappear.
  await page
    .waitForFunction(
      (selectors: string[]) => {
        for (const sel of selectors) {
          const nodes = document.querySelectorAll(sel);
          for (const node of nodes) {
            const el = node as HTMLElement;
            if (!el.offsetParent) continue; // not visible
            const rect = el.getBoundingClientRect();
            if (rect.width < 1 || rect.height < 1) continue;
            const style = getComputedStyle(el);
            if (style.visibility === "hidden" || style.display === "none") continue;
            // A visible loading indicator is still present — not idle yet
            return false;
          }
        }
        return true;
      },
      SPINNER_SELECTORS,
      { timeout: Math.min(remaining(), 4000) }
    )
    .catch(() => undefined);

  // 5) Final small settle to let any post-hydration paints land.
  if (remaining() > 0 && settleMs > 0) {
    await page.waitForTimeout(Math.min(remaining(), settleMs)).catch(() => undefined);
  }
}

/**
 * Lightweight check: is the tab currently "loading" right now?
 * Useful for diagnostics ("debug snapshot") without blocking.
 */
export async function isPageLoading(page: Page): Promise<boolean> {
  try {
    const ready = await page.evaluate(() => (document as Document).readyState);
    if (ready !== "complete") return true;
    const spinnerVisible = await page.evaluate((selectors: string[]) => {
      for (const sel of selectors) {
        const nodes = document.querySelectorAll(sel);
        for (const node of nodes) {
          const el = node as HTMLElement;
          if (!el.offsetParent) continue;
          const rect = el.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) continue;
          const style = getComputedStyle(el);
          if (style.visibility === "hidden" || style.display === "none") continue;
          return true;
        }
      }
      return false;
    }, SPINNER_SELECTORS);
    return spinnerVisible;
  } catch {
    return false;
  }
}
