/**
 * AIR10 Gemini Study Tools Module
 * 
 * Implements the Chrome DevTools MCP Third-Party Developer Tools specification:
 * - Listens for "devtoolstooldiscovery" event
 * - Exposes structured schemas and execute handlers for the 9 AIR10 study tools
 * - Supports action idempotency (action_id + question_fingerprint)
 * - Enforces BEFORE_STATE -> ACTION -> AFTER_STATE -> EFFECT_VERIFIED for write actions
 * - Strict Zero-Spoiler invariant
 */
(() => {
  'use strict';

  if (window.__AIR10_STUDY_TOOLS__) return;

  const executedActionIds = new Map(); // action_id -> result
  const MAX_CACHED_ACTIONS = 500;

  function recordAction(actionId, result) {
    if (!actionId) return;
    executedActionIds.set(actionId, result);
    if (executedActionIds.size > MAX_CACHED_ACTIONS) {
      const firstKey = executedActionIds.keys().next().value;
      executedActionIds.delete(firstKey);
    }
  }

  function hashState(state) {
    if (!state || !window.__AIR10_PARSER__) return '0';
    const copy = { ...state };
    delete copy.timestamp;
    return window.__AIR10_PARSER__.fastHash(JSON.stringify(copy));
  }

  // 1. study_get_state
  async function studyGetState() {
    if (!window.__AIR10_PARSER__) {
      return { error: 'AIR10 Parser not initialized', timestamp: Date.now() };
    }
    return window.__AIR10_PARSER__.getStudyState();
  }

  // 2. study_get_question
  async function studyGetQuestion() {
    if (!window.__AIR10_PARSER__) {
      return { error: 'AIR10 Parser not initialized' };
    }
    const q = window.__AIR10_PARSER__.extractQuestion();
    if (!q) {
      return {
        question_visible: false,
        message: 'No active question currently visible in DOM'
      };
    }

    // STRICT ZERO-SPOILER: Ensure no answer hint is returned
    return {
      question_visible: true,
      question_fingerprint: q.question_fingerprint,
      text: q.text,
      options: q.options,
      selected: q.selected,
      submit_state: q.submit_state,
      feedback_state: q.feedback_state
    };
  }

  // 3. study_get_options
  async function studyGetOptions() {
    const q = await studyGetQuestion();
    if (!q || !q.question_visible) {
      return { options: [] };
    }
    return {
      question_fingerprint: q.question_fingerprint,
      options: q.options,
      selected: q.selected
    };
  }

  // 4. study_get_feedback
  async function studyGetFeedback() {
    if (!window.__AIR10_PARSER__) {
      return { error: 'AIR10 Parser not initialized' };
    }
    return window.__AIR10_PARSER__.extractFeedback();
  }

  // 5. study_select_option (WRITE TOOL with BEFORE -> ACTION -> AFTER -> VERIFIED)
  async function studySelectOption(args = {}) {
    const targetOption = (args.option || args.label || '').toUpperCase().trim();
    const actionId = args.action_id || null;
    const expectedFingerprint = args.question_fingerprint || null;
    const expectedBeforeHash = args.before_hash || null;

    // Idempotency check
    if (actionId && executedActionIds.has(actionId)) {
      return {
        status: 'NOOP_IDEMPOTENT',
        action_id: actionId,
        cached_result: executedActionIds.get(actionId)
      };
    }

    if (!['A', 'B', 'C', 'D', 'E', 'F'].includes(targetOption)) {
      return {
        status: 'ERROR',
        error: 'Invalid option label: ' + targetOption + '. Expected A, B, C, or D.'
      };
    }

    // Step 1: BEFORE_STATE
    const beforeState = window.__AIR10_PARSER__ ? window.__AIR10_PARSER__.getStudyState() : null;
    const qBefore = window.__AIR10_PARSER__ ? window.__AIR10_PARSER__.extractQuestion() : null;

    if (!qBefore) {
      return {
        status: 'REJECTED',
        error: 'No question visible to select option on'
      };
    }

    // Check Stale Question
    if (expectedFingerprint && qBefore.question_fingerprint !== expectedFingerprint) {
      return {
        status: 'STALE_QUESTION_REJECTED',
        expected_fingerprint: expectedFingerprint,
        current_fingerprint: qBefore.question_fingerprint
      };
    }

    // Check before_hash (hashes deterministic semantic state excluding volatile timestamp)
    const beforeHash = hashState(beforeState);
    if (expectedBeforeHash && expectedBeforeHash !== beforeHash) {
      return {
        status: 'STALE_STATE_REJECTED',
        expected_hash: expectedBeforeHash,
        current_hash: beforeHash
      };
    }

    // Step 2: ACTION (locate option element and click)
    const optMatch = qBefore.raw_options.find(o => o.label.toUpperCase() === targetOption || o.id === targetOption);
    if (!optMatch || !optMatch.element) {
      return {
        status: 'ERROR',
        error: 'Option ' + targetOption + ' element not found in DOM'
      };
    }

    const targetElement = optMatch.element;
    
    // Dispatch real pointer and click events
    try {
      targetElement.scrollIntoView({ behavior: 'instant', block: 'nearest' });
      targetElement.focus();
      targetElement.click();
      if (targetElement.tagName === 'INPUT') {
        targetElement.checked = true;
        targetElement.dispatchEvent(new Event('change', { bubbles: true }));
        targetElement.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (err) {
      return { status: 'ERROR', error: 'Click failed: ' + err.message };
    }

    // Step 3: Wait small turn for DOM mutation
    await new Promise(r => setTimeout(r, 60));

    // Step 4: AFTER_STATE & EFFECT_VERIFIED
    const afterState = window.__AIR10_PARSER__.getStudyState();
    const qAfter = window.__AIR10_PARSER__.extractQuestion();

    const isVerified = (qAfter && qAfter.selected === targetOption) ||
                       targetElement.getAttribute('aria-checked') === 'true' ||
                       targetElement.checked === true ||
                       targetElement.classList.contains('selected');

    const result = {
      status: isVerified ? 'SELECTED' : 'FAILED_VERIFICATION',
      option: targetOption,
      action_id: actionId,
      question_fingerprint: qBefore.question_fingerprint,
      before_hash: beforeHash,
      verified: isVerified,
      before_selected: qBefore.selected,
      after_selected: qAfter ? qAfter.selected : null,
      timestamp: Date.now()
    };

    if (actionId) {
      recordAction(actionId, result);
    }

    // Telemetry event emission
    if (window.__AIR10_TELEMETRY__) {
      window.__AIR10_TELEMETRY__.emit('OPTION_SELECTED', {
        option: targetOption,
        verified: isVerified,
        question_fingerprint: qBefore.question_fingerprint
      });
    }

    return result;
  }

  // 6. study_next (WRITE TOOL with BEFORE -> ACTION -> AFTER -> VERIFIED)
  async function studyNext(args = {}) {
    const actionId = args.action_id || null;
    const expectedFingerprint = args.question_fingerprint || null;
    const expectedBeforeHash = args.before_hash || null;

    if (actionId && executedActionIds.has(actionId)) {
      return {
        status: 'NOOP_IDEMPOTENT',
        action_id: actionId,
        cached_result: executedActionIds.get(actionId)
      };
    }

    const beforeState = window.__AIR10_PARSER__ ? window.__AIR10_PARSER__.getStudyState() : null;

    // Check Stale Question
    if (expectedFingerprint && beforeState && beforeState.question_fingerprint !== expectedFingerprint) {
      return {
        status: 'STALE_QUESTION_REJECTED',
        expected_fingerprint: expectedFingerprint,
        current_fingerprint: beforeState.question_fingerprint
      };
    }

    // Check before_hash
    const beforeHash = hashState(beforeState);
    if (expectedBeforeHash && expectedBeforeHash !== beforeHash) {
      return {
        status: 'STALE_STATE_REJECTED',
        expected_hash: expectedBeforeHash,
        current_hash: beforeHash
      };
    }

    const nextBtn = window.__AIR10_PARSER__ ? window.__AIR10_PARSER__.extractNextButton() : null;

    if (!nextBtn) {
      return {
        status: 'UNAVAILABLE',
        error: 'Next / Advance button is not visible in the current UI state'
      };
    }

    // Check if Next button is disabled
    if (nextBtn.disabled || nextBtn.getAttribute('aria-disabled') === 'true') {
      return {
        status: 'DISABLED',
        error: 'Next button is currently disabled. Current question must be resolved first.'
      };
    }

    // Click next
    try {
      nextBtn.scrollIntoView({ behavior: 'instant', block: 'nearest' });
      nextBtn.click();
    } catch (err) {
      return { status: 'ERROR', error: 'Next click failed: ' + err.message };
    }

    // Wait for DOM update
    await new Promise(r => setTimeout(r, 120));

    const afterState = window.__AIR10_PARSER__.getStudyState();
    const isQuestionAdvanced = beforeState.question_fingerprint !== afterState.question_fingerprint;
    const isActivityChanged = beforeState.activity_kind !== afterState.activity_kind;
    const isVerified = isQuestionAdvanced || isActivityChanged || afterState.activity_kind === 'RESULT';

    const result = {
      status: isVerified ? 'ADVANCED' : 'CLICKED_NO_CHANGE',
      action_id: actionId,
      before_fingerprint: beforeState.question_fingerprint,
      after_fingerprint: afterState.question_fingerprint,
      before_hash: beforeHash,
      before_activity: beforeState.activity_kind,
      after_activity: afterState.activity_kind,
      verified: isVerified,
      timestamp: Date.now()
    };

    if (actionId) {
      recordAction(actionId, result);
    }

    if (window.__AIR10_TELEMETRY__) {
      window.__AIR10_TELEMETRY__.emit('NEXT_QUESTION_VISIBLE', {
        new_fingerprint: afterState.question_fingerprint,
        activity_kind: afterState.activity_kind
      });
    }

    return result;
  }

  // 7. study_get_progress
  async function studyGetProgress() {
    if (!window.__AIR10_PARSER__) {
      return { current: 1, total: 11, percent: 9.1 };
    }
    return window.__AIR10_PARSER__.extractProgress();
  }

  // 8. study_open_notebook
  async function studyOpenNotebook(args = {}) {
    const notebookId = args.notebook_id || null;
    const targetUrl = notebookId ? 
      ('https://gemini.google.com/students/notebook/' + encodeURIComponent(notebookId)) : 
      'https://gemini.google.com/students';

    // Strictly no injected UI: only navigate to target native URL
    if (typeof location !== 'undefined') {
      if (location.href !== targetUrl && !location.href.includes(targetUrl)) {
        location.href = targetUrl;
        return { status: 'NAVIGATING', target_url: targetUrl };
      }
    }
    return { status: 'ALREADY_OPEN', url: targetUrl };
  }

  // 9. study_health
  async function studyHealth() {
    const parserOk = !!window.__AIR10_PARSER__;
    const routeOk = !!window.__AIR10_ROUTE__;
    const telemetryOk = !!window.__AIR10_TELEMETRY__;
    const audioOk = !!window.__AIR10_AUDIO__;
    const quizRoot = document.getElementById('air10-quiz-root');

    return {
      status: (parserOk && routeOk) ? 'HEALTHY' : 'DEGRADED',
      bridge_version: '2.1.0',
      domain: typeof location !== 'undefined' ? location.hostname : 'unknown',
      page_kind: routeOk ? window.__AIR10_ROUTE__.getPageKind() : 'UNKNOWN',
      modules: {
        parser: parserOk,
        route_observer: routeOk,
        telemetry: telemetryOk,
        audio_accelerator: audioOk
      },
      has_quiz_root: !!quizRoot,
      quiz_root_html_len: quizRoot ? quizRoot.innerHTML.length : 0,
      body_children: document.body ? document.body.children.length : 0,
      speed: audioOk ? window.__AIR10_AUDIO__.getSpeed() : 2.0,
      timestamp: Date.now()
    };
  }

  // 10. study_verify_native_origin
  async function studyVerifyNativeOrigin(args = {}) {
    const injectedRoot = document.getElementById('air10-quiz-root');
    const hasInjectedRoot = !!injectedRoot;
    const injectedHtmlLen = injectedRoot ? injectedRoot.innerHTML.length : 0;

      if (args && args.disable_injected && injectedRoot) {
        injectedRoot.remove();
      }

      const qEl = document.querySelector('[role="heading"][aria-level="2"], [role="heading"][aria-level="3"], .question-text, [data-test-id*="question-text"], .quiz-question');
      let ancestry = [];
      let isNative = false;
      let current = qEl;
      while (current && current !== document.body && current !== document.documentElement) {
        ancestry.push({
          tag: current.tagName.toLowerCase(),
          id: current.id || null,
          className: current.className || null,
          role: current.getAttribute('role') || null
        });
        current = current.parentElement;
      }

      if (qEl) {
        const hasAir10Ancestor = ancestry.some(a => (a.id && a.id.includes('air10')) || (a.className && a.className.includes('air10')));
        isNative = !hasAir10Ancestor;
      }

      const currentParsed = window.__AIR10_PARSER__ ? window.__AIR10_PARSER__.extractQuestion() : null;
      const currentState = window.__AIR10_PARSER__ ? window.__AIR10_PARSER__.getStudyState() : null;

      return {
        has_injected_root: hasInjectedRoot,
        injected_html_len: injectedHtmlLen,
        injected_disabled: !!(args && args.disable_injected),
        is_native_element: isNative,
        ancestry: ancestry,
        question_visible: !!qEl,
        question_text: qEl ? qEl.textContent.trim().replace(/\s+/g, ' ') : null,
        parsed_question: currentParsed,
        state: currentState
      };
    }

    // Define tools catalog conforming to Chrome DevTools MCP specification
    const AIR10_TOOLS = [
      {
        name: 'study_verify_native_origin',
        description: 'Verify if currently visible question is native or extension-injected.',
        inputSchema: {
          type: 'object',
          properties: {
            disable_injected: { type: 'boolean', description: 'Remove any injected UI to test native-only DOM' }
          }
        },
        execute: studyVerifyNativeOrigin
      },
      {
        name: 'study_get_state',
        description: 'Return current Gemini Study state: url, page_kind, activity_kind, question_visible, selected_option, progress.',
        inputSchema: { type: 'object', properties: {} },
        execute: studyGetState
      },
    {
      name: 'study_get_question',
      description: 'Return current visible learner question and options (zero spoiler: never reveals answers).',
      inputSchema: { type: 'object', properties: {} },
      execute: studyGetQuestion
    },
    {
      name: 'study_get_options',
      description: 'Return current options list for the active question.',
      inputSchema: { type: 'object', properties: {} },
      execute: studyGetOptions
    },
    {
      name: 'study_get_feedback',
      description: 'Return feedback for the submitted answer if available.',
      inputSchema: { type: 'object', properties: {} },
      execute: studyGetFeedback
    },
    {
      name: 'study_select_option',
      description: 'Select one option (A, B, C, D) with physical verification readback and idempotency.',
      inputSchema: {
        type: 'object',
        properties: {
          option: { type: 'string', enum: ['A', 'B', 'C', 'D', 'E', 'F'], description: 'Option label to select' },
          action_id: { type: 'string', description: 'Unique action ID for idempotency' },
          question_fingerprint: { type: 'string', description: 'Fingerprint of question to guard against stale clicks' },
          before_hash: { type: 'string', description: 'Hash of before state to guard against concurrent mutations' }
        },
        required: ['option']
      },
      execute: studySelectOption
    },
    {
      name: 'study_next',
      description: 'Advance to next question or activity only after current question is resolved.',
      inputSchema: {
        type: 'object',
        properties: {
          action_id: { type: 'string', description: 'Unique action ID' },
          question_fingerprint: { type: 'string', description: 'Current question fingerprint' },
          before_hash: { type: 'string', description: 'Hash of before state to guard against concurrent mutations' }
        }
      },
      execute: studyNext
    },
    {
      name: 'study_get_progress',
      description: 'Return current question progress (current, total, percentage).',
      inputSchema: { type: 'object', properties: {} },
      execute: studyGetProgress
    },
    {
      name: 'study_open_notebook',
      description: 'Navigate to target Gemini Study Notebook.',
      inputSchema: {
        type: 'object',
        properties: {
          notebook_id: { type: 'string', description: 'Optional target notebook ID' }
        }
      },
      execute: studyOpenNotebook
    },
    {
      name: 'study_health',
      description: 'Check health and module status of the AIR10 study bridge on the active page.',
      inputSchema: { type: 'object', properties: {} },
      execute: studyHealth
    }
  ];

  const toolGroup = {
    name: 'AIR10 Gemini Student Bridge',
    description: "Semantic control of Rajon's Gemini Study Notebook",
    tools: AIR10_TOOLS
  };

  // Register Chrome DevTools MCP third-party developer tool discovery listener
  if (typeof window !== 'undefined') {
    window.addEventListener('devtoolstooldiscovery', (event) => {
      try {
        if (typeof event.respondWith === 'function') {
          event.respondWith(toolGroup);
          console.log('[AIR10 DevTools MCP] Registered AIR10 Gemini Student Bridge page tools');
        }
      } catch (err) {
        console.error('[AIR10 DevTools MCP] Registration error:', err);
      }
    });

    // Secondary WebMCP Canary Support if browser implements WebMCP
    if (typeof navigator !== 'undefined' && navigator.modelContext?.registerToolGroup) {
      try {
        navigator.modelContext.registerToolGroup(toolGroup);
        console.log('[AIR10 WebMCP] Registered WebMCP tool group canary');
      } catch (e) {}
    }
  }

  // Export on window for direct access by scripts and test harnesses
  const exportMap = {};
  AIR10_TOOLS.forEach(t => {
    exportMap[t.name] = t.execute;
  });

  window.__AIR10_STUDY_TOOLS__ = exportMap;
  window.AIR10_STUDY = exportMap;

  console.log('[AIR10 Study Tools] 10 Page Tools Ready');
})();
