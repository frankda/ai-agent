/**
 * inputActions.js
 * ---------------
 * Fill text-like fields safely and robustly.
 *
 * Supported matching strategies:
 * 1. getByLabel(field)
 * 2. getByPlaceholder(field)
 * 3. getByRole("textbox", { name: field })
 * 4. generic DOM scan using:
 *    - name
 *    - id
 *    - aria-label
 *    - placeholder
 *    - autocomplete
 *    - associated <label for="...">
 * 5. contenteditable elements
 *
 * Safety:
 * - blocks obvious sensitive payment-related fields
 * - does not submit the form
 */

const NON_TEXT_INPUT_TYPES = new Set([
  "hidden",
  "checkbox",
  "radio",
  "submit",
  "button",
  "file",
  "image",
  "range",
  "color",
  "reset",
]);

const SENSITIVE_FIELD_PATTERNS = [
  /card number/i,
  /credit card/i,
  /debit card/i,
  /\bcard\b/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /security code/i,
  /expiry/i,
  /expiration/i,
  /exp date/i,
  /mm\/yy/i,
  /mm-yyyy/i,
  /iban/i,
  /swift/i,
];

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function containsLooseMatch(haystack, needle) {
  return normalizeText(haystack).toLowerCase().includes(normalizeText(needle).toLowerCase());
}

function isSensitiveField(fieldName) {
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName || ""));
}

async function safelyFillElement(element, value) {
  try {
    const visible = await element.isVisible().catch(() => false);
    if (!visible) return false;

    const editable = await element.isEditable().catch(() => false);

    if (editable) {
      await element.fill("");
      await element.fill(value);
      return true;
    }

    // fallback for contenteditable or non-standard editable elements
    await element.click().catch(() => {});
    await element.evaluate((el) => {
      if (el.isContentEditable) {
        el.textContent = "";
      }
    }).catch(() => {});

    await element.type(value).catch(() => {});

    return true;
  } catch {
    return false;
  }
}

async function tryFillLocator(locator, value) {
  const count = await locator.count().catch(() => 0);

  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);
    const ok = await safelyFillElement(item, value);
    if (ok) return true;
  }

  return false;
}

async function getAssociatedLabelText(page, idValue) {
  if (!idValue) return "";

  try {
    const label = page.locator(`label[for="${idValue}"]`).first();
    const exists = await label.count().catch(() => 0);
    if (!exists) return "";

    const text = await label.innerText().catch(() => "");
    return normalizeText(text);
  } catch {
    return "";
  }
}

async function scanGenericInputs(page, field, value) {
  const locator = page.locator("input, textarea, [contenteditable='true'], [contenteditable=''], [contenteditable='plaintext-only']");
  const count = await locator.count().catch(() => 0);

  for (let i = 0; i < count; i++) {
    const item = locator.nth(i);

    try {
      const visible = await item.isVisible().catch(() => false);
      if (!visible) continue;

      const tagName = (await item.evaluate((el) => el.tagName.toLowerCase()).catch(() => "")) || "";
      const typeAttr = ((await item.getAttribute("type").catch(() => "")) || "").toLowerCase();

      if (tagName === "input" && NON_TEXT_INPUT_TYPES.has(typeAttr)) {
        continue;
      }

      const editable =
        (await item.isEditable().catch(() => false)) ||
        (await item.evaluate((el) => !!el.isContentEditable).catch(() => false));

      if (!editable) continue;

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

      if (!matched) continue;

      const ok = await safelyFillElement(item, value);
      if (ok) {
        return {
          matched: true,
          strategy: "generic_dom_scan",
          matchedField:
            associatedLabel ||
            ariaLabel ||
            placeholder ||
            nameAttr ||
            idAttr ||
            autocomplete ||
            field,
        };
      }
    } catch {
      // ignore candidate failure
    }
  }

  return {
    matched: false,
  };
}

async function fillInputField(page, rawField, rawValue) {
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

  // 1) Exact label
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
  } catch {}

  // 2) Loose label
  try {
    const byLabelLoose = page.getByLabel(new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
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
  } catch {}

  // 3) Exact placeholder
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
  } catch {}

  // 4) Loose placeholder
  try {
    const byPlaceholderLoose = page.getByPlaceholder(
      new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i")
    );
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
  } catch {}

  // 5) Textbox exact accessible name
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
  } catch {}

  // 6) Textbox loose accessible name
  try {
    const byTextboxLoose = page.getByRole("textbox", {
      name: new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"),
    });
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
  } catch {}

  // 7) Generic DOM scan fallback
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

module.exports = {
  fillInputField,
  isSensitiveField,
};