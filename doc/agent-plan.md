# Browser Agent Demo — Step-by-Step Build Plan

## Run Commands (TypeScript)

Use these commands for all local development and execution:

1. Install dependencies:
   - `pnpm install`
2. Type-check only:
   - `pnpm type-check`
3. Build TypeScript to `dist/`:
   - `pnpm build`
4. Run compiled CLI:
   - `pnpm start`
5. Dev shortcut (build + start):
   - `pnpm dev`

## Project Goal

Build a simple browser automation agent in Node.js that:

1. accepts user input from a terminal chat
2. uses an AI parser to convert natural language into structured commands
3. controls a browser using Playwright
4. inspects pages and forms
5. clicks visible elements
6. fills safe input fields
7. evolves into a guided shopping / checkout assistant

This project is being built incrementally, fail-by-fail, with each step adding one clear capability.

---

# High-Level Architecture

The current architecture is:

User input  
→ `src/index.ts`  
→ `src/aiParser.ts`  
→ `src/executor.ts`  
→ browser/page/form action modules

Core flow:

- `src/index.ts` handles terminal input/output
- `src/aiParser.ts` converts user text into a structured command object
- `src/executor.ts` executes the command
- browser modules perform page actions

---

# Current File Roles

## `src/index.ts`
Owns the CLI chat loop.

Responsibilities:
- accept terminal input
- send input to `src/aiParser.ts`
- pass parsed command to `src/executor.ts`
- print results to terminal

## `src/aiParser.ts`
Converts natural language into structured commands.

Examples:
- `open google.com`
- `list buttons`
- `click Gmail`
- `type Frank Da into Name`

## `src/executor.ts`
Routes parsed commands to the correct browser or inspection module.

## `src/browser.ts`
Owns Playwright browser lifecycle and basic navigation.

## `src/pageInspector.ts`
Inspects the current page.

It returns:
- title
- URL
- visible buttons
- visible links

## `src/clickActions.ts`
Clicks visible buttons or links by exact visible text.

## `src/inputActions.ts`
Fills safe text-like fields using:
- labels
- placeholders
- accessible textbox names
- generic DOM scanning fallback

## `src/formInspector.ts`
Inspects fillable fields on the current page and returns:
- labels
- placeholders
- IDs
- names
- aria-labels
- input types
- sensitivity flags

---

# Step-by-Step Build History

## Step 1 — CLI Chat

### Goal
Get a terminal chat loop working.

### What this step does
Allows the user to type commands into the terminal.

### Result
A minimal chat program that accepts user input continuously.

### Why it matters
This is the base interaction loop for the entire agent.

---

## Step 2 — Browser Module

### Goal
Separate browser automation from the chat logic.

### What this step does
Moves Playwright browser startup and website opening into `src/browser.ts`.

### Result
The project becomes modular:
- chat logic stays in `src/index.ts`
- browser control lives in `src/browser.ts`

### Why it matters
This separation is required before adding AI and more complex actions.

---

## Step 3 — Structured Command Flow

### Goal
Move away from hardcoded inline logic.

### What this step does
Introduces the concept of a structured command object.

Examples:
- `{ type: "open_website", target: "google.com" }`
- `{ type: "exit" }`

### Result
The system starts to look like:
- user input
- parsed command
- executed action

### Why it matters
This is the bridge toward AI command parsing.

---

## Step 4 — Executor Layer

### Goal
Separate command execution from chat and parsing.

### What this step does
Introduces `src/executor.ts`.

### Result
`src/executor.ts` becomes the module that decides:
- which action to run
- which browser method to call

### Why it matters
This makes the architecture cleaner and easier to grow.

---

## Step 5 — AI Parser

### Goal
Replace rule-based command parsing with AI-based parsing.

### What this step does
Uses a local model and AI SDK structured output to convert natural language into a command object.

Examples:
- `go to github.com`
- `what page is this`
- `click Gmail`

### Result
The app can understand more natural language instead of relying only on exact string matching.

### Why it matters
This is the first real “agent-like” capability.

---

## Step 6 — Page Inspection

### Goal
Make the agent able to observe the current page.

### What this step does
Introduces `src/pageInspector.ts`.

It extracts:
- page title
- current URL
- visible buttons
- visible links

### Result
The agent can inspect the current page before acting.

### Why it matters
An agent should not just act — it must also observe.

---

