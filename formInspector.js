/**
 * formInspector.js
 * ----------------
 * Inspects fillable form fields on the current page.
 *
 * Extracts:
 * - label text
 * - placeholder
 * - name / id
 * - aria-label
 * - input type
 * - editable status
 * - sensitivity flag
 *
 * This is a READ-ONLY inspector (no typing, no clicking).
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
  /iban/i,
  /swift/i,
];

function normalizeText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function isSensitiveField(text) {
  return SENSITIVE_FIELD_PATTERNS.some((p) => p.test(text || ""));
}

async function getAssociatedLabel(page, id) {
  if (!id) return "";

  try {
    const label = page.locator(`label[for="${id}"]`).first();
    if ((await label.count().catch(() => 0)) === 0) return "";
    return normalizeText(await label.innerText());
  } catch {
    return "";
  }
}

async function inspectFormFields(page) {
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
  const fields = [];

  for (let i = 0; i < count; i++) {
    const el = locator.nth(i);

    try {
      const visible = await el.isVisible().catch(() => false);
      if (!visible) continue;

      const tagName = (await el.evaluate((n) => n.tagName.toLowerCase()).catch(() => "")) || "";
      const typeAttr = ((await el.getAttribute("type").catch(() => "")) || "").toLowerCase();

      if (tagName === "input" && NON_TEXT_INPUT_TYPES.has(typeAttr)) continue;

      const editable =
        (await el.isEditable().catch(() => false)) ||
        (await el.evaluate((n) => !!n.isContentEditable).catch(() => false));

      if (!editable) continue;

      const name = normalizeText(await el.getAttribute("name").catch(() => ""));
      const id = normalizeText(await el.getAttribute("id").catch(() => ""));
      const placeholder = normalizeText(await el.getAttribute("placeholder").catch(() => ""));
      const ariaLabel = normalizeText(await el.getAttribute("aria-label").catch(() => ""));
      const autocomplete = normalizeText(await el.getAttribute("autocomplete").catch(() => ""));
      const label = await getAssociatedLabel(page, id);

      const displayName =
        label ||
        ariaLabel ||
        placeholder ||
        name ||
        id ||
        autocomplete ||
        "unknown";

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
      // skip broken elements
    }
  }

  return {
    success: true,
    message: `✅ Found ${fields.length} fillable field(s).`,
    fields,
  };
}

module.exports = {
  inspectFormFields,
};
``