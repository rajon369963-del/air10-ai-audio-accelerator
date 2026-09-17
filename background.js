
try {
  if (typeof importScripts === 'function') {
    importScripts('modules/civex-nano-bridge.js');
  }
} catch (e) {}
/**
 * AIR10 Chrome Extension Background Service Worker
 * MV3 Service Worker with Native Messaging Host Port (com.air10.study)
 * 
 * Features:
 * - Persistent Native Port with auto-reconnect and exponential backoff
 * - Monotonic sequence numbers and ACK tracking
 * - Offline event queue with pending replay on reconnect
 * - Bi-directional dispatch (Extension -> Native Host -> Extension -> Active Tab)
 * - Durable state via chrome.storage.local (survives service worker restarts)
 * - Chrome alarms recovery watchdog
 */

const NATIVE_HOST = 'com.air10.study';
let nativePort = null;
let isConnecting = false;
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY_MS = 16000;
let monotonicSeq = 1;
let pendingQueue = [];
let unacknowledgedEvents = new Map(); // seq -> event
let isStateLoaded = false;

// Durable state management via chrome.storage.local
async function loadDurableState() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    const data = await chrome.storage.local.get(['air10_seq', 'air10_pending', 'air10_unack']);
    if (data.air10_seq && data.air10_seq >= monotonicSeq) {
      monotonicSeq = data.air10_seq;
    }
    if (Array.isArray(data.air10_pending) && data.air10_pending.length > 0) {
      pendingQueue = [...data.air10_pending, ...pendingQueue];
    }
    if (Array.isArray(data.air10_unack)) {
      data.air10_unack.forEach(([seq, ev]) => unacknowledgedEvents.set(seq, ev));
    }
    isStateLoaded = true;
  } catch (e) {
    console.warn('[AIR10 SW] Could not load durable state:', e);
  }
}

async function persistDurableState() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
  try {
    await chrome.storage.local.set({
      air10_seq: monotonicSeq,
      air10_pending: pendingQueue.slice(-100), // persist up to last 100
      air10_unack: Array.from(unacknowledgedEvents.entries()).slice(-100)
    });
  } catch (e) {
    console.warn('[AIR10 SW] Could not persist state:', e);
  }
}

// Connect to native messaging host
function connectNativeHost() {
  if (isConnecting || nativePort) return;
  isConnecting = true;

  console.log('[AIR10 SW] Connecting to native host:', NATIVE_HOST);
  try {
    nativePort = chrome.runtime.connectNative(NATIVE_HOST);

    nativePort.onMessage.addListener(handleNativeMessage);
    nativePort.onDisconnect.addListener(handleNativeDisconnect);

    // Initial handshake / heartbeat
    sendToNative({ type: 'HEARTBEAT', version: '2.5.3', generation: Date.now() });

    isConnecting = false;
    reconnectAttempts = 0;
    console.log('[AIR10 SW] Connected to native host successfully');

    // Flush any pending replay events
    flushPendingQueue();
  } catch (err) {
    console.error('[AIR10 SW] Failed to connect native host:', err);
    isConnecting = false;
    nativePort = null;
    scheduleReconnect();
  }
}

function handleNativeDisconnect() {
  const err = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Port closed';
  console.warn('[AIR10 SW] Native host disconnected:', err);
  nativePort = null;
  isConnecting = false;
  scheduleReconnect();
}

function scheduleReconnect() {
  if (reconnectAttempts >= 3) {
    console.log('[AIR10 SW] Native host com.air10.study idle. Operating in autonomous acceleration mode.');
    return;
  }
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY_MS);
  reconnectAttempts++;
  console.log(`[AIR10 SW] Reconnecting in ${delay}ms (attempt ${reconnectAttempts})`);
  setTimeout(connectNativeHost, delay);
}

// Send message to native host
function sendToNative(msg) {
  const seq = monotonicSeq++;
  const payload = { seq, ...msg, timestamp: Date.now() };

  if (payload.type === 'EVENT') {
    unacknowledgedEvents.set(seq, payload);
  }

  persistDurableState();

  if (nativePort) {
    try {
      nativePort.postMessage(payload);
    } catch (e) {
      console.warn('[AIR10 SW] postMessage error, buffering:', e);
      pendingQueue.push(payload);
      nativePort = null;
      persistDurableState();
      scheduleReconnect();
    }
  } else {
    pendingQueue.push(payload);
    persistDurableState();
    connectNativeHost();
  }
}

function flushPendingQueue() {
  if (!nativePort) return;
  while (pendingQueue.length > 0) {
    const item = pendingQueue.shift();
    try {
      nativePort.postMessage(item);
    } catch (e) {
      pendingQueue.unshift(item);
      break;
    }
  }
  persistDurableState();
}

// Handle message from native host
function handleNativeMessage(msg) {
  if (!msg) return;

  // Handle ACK
  if (msg.type === 'ACK' && msg.seq) {
    unacknowledgedEvents.delete(msg.seq);
    persistDurableState();
    return;
  }

  // Handle Reverse Path Commands from Native Host
  if (msg.type === 'COMMAND') {
    executeNativeCommand(msg);
  }
}