## Step 7 — Click Actions

### Goal
Allow the agent to click visible buttons or links by text.

### What this step does
Introduces `src/clickActions.ts`.

Example actions:
- `click Gmail`
- `click Sign in`

### Result
The agent can navigate the UI using visible text.

### Why it matters
This is the first direct browser interaction beyond opening websites.

---

## Step 8 — Input Actions

### Goal
Allow the agent to type into text-like fields.

### What this step does
Introduces `src/inputActions.ts`.

It supports:
- label matching
- placeholder matching
- textbox accessible name matching
- generic DOM fallback scanning

### Result
The agent can fill standard non-sensitive fields.

Examples:
- `type Frank Da into Name`
- `type 0400111222 into Phone`
- `type iPhone into Search`

### Why it matters
This is a key requirement for checkout and shopping workflows.

---

## Step 9 — Form Inspection

### Goal
Allow the agent to discover available inputs before filling them.

### What this step does
Introduces `src/formInspector.ts`.

It scans the current page for fillable fields and returns:
- labels
- placeholders
- names
- IDs
- aria-labels
- autocomplete hints
- field types
- sensitivity flags

### Result
The agent can inspect the form before deciding what to fill.

### Why it matters
This makes input filling much more reliable and is essential for checkout automation.

---

# What Step 9 Means in Practice

Before Step 9:
- the agent tries to fill a field by guessing the field name

After Step 9:
- the agent can inspect the form first
- see exactly what fields exist
- choose the correct field name
- ask the user for missing information more intelligently

Example:

User:
- `list inputs`

Agent:
- Full Name
- Phone Number
- Email Address
- Delivery Address

Then:

User:
- `type Frank Da into Full Name`

This is much more reliable than blindly guessing field names.

---

# Current Capability Summary

At this point, the agent can:

- open websites
- inspect pages
- list buttons
- list links
- click visible elements
- list form fields
- fill safe text fields
- understand natural language commands via AI parser

The current system is already capable of a basic interactive browser assistant workflow.

---

# Remaining Planned Steps

## Step 10 — Guided Checkout State ✅

### Goal
Add persistent session state.

### What this step does
Introduces `src/sessionState.ts` and `src/types/session.ts`.

The state module tracks:
- `deviceModel`, `color`, `storage`, `simChoice`, `contractTerm` — product selections
- `customerName`, `customerPhone`, `customerEmail`, `customerAddress` — customer info
- `journeyStep` — current stage: idle, product_selection, cart, checkout, customer_info, review
- `currentUrl` — updated automatically on every `open_website` command
- `pendingQuestion` — used by future orchestrator to track what is still being asked

### What was implemented
- `src/types/session.ts` — `SessionState` interface and `JourneyStep` union type
- `src/sessionState.ts` — `getState`, `updateState`, `resetState`, `formatState`, `detectCustomerField`
- `show state` / `memory` / `session` command → displays full state in the CLI
- `reset state` / `clear state` command → clears all state back to defaults
- `open_website` now automatically updates `currentUrl` and sets `journeyStep` to `product_selection`
- `fill_input` now automatically captures customer fields (name, phone, email, address) into session state

### How to verify
1. Run: `pnpm build && pnpm start`
2. Type: `show state` — should show all fields as `—`
3. Type: `type Frank Da into Name` — then `show state` — Name should be captured
4. Type: `reset state` — then `show state` — all fields back to `—`
5. Type: `open google.com` — then `show state` — URL and journey step should update

### Why it matters
Without state, the agent only reacts turn-by-turn.
With state, it becomes a real assistant that remembers context across the conversation.

---

## Step 11 — Product Selection Tools ✅

### Goal
Introduce domain-specific product actions.

### What this step does
Move from generic clicks to shopping-specific actions like:
- choose phone model
- choose color
- choose capacity
- add SIM card

### What was implemented

**Core module: `src/shoppingActions.ts`**
- Five main functions for product selection:
  - `selectModel(page, modelName)` — Find and click model options, update state
  - `selectColor(page, colorName)` — Find and click color options, update state
  - `selectStorage(page, capacity)` — Find and click storage capacity options, update state
  - `addSim(page, simChoice)` — Find and click SIM options (eSIM, physical, none), update state
  - `selectContractTerm(page, term)` — Find and click contract term options (12/24/36 months), update state

