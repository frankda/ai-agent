import type { Page } from "playwright";
import { scoreLabelMatch } from "./shoppingActions.js";

export interface SelectFieldInfo {
  fieldLabel: string;
  options: { label: string; value: string; selected: boolean }[];
  selectIndex: number;
}

export async function scanSelectFields(page: Page): Promise<SelectFieldInfo[]> {
  try {
    const raw = await page.evaluate(() => {
      function clean(s: string | null | undefined): string {
        return (s || "").replace(/\s+/g, " ").trim();
      }
      function isVisible(el: Element): boolean {
        const html = el as HTMLElement;
        const rect = html.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) return false;
        const style = getComputedStyle(html);
        if (style.display === "none" || style.visibility === "hidden") return false;
        if (parseFloat(style.opacity) === 0) return false;
        return true;
      }
      function findLabel(sel: HTMLSelectElement): string {
        const id = sel.id;
        if (id) {
          const lbl = document.querySelector(`label[for="${id}"]`);
          if (lbl) {
            const text = clean(lbl.textContent);
            if (text) return text;
          }
        }
        const aria = sel.getAttribute("aria-label");
        if (aria) return clean(aria);

        const labelledBy = sel.getAttribute("aria-labelledby");
        if (labelledBy) {
          const parts = labelledBy
            .split(/\s+/)
            .map((id) => clean(document.getElementById(id)?.textContent || ""))
            .filter(Boolean);
          if (parts.length) return parts.join(" ");
        }

        const wrap = sel.closest("label");
        if (wrap) {
          const text = clean(wrap.textContent);
          if (text) return text;
        }

        let prev: Element | null = sel.previousElementSibling;
        let depth = 0;
        while (prev && depth < 4) {
          const t = clean(prev.textContent);
          if (t && t.length < 80) return t;
          prev = prev.previousElementSibling;
          depth += 1;
        }

        return clean(sel.getAttribute("name") || sel.getAttribute("id") || "");
      }

      const selects = Array.from(document.querySelectorAll("select")).filter((s) => isVisible(s));
      return selects.map((s, selectIndex) => {
        const html = s as HTMLSelectElement;
        const fieldLabel = findLabel(html) || `dropdown-${selectIndex}`;
        const options = Array.from(html.options)
          .map((o) => ({
            label: clean(o.textContent),
            value: o.value || "",
            selected: o.selected,
          }))
          .filter((o) => o.label.length > 0);
        return { fieldLabel, options, selectIndex };
      });
    });
    return raw;
  } catch {
    return [];
  }
}

export interface SelectFillResult {
  success: boolean;
  matchedField?: string;
  matchedOption?: string;
  message?: string;
}

export async function fillSelectByLabel(
  page: Page,
  fieldLabel: string,
  optionLabel: string
): Promise<SelectFillResult> {
  const fields = await scanSelectFields(page);
  if (fields.length === 0) {
    return { success: false, message: "No <select> dropdowns visible on this page." };
  }

  const fieldScored = fields
    .map((f) => ({ f, score: scoreLabelMatch(f.fieldLabel, fieldLabel) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (fieldScored.length === 0) {
    const available = fields.map((f) => f.fieldLabel).join(" | ");
    return {
      success: false,
      message: `No <select> matches field label "${fieldLabel}". Available: ${available}`,
    };
  }

  const target = fieldScored[0]!.f;

  const optionScored = target.options
    .map((o) => ({ o, score: scoreLabelMatch(o.label, optionLabel) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (optionScored.length === 0) {
    const opts = target.options
      .map((o) => o.label)
      .filter((l) => l && !/^(--|please select|select)/i.test(l))
      .slice(0, 12)
      .join(" | ");
    return {
      success: false,
      message: `No option in "${target.fieldLabel}" matches "${optionLabel}". Available: ${opts}`,
    };
  }

  const bestOption = optionScored[0]!.o;
  const selectLocator = page.locator("select").nth(target.selectIndex);

  try {
    try {
      await selectLocator.selectOption({ label: bestOption.label });
    } catch {
      await selectLocator.selectOption({ value: bestOption.value });
    }
    await page.waitForTimeout(300);
    return {
      success: true,
      matchedField: target.fieldLabel,
      matchedOption: bestOption.label,
    };
  } catch (e: unknown) {
    const m = e instanceof Error ? e.message : String(e);
    return {
      success: false,
      message: `selectOption failed for "${target.fieldLabel}" -> "${bestOption.label}": ${m}`,
    };
  }
}