// Execute command on active Gemini tab

// Offscreen Document Management for Gemini Nano and Audio DSP
let offscreenCreating = null;
async function setupOffscreen() {
  if (typeof chrome === 'undefined' || !chrome.offscreen) return;
  try {
    const offscreenUrl = 'offscreen.html';
    if (chrome.runtime.getContexts) {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT'],
        documentUrls: [chrome.runtime.getURL(offscreenUrl)]
      }).catch(() => []);
      if (existingContexts && existingContexts.length > 0) return;
    } else if (chrome.offscreen.hasDocument) {
      const hasDoc = await chrome.offscreen.hasDocument();
      if (hasDoc) return;
    }

    if (offscreenCreating) {
      await offscreenCreating;
    } else {
      offscreenCreating = chrome.offscreen.createDocument({
        url: offscreenUrl,
        reasons: ['AUDIO_PLAYBACK', 'WORKERS'],
        justification: 'Persistent sidecar for Gemini Nano on-device AI and cognitive audio DSP'
      });
      await offscreenCreating;
      offscreenCreating = null;
      console.log('[AIR10 SW] Offscreen document created successfully');
    }
  } catch (err) {
    if (!String(err).includes('Only a single offscreen document may be created')) {
      console.warn('[AIR10 SW] Offscreen document setup warning:', err);
    }
  }
}

