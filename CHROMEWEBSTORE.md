# Chrome Web Store Listing — AIR10 AI Audio Accelerator

> Tagline: Free Gemini + ChatGPT Read Aloud Speed Controller 🚀

> Last Updated: 2026-09-05

## Store Listing

**Extension Name** [REQUIRED]
AIR10 AI Audio Accelerator

**Short Description** [REQUIRED]
Accelerate Google Gemini and ChatGPT Read Aloud audio with instant 5-speed ladder (up to 3.0x), Option+S shortcut, and anti-reset watchdog.

**Detailed Description** [REQUIRED]
AIR10 AI Audio Accelerator turbocharges your study and reading flow on Google Gemini and OpenAI ChatGPT by giving you full control over native voice playback speeds.

Key Features:
- 5-Speed Audio Ladder: Instantly switch between 1.5x, 1.75x, 2.0x (Default), 2.5x, and 3.0x speeds.
- Fast Keyboard Toggle: Press Option+S (Alt+S on Windows/Linux) to cycle speeds instantly without leaving the keyboard. Includes smart typing protection so shortcuts never trigger while typing prompts.
- Gemini Streaming Audio Hook: Hooks into native Web Audio API AudioBufferSourceNode chunks so Gemini speaks at high speed without crackling or delay.
- ChatGPT Watchdog: Intercepts dynamic HTMLAudioElement instances and prevents ChatGPT from resetting playback rates between turns.
- Pitch Preservation: Crystal-clear audio quality with automatic pitch correction enabled.
- Minimalist HUD Pill: Clean on-screen visual confirmation of your current playback speed that fades automatically.
- Zero Data Collection: Runs 100% locally in your browser. No analytics, no accounts, and zero network calls.

How to Use:
1. Open Google Gemini (gemini.google.com) or ChatGPT (chatgpt.com).
2. Click the native "Listen" or "Read Aloud" button on any AI response.
3. The audio immediately plays at 2.0x speed.
4. Press Option+S (or Alt+S) anytime to cycle through 1.5x, 1.75x, 2.0x, 2.5x, or 3.0x.

Privacy & Permissions:
This extension only activates on gemini.google.com and chatgpt.com to attach audio speed hooks. It never reads or transmits your conversations, prompts, or personal data.

Category:
Productivity

Single Purpose:
Provides persistent speed acceleration and keyboard shortcuts for native Read Aloud voice playback on Google Gemini and ChatGPT.

Primary Language:
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Extension Icon 48 | 48×48 PNG | ✅ Ready | `icons/icon-48.png` |
| Toolbar Icon 16 | 16×16 PNG | ✅ Ready | `icons/icon-16.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ Upload from UI | Take screenshot on Gemini with HUD |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ Upload from UI | Take screenshot on ChatGPT with HUD |
| Small Promo Tile [OPTIONAL] | 440×280 | ⬜ Optional | Promo banner |

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `https://gemini.google.com/*` | host_permissions | Required to inject the Web Audio API hook into the Gemini page context to accelerate native chunked audio streaming. |
| `https://chatgpt.com/*` | host_permissions | Required to inject HTMLAudioElement prototype listeners and watchdog on ChatGPT to accelerate native Read Aloud speech. |

---

## Privacy & Data Use

### Data Collection
**Does the extension collect user data?** No

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | None | No |
| User activity / history | No | No | None | No |
| Website content / chats | No | No | None | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Distribution

- **Visibility**: Public (Store Searchable)
- **Regions**: All regions
- **Pricing**: Free (100% Free for everyone)

---

## Step-by-Step Submission Instructions

1. **Security Pre-requisite**: Ensure **2-Step Verification (2SV)** is active on your Google account (`lakhidas168@gmail.com`). Chrome Web Store strictly enforces 2SV for all developer accounts.
2. Visit [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/).
3. Log in with your Google account.
4. If this is your first time: Complete the publisher registration and pay Google's **one-time $5 USD registration fee** (lifetime pass, no recurring charges).
5. Click **"Add new item"** / **"New Item"** button.
6. Upload the generated zip file: `AIR10_AI_Audio_Accelerator_v2.0.0.zip`.
7. Copy-paste the fields from this document:
   - **Name**: `AIR10 AI Audio Accelerator`
   - **Tagline / Summary**: `Free Gemini + ChatGPT Read Aloud Speed Controller 🚀`
   - **Detailed Description**: Di hui complete formatted description.
   - **Permissions Justification**: Host permissions justifications for `gemini.google.com` and `chatgpt.com`.
8. Upload at least one screenshot (1280×800 or 640×400 px) demonstrating Gemini/ChatGPT active audio with the speed HUD.
9. Under **Privacy**, declare that **NO user data is collected or transmitted**, and certify Single Purpose.
10. Click **"Submit for Review"**.
    *(Note: Under Google's 2026 review system, initial reviews with host permissions undergo automated heuristics plus manual review, typically taking 24–72 hours or slightly longer depending on submission volume).*
