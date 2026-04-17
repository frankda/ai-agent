import type { Page } from "playwright";
import type { FormField } from "./types/forms.js";
import type { FormInspectionResult } from "./types/results.js";
import { NON_TEXT_INPUT_TYPES, SENSITIVE_FIELD_PATTERNS } from "./utils/fieldConstants.js";

function normalizeText(text: string | null | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function isSensitiveField(text: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(text || ""));
}

async function getAssociatedLabel(page: Page, id: string): Promise<string> {
  if (!id) {
    return "";
  }

  try {
    const label = page.locator(`label[for="${id}"]`).first();
    if ((await label.count().catch(() => 0)) === 0) {
      return "";
    }

    return normalizeText(await label.innerText());
  } catch {
    return "";
  }
}

export async function inspectFormFields(page: Page | undefined): Promise<FormInspectionResult> {
  if (!page) {
    return {
      success: false,
      message: "⚠️ No page is open.",
      fields: [],
    };
  }

  const locator = page.locator(
    "input, textarea, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']"
  );

  const count = await locator.count().catch(() => 0);
  const fields: FormField[] = [];

  for (let i = 0; i < count; i++) {
    const el = locator.nth(i);

    try {
      const visible = await el.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }

      const tagName =
        (await el.evaluate((node) => node.tagName.toLowerCase()).catch(() => "")) || "";
      const typeAttr = ((await el.getAttribute("type").catch(() => "")) || "").toLowerCase();

      if (tagName === "input" && NON_TEXT_INPUT_TYPES.has(typeAttr)) {
        continue;
      }

      const editable =
        (await el.isEditable().catch(() => false)) ||
        (await el.evaluate((node) => (node as HTMLElement).isContentEditable).catch(() => false));

      if (!editable) {
        continue;
      }

      const name = normalizeText(await el.getAttribute("name").catch(() => ""));
      const id = normalizeText(await el.getAttribute("id").catch(() => ""));
      const placeholder = normalizeText(await el.getAttribute("placeholder").catch(() => ""));
      const ariaLabel = normalizeText(await el.getAttribute("aria-label").catch(() => ""));
      const autocomplete = normalizeText(await el.getAttribute("autocomplete").catch(() => ""));
      const label = await getAssociatedLabel(page, id);

      const displayName = label || ariaLabel || placeholder || name || id || autocomplete || "unknown";
      const sensitive = isSensitiveField(
        `${displayName} ${placeholder} ${ariaLabel} ${name} ${autocomplete}`
      );

      fields.push({
        displayName,
        label,
        placeholder,
        name,
        id,
        ariaLabel,
        autocomplete,
        tag: tagName,
        type: typeAttr || "text",
        editable,
        sensitive,
      });
    } catch {
      // Skip broken elements.
    }
  }

  return {
    success: true,
    message: `✅ Found ${fields.length} fillable field(s).`,
    fields,
  };
}
