/**
 * Step 6: page inspector
 * ----------------------
 * Reads the current Playwright page and returns a lightweight summary.
 *
 * For now it extracts:
 * - title
 * - url
 * - visible buttons
 * - visible links
 */

async function getVisibleTexts(locator, limit = 20) {
  const results = [];
  const count = await locator.count();

  for (let i = 0; i < Math.min(count, limit); i++) {
    try {
      const item = locator.nth(i);
      const visible = await item.isVisible().catch(() => false);

      if (!visible) continue;

      let text = await item.innerText().catch(() => "");
      text = text.replace(/\s+/g, " ").trim();

      if (!text) continue;
      if (results.includes(text)) continue;

      results.push(text);
    } catch {
      // ignore individual locator failures
    }
  }

  return results;
}

async function inspectPage(page) {
  if (!page) {
    return {
      title: "No page open",
      url: "No page open",
      buttons: [],
      links: [],
    };
  }

  const title = await page.title().catch(() => "Unknown title");
  const url = page.url();

  const buttonLocator = page.locator("button, input[type='button'], input[type='submit']");
  const linkLocator = page.locator("a");

  const buttons = await getVisibleTexts(buttonLocator, 30);
  const links = await getVisibleTexts(linkLocator, 30);

  return {
    title,
    url,
    buttons,
    links,
  };
}

module.exports = {
  inspectPage,
};
