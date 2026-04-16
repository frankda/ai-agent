/**
 * Step 7: click actions
 * ---------------------
 * Click visible buttons or links by exact visible text.
 *
 * Important:
 * - no hard block list
 * - but risky clicks can require confirmation
 */
async function tryClickLocator(locator, targetText) {
  const count = await locator.count();

  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);

    try {
      const visible = await item.isVisible().catch(() => false);
      if (!visible) continue;

      let text = await item.innerText().catch(() => "");
      text = text.replace(/\s+/g, " ").trim();

      if (!text) continue;

      if (text.toLowerCase() === targetText.toLowerCase()) {
        await item.click();
        return {
          clicked: true,
          matchedText: text,
        };
      }
    } catch {
      // ignore individual failures
    }
  }

  return { clicked: false };
}

async function clickByVisibleText(page, rawTarget) {
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

  // try buttons first
  let result = await tryClickLocator(buttonLocator, target);
  if (result.clicked) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    return {
      success: true,
      message: `✅ Clicked button: ${result.matchedText}`,
    };
  }

  // then links
  result = await tryClickLocator(linkLocator, target);
  if (result.clicked) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
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

module.exports = {
  clickByVisibleText,
};