async function executeNativeCommand(cmd) {
  const action = cmd.action;
  const args = cmd.args || {};
  const cmdId = cmd.command_id;

  if (action === 'civex_route_query') {
    const query = args.query || '';
    const limit = args.limit || 2;
    const Bridge = typeof CIVEXNanoBridge !== 'undefined' ? CIVEXNanoBridge : (typeof require !== 'undefined' ? require('./modules/civex-nano-bridge.js') : null);
    if (Bridge) {
      const router = new Bridge.InBrowserBM25Router(args.tools || [
        { id: 'study_resume', name: 'study_resume', cat: 'study', desc: 'Resume active study session' },
        { id: 'study_inspect_page', name: 'study_inspect_page', cat: 'dom', desc: 'Inspect current page' }
      ]);
      const top = router.routeQuery(query, limit);
      const shadows = top.map(t => Bridge.SchemaShrinker.shrinkTool(t));
      sendToNative({
        type: 'COMMAND_RESULT',
        command_id: cmdId,
        status: 'SUCCESS',
        result: { query, candidates: top, shadows }
      });
      return;
    }
  }

  if (action === 'civex_cognitive_audio_pacing') {
    const text = args.text || '';
    const Bridge = typeof CIVEXNanoBridge !== 'undefined' ? CIVEXNanoBridge : (typeof require !== 'undefined' ? require('./modules/civex-nano-bridge.js') : null);
    if (Bridge) {
      const pacing = Bridge.CognitiveAudioPacer.analyzeDensity(text);
      sendToNative({
        type: 'COMMAND_RESULT',
        command_id: cmdId,
        status: 'SUCCESS',
        result: pacing
      });
      return;
    }
  }

  if (action === 'civex_local_dom_risk_audit') {
    const order = args.order || {};
    const Bridge = typeof CIVEXNanoBridge !== 'undefined' ? CIVEXNanoBridge : (typeof require !== 'undefined' ? require('./modules/civex-nano-bridge.js') : null);
    if (Bridge) {
      const audit = Bridge.LocalDomRiskAuditor.auditOrder(order);
      sendToNative({
        type: 'COMMAND_RESULT',
        command_id: cmdId,
        status: 'SUCCESS',
        result: audit
      });
      return;
    }
  }


  if (action === 'extension_reload') {
    sendToNative({
      type: 'COMMAND_RESULT',
      command_id: cmdId,
      status: 'RELOADED',
      result: { status: 'RELOADED' }
    });
    setTimeout(() => {
      chrome.runtime.reload();
    }, 50);
    return;
  }

  try {
    let tabs = await chrome.tabs.query({ url: '*://gemini.google.com/*' });
    if (!tabs || tabs.length === 0) {
      // Self-heal: If opening notebook or resuming study, open Gemini Students tab
      if (action === 'study_open_notebook' || action === 'study_resume') {
        const newTab = await chrome.tabs.create({
          url: args.notebook_id ? 
            `https://gemini.google.com/students/notebook/${encodeURIComponent(args.notebook_id)}` : 
            'https://gemini.google.com/students',
          active: true
        });
        sendToNative({
          type: 'COMMAND_RESULT',
          command_id: cmdId,
          status: 'NAVIGATING',
          result: { status: 'NAVIGATING', tab_id: newTab.id }
        });
        return;
      }

      sendToNative({
        type: 'COMMAND_RESULT',
        command_id: cmdId,
        status: 'ERROR',
        error: 'No active Gemini tab found'
      });
      return;
    }

    const activeTab = tabs.find(t => t.active) || tabs[0];

    // Execute via scripting injection into MAIN world
    const results = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      world: 'MAIN',
      func: async (toolName, toolArgs) => {
        if (toolName === 'study_verify_native_origin') {
          const injectedRoot = document.getElementById('air10-quiz-root');
          const hasInjectedRoot = !!injectedRoot;
          const injectedHtmlLen = injectedRoot ? injectedRoot.innerHTML.length : 0;

          // If caller requests disabling/removing injected mock UI:
          if (toolArgs && toolArgs.disable_injected && injectedRoot) {
            injectedRoot.remove();
          }

          // Inspect real DOM ancestry of any question
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
            injected_disabled: !!(toolArgs && toolArgs.disable_injected),
            is_native_element: isNative,
            ancestry: ancestry,
            question_visible: !!qEl,
            question_text: qEl ? qEl.textContent.trim().replace(/\s+/g, ' ') : null,
            parsed_question: currentParsed,
            state: currentState
          };
        }

        if (toolName === 'study_inspect_page') {
          const clickable = [];
          document.querySelectorAll('button, a, [role="button"], [role="link"], [data-test-id], mat-card, .card, div[clickable]').forEach((el, idx) => {
            const txt = (el.innerText || el.textContent || '').trim().replace(/\s+/g, ' ');
            const aria = el.getAttribute('aria-label') || '';
            const testId = el.getAttribute('data-test-id') || el.getAttribute('data-testid') || '';
            if (txt || aria || testId) {
              clickable.push({
                index: idx,
                tag: el.tagName.toLowerCase(),
                text: txt.slice(0, 100),
                ariaLabel: aria,
                testId: testId,
                role: el.getAttribute('role'),
                className: (el.className || '').toString().slice(0, 100)
              });
            }
          });

          return {
            url: location.href,
            title: document.title,
            body_preview: (document.body.innerText || '').slice(0, 1500).replace(/\s+/g, ' '),
            clickable_count: clickable.length,
            clickable_elements: clickable.slice(0, 50)
          };
        }

        if (toolName === 'study_click_native_selector') {
          const sel = toolArgs.selector;
          const textMatch = toolArgs.text_match ? toolArgs.text_match.toLowerCase() : null;
          let target = null;

          if (sel) {
            target = document.querySelector(sel);
          }
          if (!target && textMatch) {
            const all = Array.from(document.querySelectorAll('button, a, [role="button"], div, span'));
            target = all.find(el => {
              const t = (el.innerText || el.getAttribute('aria-label') || '').toLowerCase().trim();
              return t === textMatch || t.includes(textMatch);
            });
          }

          if (!target) {
            return { status: 'NOT_FOUND', error: 'No matching element found', selector: sel, text_match: textMatch };
          }

          try {
            target.scrollIntoView({ behavior: 'instant', block: 'center' });
            target.focus();
            target.click();
            return {
              status: 'CLICKED',
              tag: target.tagName,
              text: (target.innerText || target.getAttribute('aria-label') || '').trim().slice(0, 80)
            };
          } catch (e) {
            return { status: 'ERROR', error: e.message };
          }
        }

        if (window.__AIR10_STUDY_TOOLS__ && window.__AIR10_STUDY_TOOLS__[toolName]) {
          return await window.__AIR10_STUDY_TOOLS__[toolName](toolArgs);
        }
        return { error: 'Tool not found: ' + toolName };
      },
      args: [action, args]
    });

    const output = results && results[0] ? results[0].result : null;
    const resolvedStatus = (output && output.status) ? output.status : 'SUCCESS';

    sendToNative({
      type: 'COMMAND_RESULT',
      command_id: cmdId,
      status: resolvedStatus,
      result: output
    });
  } catch (err) {
    sendToNative({
      type: 'COMMAND_RESULT',
      command_id: cmdId,
      status: 'ERROR',
      error: err.message
    });
  }
}

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {

  if (request && request.type === 'OFFSCREEN_HEARTBEAT') {
    sendResponse({ received: true, sw_alive: true, monotonicSeq, timestamp: Date.now() });
    return true;
  }

  if (request && request.type === 'AIR10_EVENT') {
    const eventData = request.data;
    if (sender.tab) {
      eventData.tab_id = sender.tab.id;
    }
    sendToNative({ type: 'EVENT', data: eventData });
    sendResponse({ ack: true, received: true });
    return true;
  }

  if (request && request.type === 'GET_NATIVE_STATUS') {
    sendResponse({
      connected: !!nativePort,
      reconnectAttempts,
      pendingCount: pendingQueue.length,
      monotonicSeq
    });
    return true;
  }
});

// Alarm watchdog for recovery & re-connection (throttled to avoid redundant errors when native host is idle)
if (typeof chrome !== 'undefined' && chrome.alarms) {
  try {
    chrome.alarms.create('air10_watchdog', { periodInMinutes: 5 });
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'air10_watchdog') {
        if (!nativePort && !isConnecting && pendingQueue.length > 0 && reconnectAttempts < 3) {
          console.log('[AIR10 SW] Watchdog alarm triggered: reconnecting native host');
          connectNativeHost();
        }
      }
    });
  } catch (e) {}
}

// Initialize state and connect
loadDurableState().then(() => {
  connectNativeHost();
  setupOffscreen().catch(() => {});
});