- Supporting helpers for robust radio/checkbox handling:
  - `getLabelForInput()` — Extracts display text from hidden inputs via aria-label, value, or associated label
  - `tryClickByRadioOrCheckbox()` — Handles styled/hidden radio buttons with multi-strategy approach:
    * Strategy 1: Click associated label element
    * Strategy 2: Normal click on input
    * Strategy 3: Force click on input
    * Strategy 4: Set checked property + dispatch input/change events for JS framework support
    * Verifies checked state after each strategy before returning success
  - `tryClickByButton()` — Fallback for button-based selections
  - `findAllAvailableOptions()` — Collects options from both hidden and visible inputs
  
**Command integration:**
- New commands added to schema:
  - `select_model` — parses "select iPhone 15" or "choose Pro Max"
  - `select_color` — parses "select black" or "choose blue"
  - `select_storage` — parses "select 256GB" or "choose 512GB"
  - `add_sim` — parses "add eSIM" or "select physical SIM"
  - `select_contract` — parses "select 12 months" or "choose 36"
- `src/aiParser.ts` updated:
  - `parseSimpleCommands` now recognizes shopping patterns with regex matching
  - `normalizeCommand` validates shopping commands with target parameters
  - AI system prompt documenting all shopping commands for LLM parser
- `src/executor.ts` updated:
  - Imports shopping action functions
  - New case branches for all four shopping commands
  - Each command validates target, retrieves page, calls shopping function

**Key features:**
- Partial text matching for product options (case-insensitive, substring-based)
- Automatic session state updates via `updateState()`
- User-friendly error messages with available option suggestions
- Real DOM verification: only reports success when input is actually checked
- Compatibility with modern e-commerce sites using styled radio buttons (display: none, opacity: 0)

### How to verify
1. Run: `pnpm build && pnpm start`
2. Type: `select black` on a real phone product page with styled radio buttons
   - Should show `✅ Selected color: Black` if radio became checked
   - Visible UI updates (images, prices) should reflect the color change
3. Debug troubleshooting if UI does not update:
   - Type: `inspect page` to see current page state
   - Type: `list inputs` to see all available form fields
   - Browser DevTools → inspect the radio input to verify:
     * `aria-label` or `value` attribute contains color name
     * Input has `id` with an associated `<label for="id">`
     * Input is hidden with CSS (display: none, opacity: 0)
4. Type: `show state` → Product fields should show selected values if selection succeeded
5. Example workflow:
   ```
   open https://shop.example.com/phone
   select sky blue
   select 256GB
   select eSIM
   show state
   ```

### Debugging insights
- **Hidden radio buttons**: Modern e-commerce sites hide true radio inputs and style labels. The code handles this by:
  - Extracting labels from aria-label, value attributes, or `<label>` elements
  - Using force clicks and event dispatch to trigger JS framework listeners
  - Verifying checked state in DOM before confirming success
- **Bidirectional label matching** (May 1 enhancement): Labels on e-commerce pages are often abbreviated. The matching logic now supports bidirectional substring matching:
  - "12 months" user input can match abbreviated "12" label on page
  - "Silver" user input can match full "Silver" label
  - "Sky Blue" search can find "Sky Blue" label or vice versa
  - Implementation: `labelLower.includes(searchLower) || searchLower.includes(labelLower)`
  - Applies across radio button matching, button fallback, and option suggestions
- **If selection fails**: Check the terminal output for available options; the code suggests what worked: `Try: "select Sky Blue"`
- **If UI doesn't update**: The radio is likely clicked but JavaScript handlers didn't fire. Check browser console for JS errors.

### Why it matters
Shopping-specific commands are more reliable and maintainable than raw clicking on arbitrary buttons.
The agent can now understand high-level product selection intent (e.g., "pick sky blue") rather than requiring exact UI text or button names.
Crucially, the implementation handles **real-world e-commerce challenges**:
- Hidden radio buttons styled with CSS (the norm in modern sites)
- Multiple click strategies for different JavaScript frameworks
- Verification of actual selection state before confirming to user
- Automatic session state capture for checkout continuity

This foundation makes Step 12 (Missing-Information Detection) and Step 14 (Checkout Auto-Fill Loop) much more tractable.

---

## Step 12 — Missing-Information Detection

### Goal
Teach the agent to know what user data is missing.

### What this step does
Use form inspection plus session state to detect:
- what fields are required
- what data is already known
- what the user still needs to provide

