/**
 * AIR10 Chrome Local AI Module
 * Harnesses browser-native Chrome Prompt API (Gemini Nano) when available.
 * 
 * Rules:
 * - Feature-detects window.ai.languageModel / chrome.aiOriginTrial
 * - STRICTLY UI CLASSIFICATION ONLY: Never selects answers or gives spoilers.
 * - Used as fallback when deterministic DOM selectors encounter unknown layouts.
 */
(() => {
  'use strict';

  if (window.__AIR10_LOCAL_AI__) return;

  let promptSession = null;
  let isAvailable = false;

  async function checkAvailability() {
    try {
      if (typeof window !== 'undefined' && window.ai?.languageModel) {
        const capabilities = await window.ai.languageModel.capabilities();
        isAvailable = capabilities.available === 'readily' || capabilities.available === 'after-download';
        return isAvailable;
      }
    } catch (e) {}
    isAvailable = false;
    return false;
  }

  async function getSession() {
    if (promptSession) return promptSession;
    if (typeof window !== 'undefined' && window.ai?.languageModel) {
      try {
        promptSession = await window.ai.languageModel.create({
          systemPrompt: 'You are an accessible web structure classifier. Output strict JSON only. Never answer or guess questions.'
        });
        return promptSession;
      } catch (e) {}
    }
    return null;
  }

  async function classifyUiStructure(accessibleSnapshot) {
    const available = await checkAvailability();
    if (!available) {
      return {
        available: false,
        confidence: 0,
        activity_kind: 'UNKNOWN',
        reason: 'Chrome Prompt API unavailable in current session'
      };
    }

    try {
      const session = await getSession();
      if (!session) throw new Error('Failed to create Prompt API session');

      const snapshotJson = JSON.stringify(accessibleSnapshot).slice(0, 1000);
      const prompt = 'Analyze this UI snapshot and classify the activity type (QUIZ, LESSON, DIAGNOSTIC, RESULT, HOME).\n' +
                     'Snapshot:\n' + snapshotJson + '\n' +
                     'Respond with strict JSON only: {\"activity_kind\": \"...\", \"confidence\": 0.95}';

      const res = await session.prompt(prompt);
      const cleaned = res.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      return {
        available: true,
        activity_kind: parsed.activity_kind || 'UNKNOWN',
        confidence: parsed.confidence || 0.8,
        raw_response: parsed
      };
    } catch (err) {
      return {
        available: true,
        confidence: 0,
        activity_kind: 'UNKNOWN',
        error: err.message
      };
    }
  }

  window.__AIR10_LOCAL_AI__ = {
    isAvailable: () => isAvailable,
    checkAvailability: checkAvailability,
    classifyUiStructure: classifyUiStructure
  };

  checkAvailability();
  console.log('[AIR10 Chrome Local AI] Module Loaded');
})();
