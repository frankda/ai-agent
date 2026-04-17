import type { Locator, Page } from "playwright";
import { NON_TEXT_INPUT_TYPES, SENSITIVE_FIELD_PATTERNS } from "./utils/fieldConstants.js";
import type { FillResult } from "./types/results.js";

function normalizeText(text: string | null | undefined): string {
  return (text || "").replace(/\s+/g, " ").trim();
}

function containsLooseMatch(haystack: string, needle: string): boolean {
  return normalizeText(haystack).toLowerCase().includes(normalizeText(needle).toLowerCase());
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName || ""));
}

async function safelyFillElement(element: Locator, value: string): Promise<boolean> {
  try {
    const visible = await element.isVisible().catch(() => false);
    if (!visible) {
      return false;
    }

    const editable = await element.isEditable().catch(() => false);

    if (editable) {
      await element.fill("");
      await element.fill(value);
      return true;
    }

    await element.click().catch(() => undefined);
    await element
      .evaluate((el) => {
        if ((el as HTMLElement).isContentEditable) {
          el.textContent = "";
        }
      })
      .catch(() => undefined);

    await element.type(value).catch(() => undefined);
    return true;
  } catch {
    return false;
  }
}

async function tryFillLocator(locator: Locator, value: string): Promise<boolean> {
  const count = await locator.count().catch(() => 0);

  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    const ok = await safelyFillElement(item, value);
    if (ok) {
      return true;
    }
  }

  return false;
}

async function getAssociatedLabelText(page: Page, idValue: string): Promise<string> {
  if (!idValue) {
    return "";
  }

  try {
    const label = page.locator(`label[for="${idValue}"]`).first();
    const exists = await label.count().catch(() => 0);
    if (!exists) {
      return "";
    }

    const text = await label.innerText().catch(() => "");
    return normalizeText(text);
  } catch {
    return "";
  }
}

interface GenericScanResult {
  matched: boolean;
  strategy?: string;
  matchedField?: string;
}

async function scanGenericInputs(page: Page, field: string, value: string): Promise<GenericScanResult> {
  const locator = page.locator(
    "input, textarea, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']"
  );
  const count = await locator.count().catch(() => 0);

  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);

    try {
      const visible = await item.isVisible().catch(() => false);
      if (!visible) {
        continue;
      }

      const tagName =
        (await item.evaluate((el) => el.tagName.toLowerCase()).catch(() => "")) || "";
      const typeAttr = ((await item.getAttribute("type").catch(() => "")) || "").toLowerCase();

      if (tagName === "input" && NON_TEXT_INPUT_TYPES.has(typeAttr)) {
        continue;
      }

      const editable =
        (await item.isEditable().catch(() => false)) ||
        (await item.evaluate((el) => (el as HTMLElement).isContentEditable).catch(() => false));

      if (!editable) {
        continue;
      }

      const nameAttr = (await item.getAttribute("name").catch(() => "")) || "";
      const idAttr = (await item.getAttribute("id").catch(() => "")) || "";
      const ariaLabel = (await item.getAttribute("aria-label").catch(() => "")) || "";
      const placeholder = (await item.getAttribute("placeholder").catch(() => "")) || "";
      const autocomplete = (await item.getAttribute("autocomplete").catch(() => "")) || "";
      const associatedLabel = await getAssociatedLabelText(page, idAttr);

      const candidates = [
        nameAttr,
        idAttr,
        ariaLabel,
        placeholder,
        autocomplete,
        associatedLabel,
      ];

      const matched = candidates.some((candidate) => containsLooseMatch(candidate, field));
      if (!matched) {
        continue;
      }

      const ok = await safelyFillElement(item, value);
      if (!ok) {
        continue;
      }

      return {
        matched: true,
        strategy: "generic_dom_scan",
        matchedField:
          associatedLabel || ariaLabel || placeholder || nameAttr || idAttr || autocomplete || field,
      };
    } catch {
      // Ignore candidate failure.
    }
  }

  return {
    matched: false,
  };
}

