/**
 * AIR10 Gemini Notebook & NotebookLM Isolated-World Adapter
 * 
 * Runs in ISOLATED world to observe Study Notebook identity, flashcard interactions,
 * and NotebookLM Audio Overview (Deep Dive podcast) state.
 * 
 * Captures:
 * - NOTEBOOK_IDENTITY
 * - NOTEBOOK_AUDIO_OVERVIEW_STATE (Podcasts / Audio Books)
 * - FLASHCARD_VISIBLE
 * - SOURCE_PANEL_STATE
 */
(() => {
  'use strict';

  if (window.__AIR10_NOTEBOOK_ADAPTER__) return;
  window.__AIR10_NOTEBOOK_ADAPTER__ = true;

  function fastHash(str) {
    if (!str) return '0';
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  function emitNotebookEvent(eventType, payload = {}) {
    const eventObj = {
      event_id: 'nb_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
      event_type: eventType,
      timestamp: Date.now(),
      notebook_fingerprint: payload.notebook_id ? 'nb_' + fastHash(payload.notebook_id) : null,
      payload: payload
    };

    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'AIR10_EVENT', data: eventObj });
      }
    } catch (e) {}
  }

  let lastAudioOverviewStatus = null;

  function scanNotebook() {
    const url = typeof location !== 'undefined' ? location.href : '';
    const match = url.match(/\/notebook\/([a-zA-Z0-9_-]+)/);
    const notebookId = match ? match[1] : null;

    const titleEl = document.querySelector('[role="heading"][aria-level="1"], .notebook-title, [data-test-id="notebook-title"]');
    const title = titleEl ? titleEl.innerText?.trim() : null;

    if (notebookId || title) {
      emitNotebookEvent('NOTEBOOK_IDENTITY', {
        notebook_id: notebookId,
        title: title || 'AIR10 Electrical Engineering'
      });
    }

    // Observe NotebookLM Audio Overview (Deep Dive podcast)
    const audioOverviewCard = document.querySelector(
      '[data-test-id="audio-overview-card"], .audio-overview, [aria-label*="Deep Dive"], [aria-label*="Audio Overview"], .audio-player'
    );
    const audioEl = document.querySelector('audio');

    if (audioOverviewCard || audioEl) {
      let status = 'READY';
      if (audioEl && !audioEl.paused && !audioEl.ended && audioEl.currentTime > 0) {
        status = 'PLAYING';
      } else if (audioEl && audioEl.paused && audioEl.currentTime > 0) {
        status = 'PAUSED';
      } else if (document.body && document.body.innerText.includes('Generating Audio Overview')) {
        status = 'GENERATING';
      }

      if (status !== lastAudioOverviewStatus) {
        lastAudioOverviewStatus = status;
        emitNotebookEvent('NOTEBOOK_AUDIO_OVERVIEW_STATE', {
          status: status,
          current_time: audioEl ? audioEl.currentTime : 0,
          duration: audioEl ? audioEl.duration : 0,
          speed: audioEl ? audioEl.playbackRate : 1.0,
          has_audio_element: !!audioEl
        });
      }
    }

    // Check flashcards
    const flashcardEl = document.querySelector('[data-activity="flashcard"], .flashcard-container, [data-test-id*="flashcard"]');
    if (flashcardEl) {
      emitNotebookEvent('FLASHCARD_VISIBLE', {
        preview: flashcardEl.innerText?.trim()?.slice(0, 80)
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scanNotebook);
  } else {
    scanNotebook();
  }

  // Periodic polling for Audio Overview state updates
  const scanTimer = setInterval(scanNotebook, 2500);
  if (scanTimer && typeof scanTimer.unref === 'function') {
    scanTimer.unref();
  }

  console.log('[AIR10 Notebook Adapter] Initialized in ISOLATED world (Audio Overview podcast observer active)');
})();