### Example
If checkout requires:
- Full Name
- Phone Number
- Email

and only Name is known, the agent asks:
- “I still need your phone number and email.”

### Why it matters
This is the start of a guided checkout assistant.

---

## Step 13 — Multi-Turn Conversation Memory

### Goal
Remember user-provided data across multiple messages.

### What this step does
Store things like:
- product preference
- selected phone model
- preferred color
- provided phone number
- provided email
- whether SIM is needed

### Why it matters
This is required for a realistic shopping assistant.

---

## Step 14 — Checkout Auto-Fill Loop

### Goal
Create a guided form-filling loop.

### What this step does
The agent should:
1. inspect checkout form
2. detect missing fields
3. ask user for missing information
4. fill fields
5. re-check if more information is still needed

### Why it matters
This is where the demo becomes genuinely useful.

---

## Step 15 — Safer Page Progression

### Goal
Move forward through checkout safely.

### What this step does
Allow the agent to:
- click Continue
- click Next
- go to Cart
- go to Checkout

while still:
- asking for confirmation on risky actions
- stopping before irreversible submission

### Why it matters
This lets the agent move through multi-step flows more naturally.

---

## Step 16 — Domain-Specific Shopping Workflow

### Goal
Assemble the full shopping demo.

### What this step does
Implement a narrow, deterministic shopping workflow such as:
- open store
- find iPhone
- choose model
- choose color
- choose storage
- add SIM
- go to cart
- go to checkout
- fill customer information
- stop at review page

### Why it matters
This is the first “demo-complete” milestone.

---

## Step 17 — Logging and Debug Trace

### Goal
Improve debugging and visibility.

### What this step does
Add structured logs for:
- user input
- parsed command
- action taken
- page title
- page URL
- clicked target
- filled field
- errors

Optional additions:
- screenshots
- Playwright trace
- debug replay output

### Why it matters
Browser automation becomes much easier to debug.

---

## Step 18 — Retry and Fallback Logic

### Goal
Make the agent more robust.

### What this step does
Add fallback behaviors like:
- retry a click once if it fails
- retry form fill with another strategy
- inspect form again if field is not found
- inspect page again if navigation changes unexpectedly

### Why it matters
This reduces brittleness and improves demo reliability.

---

## Step 19 — Domain Tools Instead of Raw Actions

### Goal
Move from generic commands to domain-level tools.

### What this step does
Replace low-level actions like:
- `click_text`
- `fill_input`

with high-level tools like:
- `openStore`
- `selectPhoneModel`
- `selectColor`
- `selectCapacity`
- `addSimCard`
- `fillCustomerInfo`

### Why it matters
This is cleaner, safer, and easier to maintain.

---

## Step 20 — Demo Polish

### Goal
Prepare for final presentation/demo.

### What this step does
Improve:
- terminal output
- logging readability
- setup scripts
- README
- sample prompts
- walkthrough instructions
- optional minimal UI if desired

### Why it matters
Makes the project easier to run, explain, and demonstrate.

---

# Recommended Remaining Build Order

From this point, the recommended order is:

1. Step 10 — Guided checkout state
2. Step 11 — Product selection tools
3. Step 12 — Missing-information detection
4. Step 13 — Multi-turn conversation memory
5. Step 14 — Checkout auto-fill loop
6. Step 15 — Safer page progression
7. Step 16 — Full shopping workflow
8. Step 17 — Logging and debug trace
9. Step 18 — Retry and fallback logic
10. Step 19 — Domain-specific tool layer
11. Step 20 — Demo polish

---

# Short Summary

## What the current step (Step 9) does
Step 9 lets the agent inspect the current form and understand what input fields exist.

## Why it matters
This is essential for reliable input filling and future checkout automation.

## What comes next
The next major milestone should be:

**Step 10 — Guided checkout state**

because that is what allows the agent to remember:
- what the user wants
- what data has already been provided
- what is still missing
- where it is in the flow

---

# Final Goal

The final demo should look like this:

1. user types:
   - “I want to buy an iPhone 16 Pro black 256GB with eSIM”
2. agent opens the internal/staging shopping site
3. agent selects product options
4. agent goes to checkout
5. agent inspects form
6. agent asks the user for missing details
7. agent fills those details
8. agent continues to the review page
9. agent stops before final submission

That is the target end state of this build roadmap.