import type { Locator, Page } from "playwright";
import type { ExecutionResult } from "./types/results.js";
import { updateState } from "./sessionState.js";

/**
 * Finds the label text for an input element (by id or aria-label).
 */
async function getLabelForInput(page: Page, inputElement: Locator): Promise<string | null> {
  try {
    // First try aria-label
    const ariaLabel = await inputElement.getAttribute("aria-label").catch(() => null);
    if (ariaLabel) {
      return ariaLabel;
    }

    // Try value attribute
    const value = await inputElement.getAttribute("value").catch(() => null);
    if (value) {
      return value;
    }

    // Try associated label by ID
    const inputId = await inputElement.getAttribute("id").catch(() => null);
    if (inputId) {
      const associatedLabel = page.locator(`label[for="${inputId}"]`);
      const labelText = await associatedLabel.innerText().catch(() => null);
      if (labelText) {
        return labelText.trim();
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Tries to find and click a form input (radio or checkbox) matching the search term.
 * Radio/checkbox inputs are often hidden with CSS, so we try to click them even if not visible,
 * or we click their associated label.
 */
async function tryClickByRadioOrCheckbox(
  page: Page,
  searchTerm: string
): Promise<{ success: boolean; matchedText?: string }> {
  const inputLocator = page.locator("input[type='radio'], input[type='checkbox']");
  const count = await inputLocator.count().catch(() => 0);
  const searchLower = searchTerm.toLowerCase();

  for (let i = 0; i < count; i++) {
    try {
      const item = inputLocator.nth(i);

      // Get label text (aria-label, value, or associated label)
      const labelText = await getLabelForInput(page, item);

      if (!labelText) {
        continue;
      }

      const labelLower = labelText.toLowerCase();

      // Check for substring match (bidirectional: label contains search OR search contains label)
      if (labelLower.includes(searchLower) || searchLower.includes(labelLower)) {
        const isChecked = async (): Promise<boolean> => {
          return item.isChecked().catch(() => false);
        };

        const waitForUiSettle = async (): Promise<void> => {
          await page.waitForTimeout(250).catch(() => undefined);
        };

        if (await isChecked()) {
          return {
            success: true,
            matchedText: labelText,
          };
        }

        const inputId = await item.getAttribute("id").catch(() => null);

        // Strategy 1: click associated label (most realistic for styled radios)
        if (inputId) {
          const label = page.locator(`label[for="${inputId}"]`).first();
          const hasLabel = (await label.count().catch(() => 0)) > 0;

          if (hasLabel) {
            await label.click({ force: true }).catch(() => undefined);
            await waitForUiSettle();

            if (await isChecked()) {
              return {
                success: true,
                matchedText: labelText,
              };
            }
          }
        }

        // Strategy 2: normal click on input
        await item.click().catch(() => undefined);
        await waitForUiSettle();

        if (await isChecked()) {
          return {
            success: true,
            matchedText: labelText,
          };
        }

        // Strategy 3: force click on input
        await item.click({ force: true }).catch(() => undefined);
        await waitForUiSettle();

        if (await isChecked()) {
          return {
            success: true,
            matchedText: labelText,
          };
        }

        // Strategy 4: as a last resort, set checked and dispatch events so framework listeners run
        await item
          .evaluate((el: HTMLInputElement) => {
            el.checked = true;
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
          })
          .catch(() => undefined);

        await waitForUiSettle();

        if (await isChecked()) {
          return {
            success: true,
            matchedText: labelText,
          };
        }

        // Matched by label but selection did not stick.
        continue;
      }
    } catch {
      // Ignore individual failures.
    }
  }

  return { success: false };
}

/**
 * Tries to find and click a button matching the search term.
 * Uses substring matching with case-insensitive comparison.
 */
async function tryClickByButton(
  page: Page,
  searchTerm: string
): Promise<{ success: boolean; matchedText?: string }> {
  const buttonLocator = page.locator("button, input[type='button'], input[type='submit'], [role='button']");
  const count = await buttonLocator.count().catch(() => 0);
  const searchLower = searchTerm.toLowerCase();

  for (let i = 0; i < count; i++) {
    try {
      const item = buttonLocator.nth(i);
      const visible = await item.isVisible().catch(() => false);

      if (!visible) {
        continue;
      }

      let text = await item.innerText().catch(() => "");
      text = text.replace(/\s+/g, " ").trim();

      if (!text) {
        continue;
      }

      const textLower = text.toLowerCase();

      // Check for substring match (bidirectional: label contains search OR search contains label)
      if (textLower.includes(searchLower) || searchLower.includes(textLower)) {
        await item.click().catch(() => undefined);
        await page.waitForLoadState("domcontentloaded").catch(() => undefined);

        return {
          success: true,
          matchedText: text,
        };
      }
    } catch {
      // Ignore individual failures.
    }
  }

  return { success: false };
}

/**
 * Collects all available options from radio/checkbox inputs and buttons.
 */
async function findAllAvailableOptions(page: Page): Promise<string[]> {
  const options: string[] = [];

  // Collect from radio/checkbox inputs (even if hidden, they might have labels)
  const inputLocator = page.locator("input[type='radio'], input[type='checkbox']");
  const inputCount = await inputLocator.count().catch(() => 0);

  for (let i = 0; i < inputCount; i++) {
    try {
      const item = inputLocator.nth(i);
      const labelText = await getLabelForInput(page, item);
      if (labelText && !options.includes(labelText)) {
        options.push(labelText);
      }
    } catch {
      // Ignore
    }
  }

  // Collect from buttons (only visible ones)
  const buttonLocator = page.locator("button, input[type='button'], input[type='submit'], [role='button']");
  const buttonCount = await buttonLocator.count().catch(() => 0);

  for (let i = 0; i < Math.min(buttonCount, 20); i++) {
    try {
      const item = buttonLocator.nth(i);
      const visible = await item.isVisible().catch(() => false);
      if (visible) {
        let text = await item.innerText().catch(() => "");
        text = text.replace(/\s+/g, " ").trim();
        if (text && !options.includes(text)) {
          options.push(text);
        }
      }
    } catch {
      // Ignore
    }
  }

  return options;
}

/**
 * Finds a button or option matching the selection term.
 * Returns all matching candidates for logging.
 */
async function findMatchingOptions(page: Page, searchTerm: string): Promise<string[]> {
  const allOptions = await findAllAvailableOptions(page);
  const searchLower = searchTerm.toLowerCase();

  // Find all options that contain the search term or vice versa (bidirectional matching)
  const matching = allOptions
    .filter((text) => text.toLowerCase().includes(searchLower) || searchLower.includes(text.toLowerCase()))
    .filter((text, idx, arr) => arr.indexOf(text) === idx); // Deduplicate

  return matching;
}

/**
 * Attempts to select a product model.
 * Looks for radio/checkbox inputs or buttons containing the model name.
 */
export async function selectModel(page: Page | undefined, modelName: string): Promise<ExecutionResult> {
  if (!page) {
    return {
      success: false,
      message: "⚠️ No page is open.",
    };
  }

  const normalized = (modelName || "").trim();

  if (!normalized) {
    return {
      success: false,
      message: "⚠️ No model name provided.",
    };
  }

  // Try radio/checkbox inputs first
  let result = await tryClickByRadioOrCheckbox(page, normalized);

  if (result.success) {
    updateState({ deviceModel: normalized });
    return {
      success: true,
      message: `✅ Selected model: ${result.matchedText}`,
    };
  }

  // Fall back to buttons
  result = await tryClickByButton(page, normalized);

  if (result.success) {
    updateState({ deviceModel: normalized });
    return {
      success: true,
      message: `✅ Selected model: ${result.matchedText}`,
    };
  }

  const candidates = await findMatchingOptions(page, normalized);

  if (candidates.length > 0) {
    return {
      success: false,
      message:
        `⚠️ Could not click model "${normalized}".` +
        `\nAvailable options: ${candidates.slice(0, 5).join(", ")}` +
        (candidates.length > 5 ? "..." : "") +
        `\nTry: "select ${candidates[0]}"`,
    };
  }

  return {
    success: false,
    message: `⚠️ Could not find model option matching "${normalized}".`,
  };
}

/**
 * Attempts to select a color.
 * Looks for radio/checkbox inputs or buttons containing the color name.
 */
export async function selectColor(page: Page | undefined, colorName: string): Promise<ExecutionResult> {
  if (!page) {
    return {
      success: false,
      message: "⚠️ No page is open.",
    };
  }

  const normalized = (colorName || "").trim();

  if (!normalized) {
    return {
      success: false,
      message: "⚠️ No color provided.",
    };
  }

  // Try radio/checkbox inputs first
  let result = await tryClickByRadioOrCheckbox(page, normalized);

  if (result.success) {
    updateState({ color: normalized });
    return {
      success: true,
      message: `✅ Selected color: ${result.matchedText}`,
    };
  }

  // Fall back to buttons
  result = await tryClickByButton(page, normalized);

  if (result.success) {
    updateState({ color: normalized });
    return {
      success: true,
      message: `✅ Selected color: ${result.matchedText}`,
    };
  }

  const candidates = await findMatchingOptions(page, normalized);

  if (candidates.length > 0) {
    return {
      success: false,
      message:
        `⚠️ Could not click color "${normalized}".` +
        `\nAvailable options: ${candidates.slice(0, 5).join(", ")}` +
        (candidates.length > 5 ? "..." : "") +
        `\nTry: "select ${candidates[0]}"`,
    };
  }

  return {
    success: false,
    message: `⚠️ Could not find color option matching "${normalized}".`,
  };
}

/**
 * Attempts to select storage capacity.
 * Looks for radio/checkbox inputs or buttons containing the capacity.
 */
export async function selectStorage(page: Page | undefined, capacity: string): Promise<ExecutionResult> {
  if (!page) {
    return {
      success: false,
      message: "⚠️ No page is open.",
    };
  }

  const normalized = (capacity || "").trim();

  if (!normalized) {
    return {
      success: false,
      message: "⚠️ No storage capacity provided.",
    };
  }

  // Try radio/checkbox inputs first
  let result = await tryClickByRadioOrCheckbox(page, normalized);

  if (result.success) {
    updateState({ storage: normalized });
    return {
      success: true,
      message: `✅ Selected storage: ${result.matchedText}`,
    };
  }

  // Fall back to buttons
  result = await tryClickByButton(page, normalized);

  if (result.success) {
    updateState({ storage: normalized });
    return {
      success: true,
      message: `✅ Selected storage: ${result.matchedText}`,
    };
  }

  const candidates = await findMatchingOptions(page, normalized);

  if (candidates.length > 0) {
    return {
      success: false,
      message:
        `⚠️ Could not click storage "${normalized}".` +
        `\nAvailable options: ${candidates.slice(0, 5).join(", ")}` +
        (candidates.length > 5 ? "..." : "") +
        `\nTry: "select ${candidates[0]}"`,
    };
  }

  return {
    success: false,
    message: `⚠️ Could not find storage option matching "${normalized}".`,
  };
}

/**
 * Attempts to add or select a SIM option (eSIM, physical SIM, no SIM, etc.).
 * Looks for radio/checkbox inputs or buttons containing the SIM option.
 */
export async function addSim(page: Page | undefined, simChoice: string): Promise<ExecutionResult> {
  if (!page) {
    return {
      success: false,
      message: "⚠️ No page is open.",
    };
  }

  const normalized = (simChoice || "").trim();

  if (!normalized) {
    return {
      success: false,
      message: "⚠️ No SIM choice provided.",
    };
  }

  // Try radio/checkbox inputs first
  let result = await tryClickByRadioOrCheckbox(page, normalized);

  if (result.success) {
    updateState({ simChoice: normalized });
    return {
      success: true,
      message: `✅ Selected SIM: ${result.matchedText}`,
    };
  }

  // Fall back to buttons
  result = await tryClickByButton(page, normalized);

  if (result.success) {
    updateState({ simChoice: normalized });
    return {
      success: true,
      message: `✅ Selected SIM: ${result.matchedText}`,
    };
  }

  const candidates = await findMatchingOptions(page, normalized);

  if (candidates.length > 0) {
    return {
      success: false,
      message:
        `⚠️ Could not click SIM option "${normalized}".` +
        `\nAvailable options: ${candidates.slice(0, 5).join(", ")}` +
        (candidates.length > 5 ? "..." : "") +
        `\nTry: "select ${candidates[0]}"`,
    };
  }

  return {
    success: false,
    message: `⚠️ Could not find SIM option matching "${normalized}".`,
  };
}

/**
 * Attempts to select a contract term (12 months, 24 months, 36 months, etc.).
 * Looks for radio/checkbox inputs or buttons containing the contract term.
 */
export async function selectContractTerm(page: Page | undefined, contractTerm: string): Promise<ExecutionResult> {
  if (!page) {
    return {
      success: false,
      message: "⚠️ No page is open.",
    };
  }

  const normalized = (contractTerm || "").trim();

  if (!normalized) {
    return {
      success: false,
      message: "⚠️ No contract term provided.",
    };
  }

  // Try radio/checkbox inputs first
  let result = await tryClickByRadioOrCheckbox(page, normalized);

  if (result.success) {
    updateState({ contractTerm: normalized });
    return {
      success: true,
      message: `✅ Selected contract term: ${result.matchedText}`,
    };
  }

  // Fall back to buttons
  result = await tryClickByButton(page, normalized);

  if (result.success) {
    updateState({ contractTerm: normalized });
    return {
      success: true,
      message: `✅ Selected contract term: ${result.matchedText}`,
    };
  }

  const candidates = await findMatchingOptions(page, normalized);

  if (candidates.length > 0) {
    return {
      success: false,
      message:
        `⚠️ Could not click contract term "${normalized}".` +
        `\nAvailable options: ${candidates.slice(0, 5).join(", ")}` +
        (candidates.length > 5 ? "..." : "") +
        `\nTry: "select ${candidates[0]}"`,
    };
  }

  return {
    success: false,
    message: `⚠️ Could not find contract term option matching "${normalized}".`,
  };
}
