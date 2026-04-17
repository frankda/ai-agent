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
