import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import type { OpenWebsiteResult } from "./types/results.js";

let browser: Browser | undefined;
let context: BrowserContext | undefined;
let page: Page | undefined;

export async function getPage(): Promise<Page> {
  if (!browser) {
    browser = await chromium.launch({ headless: false });
    context = await browser.newContext();
    page = await context.newPage();
  }

  return page as Page;
}

export function getExistingPage(): Page | undefined {
  return page;
}

function normalizeUrl(input: string): string {
  let url = input.trim();

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }

  return url;
}

export async function openWebsite(input: string): Promise<OpenWebsiteResult> {
  const activePage = await getPage();
  const url = normalizeUrl(input);

  console.log(`🌐 Opening browser to: ${url}`);
  await activePage.goto(url, { waitUntil: "domcontentloaded" });

  return {
    success: true,
    url: activePage.url(),
    title: await activePage.title(),
  };
}

export async function getCurrentTitle(): Promise<string> {
  if (!page) {
    return "No page is currently open.";
  }

  return page.title();
}

export async function getCurrentUrl(): Promise<string> {
  if (!page) {
    return "No page is currently open.";
  }

  return page.url();
}

export async function closeBrowser(): Promise<void> {
  if (!browser) {
    return;
  }

  await browser.close();
  browser = undefined;
  context = undefined;
  page = undefined;
}
