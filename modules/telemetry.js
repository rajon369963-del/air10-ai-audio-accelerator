/**
 * AIR10 Telemetry & Event Batcher Module
 * Compact, deterministic event pipeline for Gemini Study Bridge.
 * 
 * Rules:
 * - Never dump whole DOM; emit compact semantic events
 * - WeakMap for seen DOM nodes to prevent memory leaks
 * - Debounce / batch events (20-50ms)
 * - Deterministic deduplication via event hash
 */
(() => {
  'use strict';

  if (window.__AIR10_TELEMETRY__) return;

  const seenNodes = new WeakMap();
  const emittedEventHashes = new Set();
  const eventQueue = [];
  let flushTimer = null;
  const BATCH_INTERVAL_MS = 30;

  // Simple string hashing for compact fingerprints
  function fastHash(str) {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  // Generate unique event ID
  function generateEventId() {
    return 'ev_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9);
  }

  // Canonical event emitter
  function emitEvent(eventType, payload = {}, metadata = {}) {
    const timestamp = Date.now();
    const questionFp = metadata.question_fingerprint || payload.question_fingerprint || null;
    const notebookFp = metadata.notebook_fingerprint || payload.notebook_fingerprint || null;
    const pageGen = metadata.page_generation || window.__AIR10_PAGE_GENERATION__ || 1;

    // Deduplication key
    const payloadStr = JSON.stringify(payload);
    const dedupeKey = eventType + ':' + (questionFp || '') + ':' + fastHash(payloadStr);

    if (emittedEventHashes.has(dedupeKey)) {
      return null; // Duplicate dropped deterministically
    }
    emittedEventHashes.add(dedupeKey);
    // Keep set bounded
    if (emittedEventHashes.size > 2000) {
      const iter = emittedEventHashes.values();
      for (let i = 0; i < 500; i++) {
        emittedEventHashes.delete(iter.next().value);
      }
    }

    const event = {
      event_id: generateEventId(),
      event_type: eventType,
      timestamp: timestamp,
      tab_id: window.__AIR10_TAB_ID__ || null,
      page_generation: pageGen,
      notebook_fingerprint: notebookFp,
      question_fingerprint: questionFp,
      payload: payload
    };

    eventQueue.push(event);
    scheduleFlush();

    // Dispatch custom event in MAIN world for direct observers
    try {
      window.dispatchEvent(new CustomEvent('air10-study-event', { detail: event }));
    } catch (e) {}

    // Also postMessage so ISOLATED world content script can relay to background service worker
    try {
      window.postMessage({ type: 'AIR10_BRIDGE_EVENT', event: event }, '*');
    } catch (e) {}

    return event;
  }

  function scheduleFlush() {
    if (flushTimer !== null) return;
    flushTimer = setTimeout(flushBatch, BATCH_INTERVAL_MS);
  }

  function flushBatch() {
    flushTimer = null;
    if (eventQueue.length === 0) return;
    const batch = eventQueue.splice(0, eventQueue.length);
    // Batch notification
    try {
      window.dispatchEvent(new CustomEvent('air10-study-batch', { detail: { count: batch.length, events: batch } }));
    } catch (e) {}
  }

  window.__AIR10_TELEMETRY__ = {
    emit: emitEvent,
    hash: fastHash,
    seenNodes: seenNodes,
    getPendingCount: () => eventQueue.length,
    flush: flushBatch
  };

  console.log('[AIR10 Telemetry] Initialized');
})();