export async function fillInputField(
  page: Page | undefined,
  rawField: string,
  rawValue: string
): Promise<FillResult> {
  if (!page) {
    return {
      success: false,
      message: "⚠️ No page is open.",
      details: null,
    };
  }

  const field = normalizeText(rawField);
  const value = normalizeText(rawValue);

  if (!field) {
    return {
      success: false,
      message: "⚠️ No field name provided.",
      details: null,
    };
  }

  if (!value) {
    return {
      success: false,
      message: "⚠️ No input value provided.",
      details: null,
    };
  }

  if (isSensitiveField(field)) {
    return {
      success: false,
      message: `⛔ Refusing to fill sensitive field: "${field}"`,
      details: {
        field,
        reason: "sensitive_field_blocked",
      },
    };
  }

  const fieldRegex = new RegExp(escapeRegExp(field), "i");

  try {
    const byLabelExact = page.getByLabel(field, { exact: true });
    if (await tryFillLocator(byLabelExact, value)) {
      return {
        success: true,
        message: `✅ Filled field by exact label: "${field}"`,
        details: {
          strategy: "label_exact",
          field,
          valuePreview: value.slice(0, 30),
        },
      };
    }
  } catch {
    // Fall through.
  }

  try {
    const byLabelLoose = page.getByLabel(fieldRegex);
    if (await tryFillLocator(byLabelLoose, value)) {
      return {
        success: true,
        message: `✅ Filled field by label match: "${field}"`,
        details: {
          strategy: "label_regex",
          field,
          valuePreview: value.slice(0, 30),
        },
      };
    }
  } catch {
    // Fall through.
  }

  try {
    const byPlaceholderExact = page.getByPlaceholder(field, { exact: true });
    if (await tryFillLocator(byPlaceholderExact, value)) {
      return {
        success: true,
        message: `✅ Filled field by exact placeholder: "${field}"`,
        details: {
          strategy: "placeholder_exact",
          field,
          valuePreview: value.slice(0, 30),
        },
      };
    }
  } catch {
    // Fall through.
  }

  try {
    const byPlaceholderLoose = page.getByPlaceholder(fieldRegex);
    if (await tryFillLocator(byPlaceholderLoose, value)) {
      return {
        success: true,
        message: `✅ Filled field by placeholder match: "${field}"`,
        details: {
          strategy: "placeholder_regex",
          field,
          valuePreview: value.slice(0, 30),
        },
      };
    }
  } catch {
    // Fall through.
  }

  try {
    const byTextboxExact = page.getByRole("textbox", { name: field, exact: true });
    if (await tryFillLocator(byTextboxExact, value)) {
      return {
        success: true,
        message: `✅ Filled textbox by exact accessible name: "${field}"`,
        details: {
          strategy: "textbox_name_exact",
          field,
          valuePreview: value.slice(0, 30),
        },
      };
    }
  } catch {
    // Fall through.
  }

  try {
    const byTextboxLoose = page.getByRole("textbox", { name: fieldRegex });
    if (await tryFillLocator(byTextboxLoose, value)) {
      return {
        success: true,
        message: `✅ Filled textbox by accessible name match: "${field}"`,
        details: {
          strategy: "textbox_name_regex",
          field,
          valuePreview: value.slice(0, 30),
        },
      };
    }
  } catch {
    // Fall through.
  }

  const genericResult = await scanGenericInputs(page, field, value);
  if (genericResult.matched) {
    return {
      success: true,
      message: `✅ Filled field by generic scan: "${genericResult.matchedField}"`,
      details: {
        strategy: genericResult.strategy,
        field,
        matchedField: genericResult.matchedField,
        valuePreview: value.slice(0, 30),
      },
    };
  }

  return {
    success: false,
    message: `⚠️ Could not find a fillable field matching: "${field}"`,
    details: {
      strategy: "no_match",
      field,
    },
  };
}
