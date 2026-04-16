/**
 * Step 4: browser module
 * ----------------------
 * Owns Playwright browser actions.
 */

const { chromium } = require("playwright");

let browser;
let context;
let page;

async function getPage() {
  if (!browser) {
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext();
    page = await context.newPage();
  }
  return page;
}

function normalizeUrl(input) {
  let url = input.trim();

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "https://" + url;
  }

  return url;
}

async function openWebsite(input) {
  const page = await getPage();
  const url = normalizeUrl(input);

  console.log(`🌐 Opening browser to: ${url}`);
  await page.goto(url, { waitUntil: "domcontentloaded" });

  return {
    success: true,
    url: page.url(),
    title: await page.title(),
  };
}

async function getCurrentTitle() {
  if (!page) {
    return "No page is currently open.";
  }

  return await page.title();
}

async function getCurrentUrl() {
  if (!page) {
    return "No page is currently open.";
  }

  return page.url();
}

async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = undefined;
    context = undefined;
    page = undefined;
  }
}

module.exports = {
  getPage,
  openWebsite,
  getCurrentTitle,
  getCurrentUrl,
  closeBrowser,
};