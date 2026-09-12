/**
 * AIR10 Universal Content Script Orchestrator
 * Target:
 * - Google NotebookLM (notebooklm.google.com) — Audio Overview Podcasts & Audio Books
 * - Google Gemini (gemini.google.com) — Read Aloud chunk streaming engine
 * - OpenAI ChatGPT (chatgpt.com) — Read Aloud HTML5 audio
 * Execution World: MAIN
 * 
 * Integrates:
 * 1. AIR10 AI Audio Accelerator (Option+S, 3x support, deep shadow DOM piercing, pitch preservation)
 * 2. Dedicated Platform Adapters & Observability
 */
(() => {
  'use strict';

  if (window.__AIR10_ORCHESTRATOR__) return;
  window.__AIR10_ORCHESTRATOR__ = true;

  console.log('%c[AIR10 Native Browser Nervous System Active]%c v2.5.3', 'color:#6366f1;font-weight:bold;font-size:13px;', 'color:#10b981;font-weight:bold;');

  const isNotebookLM = typeof location !== 'undefined' && (location.hostname.includes('notebooklm.google.com') || location.hostname.includes('notebook.google.com'));
  const isGemini = typeof location !== 'undefined' && location.hostname.includes('gemini.google.com');
  const isChatGPT = typeof location !== 'undefined' && location.hostname.includes('chatgpt.com');

  if (isNotebookLM) {
    console.log('[AIR10] NotebookLM Audio Overview Podcast 3x Accelerator Ready');
  } else if (isGemini) {
    console.log('[AIR10] Gemini Read Aloud & Study 3x Accelerator Ready');
  } else if (isChatGPT) {
    console.log('[AIR10] ChatGPT Read Aloud 3x Accelerator Ready');
  }
})();
