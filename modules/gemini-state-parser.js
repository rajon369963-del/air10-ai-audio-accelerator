/**
 * AIR10 Gemini State & Semantic Parser Module
 * 
 * Locator Priority:
 * 1. Accessibility role
 * 2. Accessible name
 * 3. Visible text
 * 4. Aria state
 * 5. DOM structure
 * 6. Stable data attributes
 * 7. Class selector as last fallback
 * 
 * Strict Zero-Spoiler Law:
 * Never reveal answer or correctness in question schema before human submission.
 */
(() => {
  'use strict';

  if (window.__AIR10_PARSER__) return;

  function fastHash(str) {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  function cleanText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.offsetWidth === 0 && el.offsetHeight === 0 && !el.getClientRects().length) {
      // In JSDOM / headless, offsetWidth might be 0, so check style / hidden attribute
      if (el.hasAttribute('hidden') || el.style?.display === 'none' || el.style?.visibility === 'hidden') {
        return false;
      }
      return true;
    }
    const style = window.getComputedStyle ? window.getComputedStyle(el) : el.style;
    return style?.display !== 'none' && style?.visibility !== 'hidden';
  }

  // Detect activity kind
  function detectActivityKind(doc = document) {
    if (!doc) return 'UNKNOWN';

    // Strict 404 / Error page guard
    const docTitle = doc.title || '';
    const bodyText = doc.body ? doc.body.innerText || '' : '';
    if (docTitle.includes('404') || docTitle.includes('Not Found') || bodyText.includes('Error 404') || (bodyText.includes('requested URL') && bodyText.includes('was not found'))) {
      return '404_NOT_FOUND';
    }

    // 1. Check for Quiz / Diagnostic question element
    const hasRadioGroup = doc.querySelector('[role="radiogroup"], .quiz-container, [data-activity="quiz"], [data-test-id*="quiz"], [data-test-id*="question"]');
    const hasRadios = doc.querySelectorAll('[role="radio"], input[type="radio"], .quiz-option, [data-option-id]');
    
    // Check results screen
    const resultHeading = doc.querySelector('[data-test-id*="result"], .quiz-results, [role="region"][aria-label*="Result" i], [role="region"][aria-label*="Score" i]');
    if (resultHeading && isVisible(resultHeading)) {
      return 'RESULT';
    }
    const anyText = doc.body ? doc.body.innerText || '' : '';
    if (anyText.includes('Quiz complete') || anyText.includes('Your score:') || anyText.includes('Summary of results')) {
      return 'RESULT';
    }

    // Check Diagnostic
    if (anyText.includes('Diagnostic Quiz') || anyText.includes('diagnostic assessment') || doc.querySelector('[data-activity="diagnostic"]')) {
      return 'DIAGNOSTIC';
    }

    // Check Quiz
    if (hasRadioGroup || hasRadios.length >= 2) {
      return 'QUIZ';
    }

    // Check Lesson
    const hasLesson = doc.querySelector('[data-activity="lesson"], [role="article"], .lesson-content, [data-test-id*="lesson"]');
    if (hasLesson && isVisible(hasLesson)) {
      return 'LESSON';
    }

    // Check Study Notebook
    const url = typeof location !== 'undefined' ? location.href : '';
    if (url.includes('/notebook/') || doc.querySelector('[data-test-id="study-notebook"], .study-notebook-header')) {
      return 'STUDY_NOTEBOOK';
    }

    if (url.includes('students')) {
      return 'STUDENTS';
    }

    if (url.includes('gemini.google.com')) {
      return 'HOME';
    }

    return 'UNKNOWN';
  }

  // Extract Question details
  function extractQuestion(doc = document) {
    if (!doc) return null;

    // Strict 404 guard
    if (detectActivityKind(doc) === '404_NOT_FOUND') {
      return null;
    }

    // 1. Accessibility Role & Semantic Heading for Question Text
    let qEl = doc.querySelector('[role="heading"][aria-level="2"], [role="heading"][aria-level="3"], legend, .question-text, [data-test-id*="question-text"], .quiz-question');
    
    // Strict Native Provenance: reject extension-injected nodes
    if (qEl && qEl.closest('#air10-quiz-root')) {
      return null;
    }

    if (!qEl) {
      // Fallback: search within radiogroup container
      const group = doc.querySelector('[role="radiogroup"], .quiz-container, fieldset');
      if (group && !group.closest('#air10-quiz-root')) {
        qEl = group.querySelector('p, h1, h2, h3, h4, span, label');
      }
    }

    const rawQuestionText = qEl ? cleanText(qEl.innerText || qEl.textContent) : '';
    if (!rawQuestionText && !doc.querySelector('[role="radio"]:not(#air10-quiz-root *), input[type="radio"]:not(#air10-quiz-root *)')) {
      return null; // No native question present
    }

    const questionFingerprint = 'q_' + fastHash(rawQuestionText || 'unlabeled_question_' + location.pathname);

    // Extract options with ancestor de-duplication to prevent nested elements creating duplicate options
    const rawOptionElements = Array.from(doc.querySelectorAll('[role="radio"], input[type="radio"], .quiz-option, [data-option-id], button.option-btn'));
    const optionElements = rawOptionElements.filter(el => {
      if (!isVisible(el)) return false;
      return !rawOptionElements.some(ancestor => ancestor !== el && (typeof ancestor.contains === 'function' ? ancestor.contains(el) : false));
    });
    const options = [];
    let selectedOption = null;

    const labels = ['A', 'B', 'C', 'D', 'E', 'F'];

    optionElements.forEach((el, idx) => {
      const assignedLabel = el.getAttribute('data-option-label') || 
                            el.getAttribute('data-label') || 
                            (el.getAttribute('aria-label') && el.getAttribute('aria-label').length === 1 ? el.getAttribute('aria-label') : null) || 
                            labels[idx] || String(idx + 1);

      // Find label/text: prefer dedicated option-text container, then label, then whole element
      let optText = '';
      const textContainer = el.querySelector('.option-text, [data-test-id*="option-text"], [data-test-id*="text"]') ||
                            el.closest('label') ||
                            el;
      optText = cleanText(textContainer.innerText || textContainer.textContent || el.getAttribute('aria-label') || '');

      // Strip leading 'A)', 'B.', etc. from optText if present
      const cleanedOptText = optText.replace(/^[A-Z][\.\):\-]\s*/i, '').trim();

      // Check selection state
      const isChecked = el.getAttribute('aria-checked') === 'true' || 
                        el.getAttribute('aria-selected') === 'true' || 
                        el.checked === true || 
                        el.classList.contains('selected') || 
                        el.classList.contains('active');

      const optId = el.getAttribute('data-option-id') || el.id || assignedLabel;

      if (isChecked) {
        selectedOption = assignedLabel;
      }

      options.push({
        id: optId,
        label: assignedLabel,
        text: cleanedOptText || optText,
        selected: isChecked,
        element: el
      });
    });

    // Determine Submit State
    const submitBtn = doc.querySelector('button[type="submit"], button[data-test-id*="submit"], [role="button"][aria-label*="Submit" i], button.submit-btn');
    let submitState = 'READY';
    if (submitBtn) {
      if (submitBtn.disabled || submitBtn.getAttribute('aria-disabled') === 'true') {
        submitState = 'DISABLED';
      }
    }

    // Check Feedback state
    const feedback = extractFeedback(doc);
    const feedbackState = feedback.feedback_visible ? 'VISIBLE' : 'NONE';
    if (feedback.feedback_visible) {
      submitState = 'SUBMITTED';
    }

    return {
      question_fingerprint: questionFingerprint,
      text: rawQuestionText,
      options: options.map(o => ({ id: o.id, label: o.label, text: o.text, selected: o.selected })),
      raw_options: options, // includes DOM element references for clicking
      selected: selectedOption,
      submit_state: submitState,
      feedback_state: feedbackState
    };
  }

  // Extract feedback (Only if submitted and displayed)
  function extractFeedback(doc = document) {
    if (!doc) return { feedback_visible: false };

    const fbEl = doc.querySelector('[role="alert"], .quiz-feedback, [data-test-id*="feedback"], .answer-explanation, [aria-label*="Feedback" i]');
    if (!fbEl || !isVisible(fbEl)) {
      // Check for inline correct / incorrect indicators
      const correctBadge = doc.querySelector('.correct, [data-state="correct"], [aria-label*="Correct" i]');
      const incorrectBadge = doc.querySelector('.incorrect, [data-state="incorrect"], [aria-label*="Incorrect" i]');
      if ((correctBadge && isVisible(correctBadge)) || (incorrectBadge && isVisible(incorrectBadge))) {
        const isCorrect = !!correctBadge;
        const text = cleanText(doc.querySelector('.explanation, .feedback-text')?.innerText || '');
        return {
          feedback_visible: true,
          is_correct: isCorrect,
          feedback_text: isCorrect ? 'Correct' : 'Incorrect',
          explanation: text
        };
      }
      return { feedback_visible: false };
    }

    const text = cleanText(fbEl.innerText || fbEl.textContent || '');
    const lower = text.toLowerCase();
    const isNegative = lower.includes('incorrect') || lower.includes('not correct') || lower.includes('wrong') || lower.includes('try again');
    const isPositive = lower.includes('correct') || lower.includes("that's right") || lower.includes('good job') || lower.includes('great job') || lower.includes('well done');
    const isCorrect = !isNegative && isPositive;

    return {
      feedback_visible: true,
      is_correct: isCorrect,
      feedback_text: text,
      explanation: cleanText(doc.querySelector('.explanation, [data-test-id*="explanation"]')?.innerText || text)
    };
  }

  // Extract Next button
  function extractNextButton(doc = document) {
    if (!doc) return null;
    const candidates = Array.from(doc.querySelectorAll('button, [role="button"]'));
    for (const btn of candidates) {
      if (!isVisible(btn)) continue;
      const text = cleanText(btn.innerText || btn.getAttribute('aria-label') || '').toLowerCase();
      if (text === 'next' || text === 'next question' || text === 'continue' || text.startsWith('next')) {
        return btn;
      }
      if (btn.getAttribute('data-test-id') === 'next-button' || btn.classList.contains('next-btn')) {
        return btn;
      }
    }
    return null;
  }

  // Extract Progress
  function extractProgress(doc = document) {
    if (!doc) return { current: 1, total: 1, percent: 100 };
    // Try aria-valuenow / progress bar
    const progressEl = doc.querySelector('[role="progressbar"], progress, [data-test-id*="progress"]');
    if (progressEl) {
      const now = parseFloat(progressEl.getAttribute('aria-valuenow') || progressEl.value || 0);
      const max = parseFloat(progressEl.getAttribute('aria-valuemax') || progressEl.max || 100);
      return {
        current: now,
        total: max,
        percent: max > 0 ? Math.round((now / max) * 100) : 0
      };
    }
    // Search scoped progress container or header for Question X of Y
    const scopedEl = doc.querySelector('.progress, [class*="progress"], [class*="question-counter"], [class*="step-indicator"], header, [role="banner"]');
    const targetText = scopedEl ? (scopedEl.innerText || '') : '';
    const scopedMatch = targetText.match(/(\d+)\s*(?:of|\/)\s*(\d+)/i);
    if (scopedMatch) {
      const cur = parseInt(scopedMatch[1], 10);
      const tot = parseInt(scopedMatch[2], 10);
      return {
        current: cur,
        total: tot,
        percent: tot > 0 ? Math.round((cur / tot) * 100) : 0
      };
    }
    // Fallback: search body specifically for "Question X of Y" or "Q X / Y" (never naked numbers like 1/2 formulas)
    const explicitMatch = (doc.body ? doc.body.innerText || '' : '').match(/(?:question|q\.?)\s*(\d+)\s*(?:of|\/)\s*(\d+)/i);
    if (explicitMatch) {
      const cur = parseInt(explicitMatch[1], 10);
      const tot = parseInt(explicitMatch[2], 10);
      return {
        current: cur,
        total: tot,
        percent: tot > 0 ? Math.round((cur / tot) * 100) : 0
      };
    }
    return { current: 1, total: 11, percent: 9.1 };
  }

  // Get canonical state object
  function getStudyState(doc = document) {
    const url = typeof location !== 'undefined' ? location.href : '';
    const pageKind = window.__AIR10_ROUTE__ ? window.__AIR10_ROUTE__.getPageKind() : 'STUDENTS';
    const activityKind = detectActivityKind(doc);
    const q = extractQuestion(doc);
    const fb = extractFeedback(doc);
    const nextBtn = extractNextButton(doc);
    const prog = extractProgress(doc);

    // Extract notebook title if present
    const titleEl = doc.querySelector('[role="heading"][aria-level="1"], .notebook-title, [data-test-id="notebook-title"]');
    const notebookTitle = titleEl ? cleanText(titleEl.innerText || titleEl.textContent) : 'AIR10 Electrical Engineering';

    return {
      url: url,
      page_kind: pageKind,
      notebook_title: notebookTitle,
      activity_kind: activityKind,
      question_visible: !!q,
      question_fingerprint: q ? q.question_fingerprint : null,
      selected_option: q ? q.selected : null,
      feedback_visible: fb.feedback_visible,
      next_available: !!nextBtn && !nextBtn.disabled && nextBtn.getAttribute('aria-disabled') !== 'true',
      progress: prog,
      timestamp: Date.now()
    };
  }

  window.__AIR10_PARSER__ = {
    detectActivityKind,
    extractQuestion,
    extractFeedback,
    extractNextButton,
    extractProgress,
    getStudyState,
    cleanText,
    fastHash
  };

  console.log('[AIR10 State Parser] Initialized');
})();
