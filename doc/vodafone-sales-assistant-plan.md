# Intelligent Sales Assistant Plan (Vodafone iPhone Flow)

> **Status (2026-05-05): SUPERSEDED.** Steps A1–A12 below described a per-page command-extension approach that scoped only to clicking "Select this phone". The implementation pivoted to a generic **agent-loop-with-tools** architecture that reaches the checkout page. See [agent-plan.md Step 12](agent-plan.md) and the source modules `src/agent.ts`, `src/agentTools.ts`, `src/pageReader.ts`, `src/types/agentAction.ts` for the live design.

This plan covers a conversational sales assistant that understands natural-language purchase requests and autonomously performs browser-based purchasing steps.

Scope for this phase:
- End after clicking "Select this phone"
- Do not continue checkout chaining yet

Locked decisions:
- Always ask user first for missing preferences (no auto-defaults)
- If exact target page/model is unavailable, fail and ask for a new URL
- Always require explicit confirmation before clicking "Select this phone"

## Step A1 — Purchase Intent Contract

### Goal
Define a structured purchase-intent contract that can carry extracted model/color/storage/contract details.

### What this step does
- Extend command and result typing to support orchestrated purchase flow
- Preserve compatibility with the existing parser to executor flow

### Verification
1. Run pnpm type-check.
2. Confirm no type errors for command/result unions.
3. Confirm purchase intent fields are representable in typed objects without using any.

---

## Step A2 — Natural Language Purchase Intent Recognition

### Goal
Teach the parser to recognize purchase-language requests like:
- "I want to order an iPhone 17 Pro Max"
- "Buy iPhone 17 Pro Max"

### What this step does
- Update parser rules and AI prompt guidance
- Map purchase intent to the new orchestrated command path

### Verification
1. Run parser test cases or manual parser checks for at least 5 natural-language variants.
2. Confirm output resolves to purchase-flow command(s), not unknown.
3. Confirm model token extraction is present when model appears in user text.

---

## Step A3 — Target URL Policy Enforcement

### Goal
Enforce strict behavior when product URL/model page is unavailable.

### What this step does
- Attempt configured target page
- If unavailable or mismatched, return a clarification/failure response asking user for a new URL
- Do not auto-fallback to base listing page

### Verification
1. Simulate valid target URL and confirm flow proceeds.
2. Simulate invalid or mismatched URL and confirm assistant asks for a new URL.
3. Confirm no automatic redirection to base listing in failure case.

---

## Step A4 — Purchase Orchestrator in Executor

### Goal
Add a journey-aware orchestration path in executor.

### What this step does
- Perform sequence: open browser, navigate target, inspect page, extract options
- Store extracted options and progress state for follow-up conversation turns

### Verification
1. Run pnpm build and pnpm start.
2. Send: "I want to order an iPhone 17 Pro Max".
3. Confirm browser opens the target page and returns structured option data (if available).
4. Confirm state reflects current journey stage.

---

## Step A5 — Structured Option Extraction (Color/Storage/Contract)

### Goal
Extract configurable product options in grouped form before selection.

### What this step does
- Add or extend read-first extraction helpers
- Return grouped options for color, storage, and contract/payment terms

### Verification
1. Run option extraction on target page.
2. Confirm response includes grouped lists (not one mixed option list).
3. Confirm each group is human-readable and stable across repeated scans.

---

## Step A6 — Session Flow State Extension

### Goal
Track purchase progress and missing attributes explicitly.

### What this step does
- Extend session state with:
  - flow stage
  - presented options
  - selected values
  - missing required fields
  - confirmation readiness

### Verification
1. Run show state before and after purchase-intent message.
2. Confirm stage and option payload fields are populated.
3. Confirm missing-field list updates as user answers questions.

---

## Step A7 — Missing Information Detector (Ask-First)

### Goal
Ask clarification questions for missing preferences, one at a time.

### What this step does
- Detect missing among model, color, storage, and contract
- Prompt user without applying defaults
- Move to next missing field only after valid answer

### Verification
1. Start with message containing only model.
2. Confirm first follow-up asks for color (or next required field by rule).
3. Answer question and confirm next missing field is asked.
4. Confirm no default value is auto-selected at any point.

---

## Step A8 — User Revision Loop

### Goal
Allow user to modify previous selections before final confirmation.

### What this step does
- Support conversational updates like:
  - "change color to silver"
  - "make it 512GB instead"
- Recompute summary after each change

### Verification
1. Complete preliminary selection set.
2. Change one field via natural language.
3. Confirm state and summary reflect updated value and preserve others.

---

## Step A9 — Mandatory Final Confirmation Gate

### Goal
Require explicit approval before clicking "Select this phone".

### What this step does
- Generate a final summary with model, color, storage, and contract term
- Wait for explicit confirmation command or intent

### Verification
1. Reach confirmation stage with all required fields present.
2. Send non-confirmation text and confirm click is not executed.
3. Send explicit confirmation and confirm system proceeds to click step.

---

## Step A10 — Click "Select this phone" and Stop

### Goal
Execute final action for this phase and stop.

### What this step does
- Click "Select this phone"
- Report success or failure
- Terminate this scoped flow (no checkout continuation)

### Verification
1. Complete flow through confirmation.
2. Confirm "Select this phone" is clicked once.
3. Confirm assistant reports phase completion and does not continue to checkout.

---

## Step A11 — Error Recovery In-Stage

### Goal
Handle extraction/click failures without losing conversation state.

### What this step does
- On failure, stay in current stage
- Offer options: retry, rescan, modify selection

### Verification
1. Force an action failure (missing target label or stale page).
2. Confirm assistant remains in current stage.
3. Confirm assistant offers a recovery path and accepts follow-up action.

---

## Step A12 — End-to-End Scenario Validation

### Goal
Validate full scenario behavior for this phase.

### What this step does
Run the exact conversation pattern and ensure expected stage transitions.

### Verification
1. Run pnpm build and pnpm start.
2. Execute scenario:
   - "I want to order an iPhone 17 Pro Max"
   - answer missing-option questions
   - review summary
   - confirm selection
3. Confirm final outcome reaches "Select this phone" click and stops there.
4. Capture any page-label mismatches for the next iteration.

---

## Suggested Implementation Order

1. Step A1
2. Step A2
3. Step A3
4. Step A4
5. Step A5
6. Step A6
7. Step A7
8. Step A8
9. Step A9
10. Step A10
11. Step A11
12. Step A12
