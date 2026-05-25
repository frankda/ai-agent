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

/**
 * Read back the value/text of an element so we can verify the fill stuck.
 * React-controlled inputs sometimes accept Playwright's fill() at the DOM
 * level but discard the value because the synthetic event system didn't
 * see the change. We verify and fall back to the native setter trick.
 */
async function readBackValue(element: Locator): Promise<string> {
  try {
    return await element.evaluate((el) => {
      const html = el as HTMLElement;
      if (html instanceof HTMLInputElement || html instanceof HTMLTextAreaElement) {
        return html.value || "";
      }
      if (html.isContentEditable) {
        return html.textContent || "";
      }
      return (html as HTMLInputElement).value || html.textContent || "";
    });
  } catch {
    return "";
  }
}

async function reactNativeSetterFill(element: Locator, value: string): Promise<boolean> {
  // Uses the underlying native value setter so React's synthetic event system
  // picks up the change. This is the canonical fix for controlled <input>s.
  try {
    await element.evaluate((el, val) => {
      const html = el as HTMLInputElement | HTMLTextAreaElement;
      const proto =
        el.tagName === "TEXTAREA"
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
      if (setter) {
        setter.call(html, val);
      } else {
        html.value = val;
      }
      html.dispatchEvent(new Event("input", { bubbles: true }));
      html.dispatchEvent(new Event("change", { bubbles: true }));
      html.dispatchEvent(new Event("blur", { bubbles: true }));
    }, value);
    return true;
  } catch {
    return false;
  }
}

async function safelyFillElement(element: Locator, value: string): Promise<boolean> {
  try {
    const visible = await element.isVisible().catch(() => false);
    if (!visible) {
      return false;
    }

    const editable = await element.isEditable().catch(() => false);

    if (editable) {
      // Strategy 1: Playwright fill — works for most fields.
      await element.fill("").catch(() => undefined);
      await element.fill(value).catch(() => undefined);
      let actual = await readBackValue(element);
      if (actual === value) return true;

      // Strategy 2: focus + pressSequentially — emits proper keyboard events,
      // some component libraries need this rather than fill().
      await element.focus().catch(() => undefined);
      await element.pressSequentially(value, { delay: 5 }).catch(() => undefined);
      actual = await readBackValue(element);
      if (actual === value) return true;

      // Strategy 3: native value setter + dispatch React-compatible events.
      const set = await reactNativeSetterFill(element, value);
      if (set) {
        actual = await readBackValue(element);
        if (actual === value) return true;
      }

      // If the value matches at least partially, treat as success.
      if (actual && actual.includes(value)) return true;
      // Otherwise we silently failed.
      return false;
    }

    // Non-editable but maybe contenteditable.
    await element.click().catch(() => undefined);
    await element
      .evaluate((el) => {
        if ((el as HTMLElement).isContentEditable) {
          el.textContent = "";
        }
      })
      .catch(() => undefined);

    await element.type(value).catch(() => undefined);
    const actual = await readBackValue(element);
    return actual === value || (actual.length > 0 && actual.includes(value));
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

  const allowSensitive = (process.env.ALLOW_SENSITIVE_FILL || "").toLowerCase() === "true";
  if (isSensitiveField(field) && !allowSensitive) {
    return {
      success: false,
      message: `⛔ Refusing to fill sensitive field: "${field}" (set ALLOW_SENSITIVE_FILL=true to bypass for demos)`,
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
