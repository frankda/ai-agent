import type { Locator, Page } from "playwright";
import type {
  PageSnapshot,
  SnapshotButton,
  SnapshotOption,
  SnapshotOptionGroup,
} from "./types/pageSnapshot.js";
import { inspectFormFields } from "./formInspector.js";
import { isRiskyLabel } from "./clickActions.js";
import { getLabelForInput } from "./shoppingActions.js";

const EMPTY_SNAPSHOT: PageSnapshot = {
  url: "",
  title: "",
  optionGroups: [],
  inputs: [],
  primaryButtons: [],
  inlineErrors: [],
};

function normalizeText(text: string | null | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

async function findGroupLabel(page: Page, input: Locator): Promise<string> {
  try {
    const label = await input.evaluate((node) => {
      const el = node as HTMLInputElement;

      const fieldset = el.closest("fieldset");
      if (fieldset) {
        const legend = fieldset.querySelector("legend");
        if (legend && legend.textContent) {
          return legend.textContent;
        }
      }

      const labelledById = el.getAttribute("aria-labelledby");
      if (labelledById) {
        const ids = labelledById.split(/\s+/);
        const parts = ids
          .map((id) => document.getElementById(id)?.textContent || "")
          .filter(Boolean);
        if (parts.length > 0) {
          return parts.join(" ");
        }
      }

      let cursor: Element | null = el.parentElement;
      let depth = 0;

      while (cursor && depth < 8) {
        let sibling: Element | null = cursor.previousElementSibling;
        while (sibling) {
          const heading = sibling.matches("h1,h2,h3,h4,h5,h6,[role='heading']")
            ? sibling
            : sibling.querySelector("h1,h2,h3,h4,h5,h6,[role='heading']");
          if (heading && heading.textContent) {
            return heading.textContent;
          }
          sibling = sibling.previousElementSibling;
        }
        cursor = cursor.parentElement;
        depth += 1;
      }

      return "";
    });

    return normalizeText(label);
  } catch {
    return "";
  }
}

async function buildOptionGroups(page: Page): Promise<SnapshotOptionGroup[]> {
  const inputLocator = page.locator("input[type='radio'], input[type='checkbox']");
  const count = await inputLocator.count().catch(() => 0);

  type Entry = {
    name: string;
    groupLabel: string;
    optionLabel: string;
    selected: boolean;
  };

  const entries: Entry[] = [];

  for (let i = 0; i < count; i++) {
    try {
      const item = inputLocator.nth(i);
      const optionLabel = normalizeText(await getLabelForInput(page, item));
      if (!optionLabel) {
        continue;
      }

      const name = normalizeText(await item.getAttribute("name").catch(() => ""));
      const selected = await item.isChecked().catch(() => false);
      const groupLabel = await findGroupLabel(page, item);

      entries.push({
        name: name || "__ungrouped__",
        groupLabel: groupLabel || name || "Options",
        optionLabel,
        selected,
      });
    } catch {
      // skip broken inputs
    }
  }

  const buckets = new Map<string, SnapshotOptionGroup>();

  for (const entry of entries) {
    const key = `${entry.name}::${entry.groupLabel}`;
    let group = buckets.get(key);
    if (!group) {
      group = { groupLabel: entry.groupLabel, options: [] };
      buckets.set(key, group);
    }

    const existing = group.options.find((o) => o.label === entry.optionLabel);
    if (existing) {
      if (entry.selected) {
        existing.selected = true;
      }
      continue;
    }

    const option: SnapshotOption = {
      label: entry.optionLabel,
      selected: entry.selected,
    };
    group.options.push(option);
  }

  return Array.from(buckets.values()).filter((g) => g.options.length > 0);
}

async function collectButtons(page: Page): Promise<SnapshotButton[]> {
  const locator = page.locator("button, input[type='button'], input[type='submit'], [role='button']");
  const count = await locator.count().catch(() => 0);
  const seen = new Set<string>();
  const result: SnapshotButton[] = [];

  for (let i = 0; i < Math.min(count, 60); i++) {
    try {
      const item = locator.nth(i);
      const visible = await item.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }

      let text = await item.innerText().catch(() => "");
      text = normalizeText(text);

      if (!text) {
        const ariaLabel = normalizeText(await item.getAttribute("aria-label").catch(() => ""));
        if (ariaLabel) {
          text = ariaLabel;
        }
      }

      if (!text || seen.has(text)) {
        continue;
      }

      seen.add(text);
      result.push({ label: text, isRisky: isRiskyLabel(text) });
    } catch {
      // skip
    }
  }

  return result;
}

async function collectInlineErrors(page: Page): Promise<string[]> {
  try {
    const texts = await page.evaluate(() => {
      const selectors = [
        "[role='alert']",
        "[aria-invalid='true']",
        ".error",
        ".error-message",
        "[class*='error']",
        "[data-testid*='error']",
      ];
      const found = new Set<string>();
      for (const sel of selectors) {
        const nodes = document.querySelectorAll(sel);
        nodes.forEach((node) => {
          const el = node as HTMLElement;
          if (!el.offsetParent) return; // not visible
          const text = (el.textContent || "").replace(/\s+/g, " ").trim();
          if (text && text.length < 300) {
            found.add(text);
          }
        });
      }
      return Array.from(found).slice(0, 8);
    });
    return texts || [];
  } catch {
    return [];
  }
}

export async function readPage(page: Page | undefined): Promise<PageSnapshot> {
  if (!page) {
    return { ...EMPTY_SNAPSHOT };
  }

  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.waitForTimeout(200).catch(() => undefined);

  const [url, title, formResult, optionGroups, primaryButtons, inlineErrors] = await Promise.all([
    Promise.resolve(page.url()),
    page.title().catch(() => ""),
    inspectFormFields(page),
    buildOptionGroups(page),
    collectButtons(page),
    collectInlineErrors(page),
  ]);

  return {
    url,
    title,
    optionGroups,
    inputs: formResult.fields,
    primaryButtons,
    inlineErrors,
  };
}

export function summarizeSnapshot(snapshot: PageSnapshot): string {
  const lines: string[] = [];
  lines.push(`URL: ${snapshot.url}`);
  lines.push(`Title: ${snapshot.title}`);

  if (snapshot.optionGroups.length > 0) {
    lines.push("");
    lines.push("Option groups:");
    for (const group of snapshot.optionGroups) {
      const opts = group.options
        .map((o) => (o.selected ? `[x] ${o.label}` : `[ ] ${o.label}`))
        .join(", ");
      lines.push(`  - ${group.groupLabel}: ${opts}`);
    }
  }

  if (snapshot.inputs.length > 0) {
    lines.push("");
    lines.push("Inputs:");
    for (const f of snapshot.inputs) {
      const flag = f.sensitive ? " (sensitive)" : "";
      lines.push(`  - ${f.displayName}${flag} [${f.type}]`);
    }
  }

  if (snapshot.primaryButtons.length > 0) {
    lines.push("");
    lines.push("Buttons:");
    for (const b of snapshot.primaryButtons) {
      const flag = b.isRisky ? " (risky)" : "";
      lines.push(`  - ${b.label}${flag}`);
    }
  }

  if (snapshot.inlineErrors.length > 0) {
    lines.push("");
    lines.push("Inline errors:");
    for (const e of snapshot.inlineErrors) {
      lines.push(`  - ${e}`);
    }
  }

  return lines.join("\n");
}
