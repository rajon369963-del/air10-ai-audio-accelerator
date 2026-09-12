/**
 * AIR10 Gemini Students Isolated-World Adapter
 * 
 * Runs in ISOLATED world to observe learner UI and securely bridge events to MV3 service worker.
 * Captures:
 * - PAGE_READY
 * - NOTEBOOK_IDENTITY
 * - QUIZ_VISIBLE
 * - QUESTION_VISIBLE
 * - OPTION_CLICKED_BY_HUMAN (verified via e.isTrusted)
 * - ANSWER_FEEDBACK
 * - NEXT_QUESTION_VISIBLE
 * - LESSON_VISIBLE
 * - FLASHCARD_VISIBLE
 * - NAVIGATION_CHANGE
 */
(() => {
  'use strict';

  if (window.__AIR10_STUDENTS_ADAPTER__) return;
  window.__AIR10_STUDENTS_ADAPTER__ = true;

  const seenEventKeys = new Set();
  let lastObservedQuestionFp = null;

  function fastHash(str) {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  function extractOptionLabel(optEl) {
    if (!optEl) return 'OPTION';
    const attr = optEl.getAttribute('data-option-label') || optEl.getAttribute('data-label');
    if (attr) return attr.toUpperCase().trim();
    const aria = optEl.getAttribute('aria-label');
    if (aria && /^[A-F]$/i.test(aria.trim())) return aria.toUpperCase().trim();
    const badge = optEl.querySelector('.option-label, [data-test-id*="label"], .letter-badge');
    if (badge && badge.innerText) {
      const m = badge.innerText.trim().match(/^[A-F]/i);
      if (m) return m[0].toUpperCase();
    }
    const text = optEl.innerText ? optEl.innerText.trim() : '';
    const m = text.match(/^([A-F])[\.\):\s]/i);
    if (m) return m[1].toUpperCase();
    return text.slice(0, 1).toUpperCase() || 'OPTION';
  }

  function emitToBackground(eventType, payload = {}, meta = {}) {
    const questionFp = meta.question_fingerprint || payload.question_fingerprint || null;
    const dedupeKey = eventType + ':' + (questionFp || '') + ':' + fastHash(JSON.stringify(payload));

    if (seenEventKeys.has(dedupeKey)) return;
    seenEventKeys.add(dedupeKey);
    if (seenEventKeys.size > 2000) {
      const iter = seenEventKeys.values();
      for (let i = 0; i < 500; i++) seenEventKeys.delete(iter.next().value);
    }

    const eventId = meta.event_id || (payload && payload.event_id) || ('ev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8));

    const eventObj = {
      event_id: eventId,
      event_type: eventType,
      timestamp: meta.timestamp || payload.timestamp || Date.now(),
      tab_id: null,
      page_generation: meta.page_generation || 1,
      notebook_fingerprint: meta.notebook_fingerprint || null,
      question_fingerprint: questionFp,
      payload: payload
    };

    // Forward to extension service worker if available
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'AIR10_EVENT', data: eventObj }, (res) => {
          if (chrome.runtime.lastError) {
            // Service worker sleeping or starting
          }
        });
      }
    } catch (e) {}

    // Dispatch custom event in current execution context for tests
    try {
      window.dispatchEvent(new CustomEvent('air10-isolated-event', { detail: eventObj }));
    } catch (e) {}
  }

  // 1. Capture genuine human click events on options (OPTION_CLICKED_BY_HUMAN)
  document.addEventListener('click', (e) => {
    // Only genuine human interactions have isTrusted === true
    const isHuman = e.isTrusted === true;
    const target = e.target;
    if (!target) return;

    const optEl = target.closest('button.option, .option, button[class*="option"], [role="radio"], input[type="radio"], .quiz-option, [data-option-id], button.option-btn');
    if (optEl) {
      const label = extractOptionLabel(optEl);

      // Accessible Radiogroup State Sync
      const group = optEl.closest('[role="radiogroup"], .options-group, .quiz-container, fieldset, question, .lm-flashcards-ui');
      if (group) {
        group.querySelectorAll('button.option, .option, button[class*="option"], [role="radio"], input[type="radio"], .quiz-option, [data-option-id]').forEach(sib => {
          if (sib !== optEl) {
            sib.setAttribute('aria-checked', 'false');
            sib.classList.remove('selected', 'active');
            if (sib.tagName === 'INPUT') sib.checked = false;
          }
        });
      }
      optEl.setAttribute('aria-checked', 'true');
      optEl.classList.add('selected');
      if (optEl.tagName === 'INPUT') optEl.checked = true;

      const evtId = 'ev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
      emitToBackground('OPTION_CLICKED_BY_HUMAN', {
        event_id: evtId,
        option: label,
        human_authentic: isHuman,
        trusted_event: isHuman,
        tag: target.tagName,
        text_preview: optEl.innerText ? optEl.innerText.trim().slice(0, 100) : ''
      }, {
        event_id: evtId,
        question_fingerprint: lastObservedQuestionFp
      });
    }
  }, true);

  // 2. Listen to bridge events posted from MAIN world
  window.addEventListener('message', (e) => {
    if (e.data && e.data.type === 'AIR10_BRIDGE_EVENT' && e.data.event) {
      const ev = e.data.event;
      if (ev.question_fingerprint) {
        lastObservedQuestionFp = ev.question_fingerprint;
      }
      emitToBackground(ev.event_type, ev.payload, {
        question_fingerprint: ev.question_fingerprint,
        notebook_fingerprint: ev.notebook_fingerprint,
        page_generation: ev.page_generation
      });
    }
  });

  // 3. Scoped MutationObserver to detect question and feedback transitions
  let debounceTimeout = null;
  const domObserver = new MutationObserver(() => {
    if (debounceTimeout) return;
    debounceTimeout = setTimeout(() => {
      debounceTimeout = null;
      scanDom();
    }, 50);
  });

  function scanDom() {
    // Look for question presence
    const qEl = document.querySelector('[role="heading"][aria-level="2"], .question-text, [data-test-id*="question-text"], .quiz-question');
    if (qEl) {
      const text = qEl.innerText?.trim();
      if (text) {
        const fp = 'q_' + fastHash(text);
        if (fp !== lastObservedQuestionFp) {
          lastObservedQuestionFp = fp;
          emitToBackground('QUESTION_VISIBLE', { text_preview: text.slice(0, 80) }, { question_fingerprint: fp });
        }
      }
    }

    // Look for feedback appearance
    const fbEl = document.querySelector('[role="alert"], .quiz-feedback, [data-test-id*="feedback"], .answer-explanation');
    if (fbEl && fbEl.innerText?.trim()) {
      emitToBackground('ANSWER_FEEDBACK', { preview: fbEl.innerText.trim().slice(0, 80) }, { question_fingerprint: lastObservedQuestionFp });
    }

    // Look for lesson visibility
    const lessonEl = document.querySelector('[data-activity="lesson"], .lesson-content');
    if (lessonEl) {
      emitToBackground('LESSON_VISIBLE', { preview: lessonEl.innerText?.trim()?.slice(0, 80) });
    }
  }

  if (document.documentElement) {
    domObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  // Initial scan
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanDom);
  } else {
    scanDom();
  }

  console.log('[AIR10 Students Adapter] Initialized in ISOLATED world');
})();
