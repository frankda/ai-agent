# AI Shopping Agent Demo — Implementation Plan

## 1. Project Summary

Build a demo AI agent in Node.js that uses a local LLM to understand a user’s shopping intent from chat, then uses browser automation to operate an internal or staging shopping website.

The agent should:
- understand natural language requests like “I want to buy an iPhone 16 Pro in black with 256GB and add an eSIM”
- extract structured shopping intent from conversation
- navigate a browser using Playwright
- select product variations such as model, color, storage, and accessories
- continue through a staged checkout flow
- ask the user for missing required information such as full name and phone number
- fill that information into the checkout form
- stop at the final review/confirmation step instead of placing a real order

This project is a demo/prototype, so the design should prioritize:
- simplicity
- clarity
- stability
- safe behavior
- easy debugging
- clean architecture for future expansion

---

## 2. Primary Goal

Create a working end-to-end demo that proves the following concept:

> A local-LLM-powered assistant can understand a shopping request from chat, control a browser in a deterministic way, collect missing information interactively, and advance the workflow until the review step.

---

## 3. Non-Goals

The following are explicitly out of scope for the first version:

- submitting real purchases
- entering or processing payment details
- bypassing MFA, OTP, CAPTCHA, or identity checks
- arbitrary browsing across unknown external websites
- handling every possible product category
- building a generic autonomous browser agent
- long-term memory or personalization
- multi-user production hardening
- distributed infrastructure

The first version should be domain-specific and intentionally constrained.

---

## 4. Supported Demo Scenario

The first version only needs to support one narrow scenario:

### Supported journey
1. User opens chat
2. User says they want to buy an iPhone
3. Agent extracts:
   - phone model
   - color
   - storage/capacity
   - whether SIM is needed
   - SIM type if applicable
4. Agent opens the internal/staging shopping site
5. Agent navigates to the phone catalog
6. Agent selects the requested device
7. Agent selects the requested configuration
8. Agent adds a SIM card if requested
9. Agent goes to cart / checkout
10. If required checkout info is missing, the agent asks the user for it
11. Agent fills the provided customer information
12. Agent continues to the review page
13. Agent stops before final submission and reports status

### Initial supported product family
- iPhone only

### Initial supported variants
- Model
- Color
- Storage
- SIM / eSIM add-on

---

## 5. High-Level Architecture

Use a constrained agent architecture rather than a fully autonomous browser agent.

### Principle
The LLM should not directly click arbitrary selectors or type arbitrary raw commands into the browser.

Instead, the LLM should only be allowed to call approved business-level tools.

### Architecture layers

#### 5.1 Chat / API Layer
Responsible for:
- receiving user messages
- maintaining conversation state
- triggering the planning/execution loop
- sending questions back to the user when required data is missing

#### 5.2 LLM Reasoning Layer
Responsible for:
- interpreting user intent
- extracting structured shopping parameters
- deciding which approved tool to call next
- deciding when more user information is required
- deciding when to stop

This layer should work with a local model.

#### 5.3 Tool Layer
Expose domain-safe actions such as:
- openStore()
- goToPhones()
- selectIPhoneModel()
- selectColor()
- selectCapacity()
- addSimCard()
- openCart()
- goToCheckout()
- fillCustomerInfo()
- getPageState()
- stopBeforeFinalSubmit()

These tools act as the only interface between the LLM and browser automation.

#### 5.4 Browser Automation Layer
Use Playwright to:
- launch browser
- navigate pages
- locate elements
- click buttons
- select options
- fill forms
- collect page state

#### 5.5 State Layer
Maintain:
- conversation state
- extracted shopping intent
- current workflow step
- missing fields
- selected options
- browser session reference
- execution log

---

## 6. Recommended Tech Stack

### Runtime
- Node.js
- TypeScript

### AI
- Vercel AI SDK
- Local LLM through either:
  - Ollama
  - or an OpenAI-compatible local endpoint

### Automation
- Playwright

### Validation / schemas
- Zod

### Optional web server
- Express or Next.js API route
- keep minimal for demo simplicity

### Optional UI
- simple terminal chat or minimal web chat UI
- avoid spending too much time on UI in first version

---

## 7. Design Principles

### 7.1 Constrained Tool Use
The AI must only use approved business actions, not raw browser primitives.

### 7.2 Deterministic Automation
Use robust Playwright locators and deterministic flows.

### 7.3 Human-in-the-Loop
The agent must ask for missing required data and must not finalize a real order.

### 7.4 Debuggability
Every step should produce logs:
- tool chosen
- tool input
- page URL
- selected options
- errors
- screenshots or traces if needed

### 7.5 Narrow Scope First
Support one product family and one purchase path first.

### 7.6 Graceful Failure
If an option is unavailable or UI changes, the system should:
- retry carefully
- ask for clarification
- or fail with a clear explanation

---

## 8. Functional Requirements

### 8.1 Conversation Handling
The system must:
- accept free-text user requests
- extract shopping parameters
- track missing required information
- ask follow-up questions when necessary

### 8.2 Intent Extraction
The system must identify:
- product type
- model
- color
- capacity
- SIM requirement
- SIM type
- customer full name
- phone number

### 8.3 Browser Actions
The system must be able to:
- open the store
- navigate to phone category
- choose a supported iPhone model
- choose a valid color
- choose a valid capacity
- add SIM card if requested
- move to cart
- move to checkout
- fill customer info

### 8.4 Checkout Data Collection
If checkout page requires information that has not been provided, the system must ask the user before proceeding.

### 8.5 Safety Stop
The system must stop at the final review or confirmation step.

---

## 9. Non-Functional Requirements

### 9.1 Reliability
- should complete the happy path consistently on the demo site

### 9.2 Maintainability
- use modular folder structure
- separate AI logic from browser logic

### 9.3 Testability
- core intent extraction and tool orchestration should be unit-testable
- browser flow should have integration tests where feasible

### 9.4 Observability
- structured logs for each step
- optional Playwright traces/screenshots

### 9.5 Local-First
- model inference should work locally

---

## 10. Suggested Folder Structure

```text
project-root/
├─ src/
│  ├─ agent/
│  │  ├─ prompts/
│  │  ├─ schemas/
│  │  ├─ shoppingAgent.ts
│  │  ├─ planner.ts
│  │  └─ conversationState.ts
│  ├─ browser/
│  │  ├─ browserManager.ts
│  │  ├─ storeTools.ts
│  │  ├─ pageState.ts
│  │  └─ locators.ts
│  ├─ app/
│  │  ├─ api.ts
│  │  └─ server.ts
│  ├─ ui/
│  │  └─ demoChat.ts
│  ├─ utils/
│  │  ├─ logger.ts
│  │  ├─ errors.ts
│  │  └─ config.ts
│  └─ index.ts
├─ tests/
│  ├─ unit/
│  └─ e2e/
├─ docs/
│  ├─ ai-shopping-agent-plan.md
│  ├─ architecture.md
│  └─ decisions.md
├─ .env.example
├─ package.json
├─ tsconfig.json
└─ README.md
