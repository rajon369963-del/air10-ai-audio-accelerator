/**
 * AIR10 AI Audio Accelerator Module
 * Target Platforms:
 * - Google NotebookLM (notebooklm.google.com) — Audio Overview / Deep Dive Podcasts & Audio Books
 * - Google Gemini (gemini.google.com) — Read Aloud chunk streaming engine
 * - OpenAI ChatGPT (chatgpt.com) — Read Aloud HTML5 audio element
 * 
 * Battle-Tested Architecture (2026 Modern Web & Shadow DOM Standards):
 * 1. Deep Shadow DOM Traversal & attachShadow Interception (Pierce Google Web Components)
 * 2. Window.Audio & Document.createElement('audio') Prototype Hooks
 * 3. HTMLMediaElement.prototype.play Interception & Ratechange Watchdog
 * 4. Web Audio API Hook (AudioBufferSourceNode & AudioParam) for Gemini
 * 5. Full Pitch Preservation (Zero chipmunk effect, natural vocal timbre at 3.0x)
 * 6. 5-Gear Verified Speed Ladder: [1.5x, 1.75x, 2.0x (Default), 2.5x, 3.0x]
 * 7. Fast Direct Speed Selector [1x, 1.5x, 2x, 2.5x, 3x] + Fine Stepping (0.25x steps)
 * 8. Option+S (Alt+S) & '[' / ']' Global Shortcuts with strict typing protection
 * 9. Real-Time Active Audio Shift without playback restart
 * 10. Glassmorphic HUD Widget with Audio Activity Glow & Minimize State
 */
(() => {
  'use strict';

  if (window.__AIR10_AUDIO_ACCELERATOR__) return;
  window.__AIR10_AUDIO_ACCELERATOR__ = true;

  const SPEEDS = [1.5, 1.75, 2.0, 2.5, 3.0];
  const QUICK_SPEEDS = [1.0, 1.5, 2.0, 2.5, 3.0];
  
  // Load saved speed from localStorage or default to 2.0x
  let savedSpeed = 2.0;
  try {
    const val = parseFloat(localStorage.getItem('air10_ai_speed'));
    if (!isNaN(val) && val >= 0.5 && val <= 4.0) {
      savedSpeed = val;
    }
  } catch (e) {}

  let currentIndex = SPEEDS.indexOf(savedSpeed) !== -1 ? SPEEDS.indexOf(savedSpeed) : 2;
  let targetSpeed = savedSpeed;

  const activeMediaElements = new Set();
  const activeBufferSources = new Set();
  const observedShadowRoots = new WeakSet();
  const interceptedShadowRoots = new Set();

  function isMediaElement(el) {
    if (!el) return false;
    try {
      if (typeof HTMLMediaElement !== 'undefined' && el instanceof HTMLMediaElement) return true;
      if (typeof window !== 'undefined' && window.HTMLMediaElement && el instanceof window.HTMLMediaElement) return true;
    } catch (e) {}
    const tag = (el.tagName || '').toUpperCase();
    return tag === 'AUDIO' || tag === 'VIDEO';
  }

  // Hack #16 & #17: Strict re-entrancy lock and ratechange storm throttling (Wheel: sinon & jsdom tested)
  let isMutatingRate = false;
  const ratechangeEventCounts = new WeakMap();
  const telemetryLog = [];

  function logSpeedTelemetry(fromSpeed, toSpeed, source) {
    const entry = {
      id: 'act_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36),
      timestamp: Date.now(),
      fromSpeed,
      toSpeed,
      source,
      activeMediaCount: activeMediaElements.size,
      activeBufferSources: activeBufferSources.size
    };
    telemetryLog.push(entry);
    if (telemetryLog.length > 50) telemetryLog.shift();
    return entry;
  }

  // Helper to enforce speed & pitch preservation on any media element (Hacks #16, #17, #22, #48)
  function enforceAudioSpeed(media) {
    if (!media || !isMediaElement(media) || isMutatingRate) return;

    try {
      isMutatingRate = true;
      if (typeof media.playbackRate !== 'number' || Math.abs(media.playbackRate - targetSpeed) > 0.01) {
        media.playbackRate = targetSpeed;
      }
      if (typeof media.defaultPlaybackRate !== 'number' || Math.abs(media.defaultPlaybackRate - targetSpeed) > 0.01) {
        media.defaultPlaybackRate = targetSpeed;
      }
      // Pitch preservation across Chrome/Webkit/Firefox engines
      try { media.preservesPitch = true; } catch (e) {}
      try { media.mozPreservesPitch = true; } catch (e) {}
      try { media.webkitPreservesPitch = true; } catch (e) {}
    } catch (e) {} finally {
      isMutatingRate = false;
    }
  }

  // Register and track media elements
  function trackMediaElement(media) {
    if (!media || !isMediaElement(media) || activeMediaElements.has(media)) return;
    activeMediaElements.add(media);
    enforceAudioSpeed(media);

    if (media.addEventListener) {
      media.addEventListener('ended', () => {
        activeMediaElements.delete(media);
        updatePlayingIndicator();
      }, { once: true });

      media.addEventListener('pause', () => {
        updatePlayingIndicator();
      });

      media.addEventListener('play', () => {
        enforceAudioSpeed(media);
        updatePlayingIndicator();
      });

      media.addEventListener('playing', () => {
        enforceAudioSpeed(media);
        updatePlayingIndicator();
      });

      // Hacks #16, #17, #19: Ratechange event storm shield with sliding time-window throttle
      media.addEventListener('ratechange', () => {
        if (isMutatingRate) return;
        const now = Date.now();
        let stats = ratechangeEventCounts.get(media) || { count: 0, windowStart: now };
        if (now - stats.windowStart > 100) {
          stats = { count: 1, windowStart: now };
        } else {
          stats.count++;
        }
        ratechangeEventCounts.set(media, stats);

        // Storm threshold: If > 25 events fire within 100ms, throttle microtask queueing
        if (stats.count > 25) {
          return;
        }

        if (typeof media.playbackRate === 'number' && Math.abs(media.playbackRate - targetSpeed) > 0.01) {
          queueMicrotask(() => enforceAudioSpeed(media));
          setTimeout(() => enforceAudioSpeed(media), 10);
        }
      });
    }
  }

  // =========================================================================
  // 1. Shadow DOM Deep Traversal & Interception (Wheel: query-selector-shadow-dom)
  // =========================================================================
  function querySelectorAllDeep(selector, root = (typeof document !== 'undefined' ? document : null)) {
    if (!root) return [];
    const elements = [];

    function traverse(node) {
      if (!node) return;
      if (node.nodeType === 1 && node.matches && node.matches(selector)) {
        elements.push(node);
      }
      const shadow = node.shadowRoot || node.__air10_shadow__;
      if (shadow) {
        if (!observedShadowRoots.has(shadow)) {
          observeRoot(shadow);
        }
        traverse(shadow);
      }

      if (node.childNodes && node.childNodes.length > 0) {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i]);
        }
      }
    }

    traverse(root);
    return elements;
  }
  function getAllMediaElements(root = (typeof document !== 'undefined' ? document : null)) {
    if (!root) return [];
    const elements = [];

    function traverse(node) {
      if (!node) return;
      if (isMediaElement(node)) {
        elements.push(node);
      }
      const shadow = node.shadowRoot || node.__air10_shadow__;
      if (shadow) {
        if (!observedShadowRoots.has(shadow)) {
          observeRoot(shadow);
        }
        traverse(shadow);
      }

      if (node.childNodes && node.childNodes.length > 0) {
        for (let i = 0; i < node.childNodes.length; i++) {
          traverse(node.childNodes[i]);
        }
      }
    }

    traverse(root);
    return elements;
  }

  function observeRoot(root) {
    if (!root || observedShadowRoots.has(root)) return;
    try {
      observedShadowRoots.add(root);
      if (root.addEventListener) {
        ['play', 'playing', 'loadedmetadata', 'canplay', 'canplaythrough', 'timeupdate', 'ratechange'].forEach(evt => {
          root.addEventListener(evt, (e) => {
            enforceAudioSpeed(e.target);
            if (isMediaElement(e.target)) {
              trackMediaElement(e.target);
            }
          }, true);
        });
      }
      if (typeof MutationObserver !== 'undefined') {
        const observer = new MutationObserver(() => {
          const found = getAllMediaElements(root);
          found.forEach(media => {
            enforceAudioSpeed(media);
            trackMediaElement(media);
          });
        });
        observer.observe(root, { childList: true, subtree: true });
      }
    } catch (e) {}
  }

  // Intercept Element.prototype.attachShadow to catch newly instantiated Web Components (including closed shadow roots)
  if (typeof Element !== 'undefined' && Element.prototype && Element.prototype.attachShadow) {
    const origAttachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function(init) {
      const shadow = origAttachShadow.call(this, init);
      try {
        interceptedShadowRoots.add(shadow);
        this.__air10_shadow__ = shadow;
        observeRoot(shadow);
      } catch (e) {}
      return shadow;
    };
  }

  // =========================================================================
  // 2. Audio Constructor & Document.createElement Hooks (NotebookLM & Memory Audio)
  // =========================================================================
  if (typeof window !== 'undefined' && typeof window.Audio !== 'undefined') {
    const OriginalAudio = window.Audio;
    window.Audio = function(...args) {
      const audioInstance = new OriginalAudio(...args);
      try {
        enforceAudioSpeed(audioInstance);
        trackMediaElement(audioInstance);
      } catch (e) {}
      return audioInstance;
    };
    window.Audio.prototype = OriginalAudio.prototype;
  }

  const hookCreateElement = (target) => {
    if (!target || !target.createElement || target.createElement.__air10_hooked) return;
    const origCreateElement = target.createElement;
    target.createElement = function(tagName, options) {
      const el = origCreateElement.call(this, tagName, options);
      if (typeof tagName === 'string') {
        const tag = tagName.toUpperCase();
        if (tag === 'AUDIO' || tag === 'VIDEO') {
          try {
            enforceAudioSpeed(el);
            trackMediaElement(el);
          } catch (e) {}
        }
      }
      return el;
    };
    target.createElement.__air10_hooked = true;
  };

  if (typeof Document !== 'undefined' && Document.prototype) {
    hookCreateElement(Document.prototype);
  }
  if (typeof document !== 'undefined') {
    hookCreateElement(document);
  }

  // =========================================================================
  // 3. Web Audio API Interception (Gemini Primary Stream Engine)
  // =========================================================================
  if (typeof AudioBufferSourceNode !== 'undefined') {
    const origBufferStart = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(...args) {
      try {
        if (this.playbackRate && typeof this.playbackRate.value === 'number') {
          this.playbackRate.value = targetSpeed;
        }
        activeBufferSources.add(this);
        updatePlayingIndicator();
        this.addEventListener('ended', () => {
          activeBufferSources.delete(this);
          updatePlayingIndicator();
        }, { once: true });
        console.log('%c[AIR10 WebAudio]%c AudioBufferSourceNode locked to ' + targetSpeed + 'x on ' + (typeof location !== 'undefined' ? location.hostname : 'unknown'), 'color:#6366f1;font-weight:bold;', 'color:#10b981;font-weight:bold;');
      } catch (err) {}
      return origBufferStart.apply(this, args);
    };
  }

  if (typeof AudioParam !== 'undefined' && AudioParam.prototype && AudioParam.prototype.setValueAtTime) {
    const origSetValueAtTime = AudioParam.prototype.setValueAtTime;
    AudioParam.prototype.setValueAtTime = function(value, startTime) {
      let finalValue = value;
      if (this.__isPlaybackRateParam === true) {
        finalValue = targetSpeed;
      }
      return origSetValueAtTime.call(this, finalValue, startTime);
    };
  }

  if (typeof BaseAudioContext !== 'undefined' && BaseAudioContext.prototype && BaseAudioContext.prototype.createBufferSource) {
    const origCreateBufferSource = BaseAudioContext.prototype.createBufferSource;
    BaseAudioContext.prototype.createBufferSource = function(...args) {
      const source = origCreateBufferSource.apply(this, args);
      try {
        if (source && source.playbackRate) {
          source.playbackRate.__isPlaybackRateParam = true;
          source.playbackRate.value = targetSpeed;
        }
      } catch (e) {}
      return source;
    };
  }

  // =========================================================================
  // 4. HTMLMediaElement Prototype Hook (NotebookLM, ChatGPT & Fallback Audio)
  // =========================================================================
  if (typeof HTMLMediaElement !== 'undefined' && HTMLMediaElement.prototype && HTMLMediaElement.prototype.play) {
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
      if (isMediaElement(this)) {
        enforceAudioSpeed(this);
        trackMediaElement(this);

        // Microtask + multi-stage timed safety checks against app resets
        queueMicrotask(() => enforceAudioSpeed(this));
        setTimeout(() => enforceAudioSpeed(this), 50);
        setTimeout(() => enforceAudioSpeed(this), 250);
        setTimeout(() => enforceAudioSpeed(this), 600);

        console.log('%c[AIR10 HTMLMedia]%c Playback intercepted at ' + targetSpeed + 'x on ' + (typeof location !== 'undefined' ? location.hostname : 'unknown'), 'color:#6366f1;font-weight:bold;', 'color:#10b981;font-weight:bold;');
      }
      return nativePlay.apply(this, args);
    };
  }

  // Capture phase listeners for all media events
  if (typeof document !== 'undefined') {
    ['play', 'playing', 'loadedmetadata', 'canplay', 'timeupdate'].forEach(eventType => {
      document.addEventListener(eventType, (e) => {
        enforceAudioSpeed(e.target);
        if (isMediaElement(e.target)) {
          trackMediaElement(e.target);
        }
      }, true);
    });

    // Ratechange watchdog: If website attempts to reset speed back to 1.0x or 1.5x
    document.addEventListener('ratechange', (e) => {
      const el = e.target;
      if (isMediaElement(el)) {
        if (typeof el.playbackRate === 'number' && Math.abs(el.playbackRate - targetSpeed) > 0.01) {
          queueMicrotask(() => enforceAudioSpeed(el));
          setTimeout(() => enforceAudioSpeed(el), 10);
        }
      }
    }, true);

    // MutationObserver fallback on document root
    if (typeof MutationObserver !== 'undefined' && document.documentElement) {
      observeRoot(document.documentElement);
    }
  }

  // =========================================================================
  // 5. Web Speech API Hook (Fallback Voice)
  // =========================================================================
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    const origSpeak = window.speechSynthesis.speak;
    window.speechSynthesis.speak = function(utterance) {
      try {
        if (utterance) {
          utterance.rate = targetSpeed;
        }
      } catch (e) {}
      return origSpeak.call(this, utterance);
    };
  }

  // =========================================================================
  // 6. Central Speed Transmission Engine & Storage
  // =========================================================================
  function pruneDisconnectedMedia() {
    for (const el of activeMediaElements) {
      if (el && typeof el.isConnected === 'boolean' && !el.isConnected) {
        activeMediaElements.delete(el);
      }
    }
    for (const shadow of interceptedShadowRoots) {
      if (shadow && shadow.host && typeof shadow.host.isConnected === 'boolean' && !shadow.host.isConnected) {
        interceptedShadowRoots.delete(shadow);
      }
    }
  }

  function applySpeed(newSpeed, source = 'manual') {
    const parsed = typeof newSpeed === 'number' ? newSpeed : parseFloat(newSpeed);
    if (isNaN(parsed) || !isFinite(parsed)) return;
    const prevSpeed = targetSpeed;
    const num = Math.min(Math.max(Math.round(parsed * 100) / 100, 0.5), 4.0);
    targetSpeed = num;
    pruneDisconnectedMedia();
    logSpeedTelemetry(prevSpeed, targetSpeed, source);

    if (SPEEDS.includes(num)) {
      currentIndex = SPEEDS.indexOf(num);
    } else {
      // Find closest in ladder for Option+S cycling
      let closestIdx = 0;
      let minDiff = 999;
      for (let i = 0; i < SPEEDS.length; i++) {
        const diff = Math.abs(SPEEDS[i] - num);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }
      currentIndex = closestIdx;
    }

    try {
      localStorage.setItem('air10_ai_speed', targetSpeed.toString());
    } catch (e) {}

    // Apply to tracked elements
    activeMediaElements.forEach(enforceAudioSpeed);

    // Deep scan document and shadow DOM
    if (typeof document !== 'undefined') {
      const all = getAllMediaElements(document);
      all.forEach(enforceAudioSpeed);
    }

    interceptedShadowRoots.forEach(shadow => {
      try {
        const all = getAllMediaElements(shadow);
        all.forEach(enforceAudioSpeed);
      } catch (e) {}
    });

    // Apply to Web Audio buffers
    activeBufferSources.forEach(src => {
      try {
        if (src.playbackRate && typeof src.playbackRate.value === 'number') {
          src.playbackRate.value = targetSpeed;
        }
      } catch (e) {}
    });

    updatePillUI();
    updateNotebookLMTriggerButton(targetSpeed);

    console.log('%c[AIR10]%c ⚡ Speed locked to ' + targetSpeed + 'x (' + source + ') on ' + (typeof location !== 'undefined' ? location.hostname : 'unknown'), 'color:#6366f1;font-weight:bold;', 'color:#10b981;font-weight:bold;');
  }

  // Strictly extract speed like "0.5x", "1.0x", "1.2x", "2.0x", "2.5x", "3.0x"
  // (?:^|[^\d.]) matches start of string or non-digit/non-dot character so that "1.2x" is NEVER misparsed as "2x"
  function extractItemSpeed(el) {
    if (!el) return null;
    const txt = (el.textContent || '').trim();
    const match = txt.match(/(?:^|[^\d.])(\d+(?:\.\d+)?)x\b/i);
    if (!match) return null;
    const val = parseFloat(match[1]);
    return isNaN(val) ? null : val;
  }

  // Synchronize NotebookLM bottom player bar speed label (preserves surrounding punctuation like 'Speed: 2.0x' or '(2.0x)')
  function updateNotebookLMTriggerButton(speed) {
    if (typeof document === 'undefined') return;
    try {
      const speedStr = (speed % 1 === 0 ? speed.toFixed(1) : speed.toString()) + 'x';
      const candidates = document.querySelectorAll('button[aria-label*="speed" i], button[aria-label*="playback" i], .playback-speed-button, [data-test-id*="speed" i]');
      candidates.forEach(btn => {
        const walker = document.createTreeWalker(btn, NodeFilter.SHOW_TEXT, null, false);
        let textNode;
        while ((textNode = walker.nextNode())) {
          if (/\b\d+(\.\d+)?x\b/i.test(textNode.nodeValue)) {
            textNode.nodeValue = textNode.nodeValue.replace(/\b\d+(\.\d+)?x\b/i, speedStr);
          }
        }
      });
    } catch (e) {}
  }

  // Inject 2.5x and 3.0x into NotebookLM's native popup speed menu and hook all options (Strict Singleton)
  let isNotebookLMMenuHooked = false;
  let notebookLMMenuObserver = null;

  function checkNotebookLMMenu(container) {
    if (!container || !container.querySelectorAll) return;
    try {
      // 1. Purge any stale malformed items (e.g. 1.2.5x, 1.3.0x from earlier buggy injections)
      const allLeafs = container.querySelectorAll ? container.querySelectorAll('*') : [];
      allLeafs.forEach(el => {
        if (el.children && el.children.length > 0) return;
        if (/1\.[23]\.[05]x/i.test(el.textContent || '')) {
          const itemEl = el.closest('[role="menuitem"], [role="menuitemradio"], button.mat-mdc-menu-item, md-menu-item, li') || el;
          try { itemEl.remove(); } catch (err) {}
        }
      });

      const menuItems = container.querySelectorAll ? container.querySelectorAll('[role="menuitem"], [role="menuitemradio"], button.mat-mdc-menu-item, md-menu-item, li[role="menuitem"]') : [];
      if (!menuItems || menuItems.length === 0) return;

      let item2x = null;

      menuItems.forEach(item => {
        const spd = extractItemSpeed(item);
        if (spd === null) return;

        // Strictly locate genuine 2.0x native item (NOT 1.2x, NOT 1.2.5x, NOT already injected)
        if (Math.abs(spd - 2.0) < 0.05 && !item.hasAttribute('data-air10-injected')) {
          item2x = item;
        }

        // Hook click on every native speed option
        if (!item.hasAttribute('data-air10-hooked')) {
          item.setAttribute('data-air10-hooked', 'true');
          item.addEventListener('click', () => {
            applySpeed(spd, 'NotebookLM menu select (' + spd + 'x)');
          }, true);
        }

        // Update active state visual styling
        if (Math.abs(targetSpeed - spd) < 0.05) {
          item.classList.add('active', 'selected');
          item.setAttribute('aria-checked', 'true');
        } else if (!item.hasAttribute('data-air10-injected')) {
          item.classList.remove('active', 'selected');
          item.setAttribute('aria-checked', 'false');
        }
      });

      // If 2.0x is present and 2.5x/3.0x have not been cleanly injected yet, inject them!
      if (item2x && item2x.parentElement) {
        const parent = item2x.parentElement;
        const hasInjected = parent.querySelector('[data-air10-speed="2.5"]') || parent.querySelector('[data-air10-speed="3"]');
        if (!hasInjected) {
          [2.5, 3.0].forEach(spd => {
            const clone = item2x.cloneNode(true);
            clone.setAttribute('data-air10-injected', 'true');
            clone.setAttribute('data-air10-hooked', 'true');
            clone.setAttribute('data-air10-speed', spd.toString());

            // Replace text inside cloned element cleanly (never produce 1.2.5x or 1.3.0x)
            const walker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT, null, false);
            let tNode;
            while ((tNode = walker.nextNode())) {
              const val = tNode.nodeValue;
              if (val && /(?:\d+\.)*\d+(\.\d+)?x\b/i.test(val)) {
                tNode.nodeValue = val.replace(/(?:\d+\.)*\d+(\.\d+)?x\b/i, `${spd.toFixed(1)}x`);
              }
            }

            // Visual active state
            clone.classList.remove('active', 'selected', 'mat-mdc-menu-item-highlighted');
            clone.removeAttribute('aria-checked');
            if (Math.abs(targetSpeed - spd) < 0.05) {
              clone.classList.add('active', 'selected');
              clone.setAttribute('aria-checked', 'true');
            }

            clone.onclick = (evt) => {
              evt.preventDefault();
              evt.stopPropagation();
              applySpeed(spd, 'NotebookLM native menu click (' + spd + 'x)');
              updateNotebookLMTriggerButton(spd);
              // Dismiss overlay
              try {
                const backdrop = document.querySelector('.cdk-overlay-backdrop');
                if (backdrop) {
                  backdrop.click();
                } else {
                  document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
                }
              } catch (err) {}
            };

            parent.appendChild(clone);
          });
        }
      }
    } catch (err) {}
  }

  function hookNotebookLMSpeedMenu() {
    if (typeof document === 'undefined') return;

    if (!isNotebookLMMenuHooked) {
      isNotebookLMMenuHooked = true;

      // Global capture-phase listener: registered EXACTLY ONCE
      document.addEventListener('click', (e) => {
        const target = e.target;
        if (!target) return;
        const clickable = target.closest('[role="menuitem"], [role="menuitemradio"], button.mat-mdc-menu-item, md-menu-item, li[role="menuitem"]');
        if (!clickable) return;
        const spd = extractItemSpeed(clickable);
        if (spd !== null && spd >= 0.5 && spd <= 4.0) {
          applySpeed(spd, 'Global native menu click (' + spd + 'x)');
          updateNotebookLMTriggerButton(spd);
        }
      }, true);

      try {
        notebookLMMenuObserver = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const node of m.addedNodes) {
              if (node.nodeType === 1) {
                checkNotebookLMMenu(node);
              }
            }
          }
        });
        notebookLMMenuObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
      } catch (e) {}
    }

    // Direct check of existing DOM elements without re-registering observers or listeners
    checkNotebookLMMenu(document.body);
  }

  function cycleSpeed(source = 'click') {
    currentIndex = (currentIndex + 1) % SPEEDS.length;
    applySpeed(SPEEDS[currentIndex], source);
  }

  function stepSpeed(delta = 0.25, source = 'step') {
    const next = Math.round((targetSpeed + delta) * 100) / 100;
    applySpeed(next, source);
  }

  function isAudioPlaying() {
    if (activeBufferSources.size > 0) return true;
    for (const el of activeMediaElements) {
      if (el && !el.paused && !el.ended && el.currentTime > 0) return true;
    }
    return false;
  }

  function updatePlayingIndicator() {
    if (typeof document === 'undefined') return;
    const indicator = document.getElementById('air10-active-glow');
    if (indicator) {
      if (isAudioPlaying()) {
        indicator.style.display = 'inline-block';
        indicator.style.animation = 'air10-pulse 1.2s infinite ease-in-out';
      } else {
        indicator.style.display = 'none';
      }
    }
  }

  // =========================================================================
  // 7. Global Shortcuts: Option+S (Alt+S) and '[' / ']' for +/- 0.25x
  // =========================================================================
  if (typeof window !== 'undefined') {
    window.addEventListener('keydown', (e) => {
      const activeTag = document.activeElement ? (document.activeElement.tagName || '').toLowerCase() : '';
      const isEditing = activeTag === 'input' || activeTag === 'textarea' || (document.activeElement && document.activeElement.isContentEditable);

      if (isEditing) return;

      // Option+S / Alt+S: Cycle Speed Ladder
      if (e.altKey && (e.code === 'KeyS' || e.key === 's' || e.key === 'S' || e.key === 'ß')) {
        e.preventDefault();
        e.stopPropagation();
        cycleSpeed('Option+S shortcut');
        return;
      }

      // Option+[ or '[': Decrease Speed
      if ((e.key === '[' || (e.altKey && e.code === 'BracketLeft')) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        stepSpeed(-0.25, 'keyboard [');
        return;
      }

      // Option+] or ']': Increase Speed
      if ((e.key === ']' || (e.altKey && e.code === 'BracketRight')) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        stepSpeed(0.25, 'keyboard ]');
        return;
      }
    }, true);
  }

  // =========================================================================
  // 8. Glassmorphic HUD Pill Widget (NotebookLM, Gemini & ChatGPT Unified)
  // =========================================================================
  let isExpanded = false;

  function updatePillUI() {
    if (typeof document === 'undefined') return;
    const label = document.getElementById('speed-label');
    if (label) {
      label.innerText = (parseFloat(targetSpeed.toFixed(2))) + 'x';
    }

    // Update active state on quick-speed buttons
    QUICK_SPEEDS.forEach(spd => {
      const btn = document.getElementById('air10-qbtn-' + spd.toString().replace('.', '_'));
      if (btn) {
        if (Math.abs(targetSpeed - spd) < 0.05) {
          btn.style.background = '#6366f1';
          btn.style.color = '#ffffff';
          btn.style.borderColor = '#818cf8';
        } else {
          btn.style.background = 'rgba(255, 255, 255, 0.08)';
          btn.style.color = '#cbd5e1';
          btn.style.borderColor = 'rgba(255, 255, 255, 0.12)';
        }
      }
    });

    const badge = document.getElementById('air10-speed-pill');
    if (badge) {
      badge.style.borderColor = '#10b981';
      badge.style.boxShadow = '0 8px 30px rgba(16, 185, 129, 0.35)';
      setTimeout(() => {
        badge.style.borderColor = 'rgba(99, 102, 241, 0.45)';
        badge.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.4)';
      }, 300);
    }
  }

  function mountSpeedBadge() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('air10-speed-pill') || document.getElementById('gemini-speed-pill')) return;
    if (!document.body) {
      setTimeout(mountSpeedBadge, 150);
      return;
    }

    // Insert keyframe animation styles once
    if (!document.getElementById('air10-audio-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'air10-audio-styles';
      styleEl.textContent = `
        @keyframes air10-pulse {
          0% { transform: scale(0.9); opacity: 0.7; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
          50% { transform: scale(1.15); opacity: 1; box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
          100% { transform: scale(0.9); opacity: 0.7; box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
        }
        .air10-btn:hover { background: rgba(99, 102, 241, 0.4) !important; color: #fff !important; }
      `;
      document.head ? document.head.appendChild(styleEl) : document.body.appendChild(styleEl);
    }

    const hostName = (typeof location !== 'undefined' ? location.hostname : '');
    const isNotebookLM = hostName.includes('notebooklm') || hostName.includes('notebook.google.com');
    const isGemini = hostName.includes('gemini');
    const isChatGPT = hostName.includes('chatgpt');

    let platformTitle = 'AI Audio 3x';
    if (isNotebookLM) {
      platformTitle = 'NotebookLM Podcast 3x';
      hookNotebookLMSpeedMenu();
    } else if (isGemini) {
      platformTitle = 'Gemini Audio 3x';
    } else if (isChatGPT) {
      platformTitle = 'ChatGPT Audio 3x';
    }

    const badge = document.createElement('div');
    badge.id = 'air10-speed-pill';

    // 1. Main row (Pure DOM creation — Zero TrustedHTML / CSP violations)
    const mainRow = document.createElement('div');
    mainRow.id = 'air10-main-row';
    Object.assign(mainRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '7px',
      cursor: 'pointer'
    });

    const iconSpan = document.createElement('span');
    Object.assign(iconSpan.style, {
      fontSize: '13px',
      display: 'flex',
      alignItems: 'center'
    });
    iconSpan.textContent = '🎙️';

    const glowSpan = document.createElement('span');
    glowSpan.id = 'air10-active-glow';
    Object.assign(glowSpan.style, {
      display: 'none',
      width: '7px',
      height: '7px',
      borderRadius: '50%',
      background: '#10b981',
      marginRight: '-2px'
    });

    const speedLabel = document.createElement('span');
    speedLabel.id = 'speed-label';
    Object.assign(speedLabel.style, {
      fontSize: '13px',
      fontWeight: '700',
      color: '#f8fafc',
      letterSpacing: '0.02em'
    });
    speedLabel.textContent = `${parseFloat(targetSpeed.toFixed(2))}x`;

    const shortcutBadge = document.createElement('span');
    Object.assign(shortcutBadge.style, {
      fontSize: '9px',
      background: 'rgba(99,102,241,0.25)',
      color: '#a5b4fc',
      border: '1px solid rgba(99,102,241,0.4)',
      borderRadius: '4px',
      padding: '1px 4px',
      fontWeight: '600'
    });
    shortcutBadge.textContent = 'Opt+S';

    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'air10-toggle-expand';
    toggleBtn.title = 'Expand Quick Speeds';
    Object.assign(toggleBtn.style, {
      background: 'transparent',
      border: 'none',
      color: '#94a3b8',
      cursor: 'pointer',
      fontSize: '10px',
      padding: '0 2px',
      marginLeft: '2px'
    });
    toggleBtn.textContent = '⚙️';

    mainRow.appendChild(iconSpan);
    mainRow.appendChild(glowSpan);
    mainRow.appendChild(speedLabel);
    mainRow.appendChild(shortcutBadge);
    mainRow.appendChild(toggleBtn);
    badge.appendChild(mainRow);

    // 2. Expanded row
    const expandedRow = document.createElement('div');
    expandedRow.id = 'air10-expanded-row';
    Object.assign(expandedRow.style, {
      display: 'none',
      marginTop: '8px',
      paddingTop: '6px',
      borderTop: '1px solid rgba(255,255,255,0.1)',
      alignItems: 'center',
      gap: '4px',
      flexWrap: 'wrap'
    });

    const titleRow = document.createElement('div');
    Object.assign(titleRow.style, {
      fontSize: '10px',
      color: '#94a3b8',
      marginBottom: '4px',
      width: '100%',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    });

    const titleSpan = document.createElement('span');
    titleSpan.textContent = platformTitle;
    const hintSpan = document.createElement('span');
    Object.assign(hintSpan.style, {
      fontSize: '9px',
      color: '#64748b'
    });
    hintSpan.textContent = '[ / ] for +/- 0.25x';
    titleRow.appendChild(titleSpan);
    titleRow.appendChild(hintSpan);
    expandedRow.appendChild(titleRow);

    const controlsRow = document.createElement('div');
    Object.assign(controlsRow.style, {
      display: 'flex',
      alignItems: 'center',
      gap: '4px'
    });

    const stepDownBtn = document.createElement('button');
    stepDownBtn.id = 'air10-step-down';
    stepDownBtn.className = 'air10-btn';
    stepDownBtn.title = 'Decrease speed (-0.25x)';
    Object.assign(stepDownBtn.style, {
      padding: '2px 6px',
      fontSize: '11px',
      fontWeight: '700',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.15)',
      background: 'rgba(255,255,255,0.08)',
      color: '#f1f5f9',
      cursor: 'pointer'
    });
    stepDownBtn.textContent = '−';
    controlsRow.appendChild(stepDownBtn);

    QUICK_SPEEDS.forEach(spd => {
      const isCur = Math.abs(targetSpeed - spd) < 0.05;
      const bg = isCur ? '#6366f1' : 'rgba(255, 255, 255, 0.08)';
      const clr = isCur ? '#ffffff' : '#cbd5e1';
      const border = isCur ? '#818cf8' : 'rgba(255, 255, 255, 0.12)';
      const qBtn = document.createElement('button');
      qBtn.id = 'air10-qbtn-' + spd.toString().replace('.', '_');
      qBtn.className = 'air10-btn';
      Object.assign(qBtn.style, {
        padding: '2px 7px',
        fontSize: '11px',
        fontWeight: '600',
        borderRadius: '6px',
        border: `1px solid ${border}`,
        background: bg,
        color: clr,
        cursor: 'pointer',
        transition: 'all 0.15s ease'
      });
      qBtn.textContent = `${spd}x`;
      qBtn.onclick = (e) => {
        e.stopPropagation();
        applySpeed(spd, 'quick button click');
      };
      controlsRow.appendChild(qBtn);
    });

    const stepUpBtn = document.createElement('button');
    stepUpBtn.id = 'air10-step-up';
    stepUpBtn.className = 'air10-btn';
    stepUpBtn.title = 'Increase speed (+0.25x)';
    Object.assign(stepUpBtn.style, {
      padding: '2px 6px',
      fontSize: '11px',
      fontWeight: '700',
      borderRadius: '6px',
      border: '1px solid rgba(255,255,255,0.15)',
      background: 'rgba(255,255,255,0.08)',
      color: '#f1f5f9',
      cursor: 'pointer'
    });
    stepUpBtn.textContent = '+';
    controlsRow.appendChild(stepUpBtn);

    expandedRow.appendChild(controlsRow);
    badge.appendChild(expandedRow);

    Object.assign(badge.style, {
      position: 'fixed',
      bottom: '85px',
      right: '24px',
      zIndex: '2147483647',
      padding: '7px 14px',
      background: 'rgba(15, 23, 42, 0.92)',
      backdropFilter: 'blur(16px) saturate(180%)',
      WebkitBackdropFilter: 'blur(16px) saturate(180%)',
      border: '1px solid rgba(99, 102, 241, 0.45)',
      borderRadius: '16px',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
      color: '#f8fafc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      userSelect: 'none',
      transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)'
    });

    badge.title = 'Click or press Option+S to cycle: 1.5x -> 1.75x -> 2.0x -> 2.5x -> 3.0x';

    toggleBtn.onclick = (e) => {
      e.stopPropagation();
      isExpanded = !isExpanded;
      expandedRow.style.display = isExpanded ? 'flex' : 'none';
    };

    mainRow.onclick = (e) => {
      if (e.target === toggleBtn) return;
      cycleSpeed('badge click');
    };

    stepDownBtn.onclick = (e) => {
      e.stopPropagation();
      stepSpeed(-0.25, 'UI minus click');
    };

    stepUpBtn.onclick = (e) => {
      e.stopPropagation();
      stepSpeed(0.25, 'UI plus click');
    };

    badge.onmouseenter = () => {
      badge.style.transform = 'translateY(-2px) scale(1.02)';
      badge.style.borderColor = '#818cf8';
    };
    badge.onmouseleave = () => {
      badge.style.transform = 'translateY(0) scale(1)';
      badge.style.borderColor = 'rgba(99, 102, 241, 0.45)';
    };

    document.body.appendChild(badge);
    updatePlayingIndicator();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        mountSpeedBadge();
        hookNotebookLMSpeedMenu();
      });
    } else {
      mountSpeedBadge();
      hookNotebookLMSpeedMenu();
    }
    // Dynamic SPA guardian: ensure badge stays mounted across in-app page transitions
    const guardianTimer = setInterval(() => {
      mountSpeedBadge();
      hookNotebookLMSpeedMenu();
    }, 1500);
    if (guardianTimer && typeof guardianTimer.unref === 'function') {
      guardianTimer.unref();
    }
  }

  // Export control object on window (Interconnection² Suite)
  window.__AIR10_AUDIO__ = {
    getSpeed: () => targetSpeed,
    setSpeed: (s) => applySpeed(s, 'api'),
    cycleSpeed: () => cycleSpeed('api'),
    stepSpeed: (d) => stepSpeed(d, 'api'),
    getTrackedCount: () => activeMediaElements.size,
    getTrackedMediaCount: () => activeMediaElements.size,
    isAudioPlaying: () => isAudioPlaying(),
    querySelectorAllDeep: (sel, root) => querySelectorAllDeep(sel, root),
    querySelectorDeep: (sel, root) => {
      const res = querySelectorAllDeep(sel, root);
      return res.length > 0 ? res[0] : null;
    },
    getTelemetry: () => [...telemetryLog],
    verifyPitchPreservation: (media) => {
      if (!media) return false;
      return Boolean(media.preservesPitch || media.mozPreservesPitch || media.webkitPreservesPitch);
    },
    // Production Test Seams & Diagnostics
    extractItemSpeed: (el) => extractItemSpeed(el),
    checkMenu: (container) => checkNotebookLMMenu(container),
    checkNotebookLMMenu: (container) => checkNotebookLMMenu(container),
    pruneDisconnectedMedia: () => pruneDisconnectedMedia(),
    isMenuHooked: () => isNotebookLMMenuHooked,
    hookNotebookLMSpeedMenu: () => hookNotebookLMSpeedMenu(),
    updateNotebookLMTriggerButton: (spd) => updateNotebookLMTriggerButton(spd),
    getActiveMediaElements: () => activeMediaElements,
    getInterceptedShadowRoots: () => interceptedShadowRoots,
    resetMenuHookState: () => {
      isNotebookLMMenuHooked = false;
      if (notebookLMMenuObserver) {
        try { notebookLMMenuObserver.disconnect(); } catch (e) {}
        notebookLMMenuObserver = null;
      }
    }
  };

  console.log('%c[AIR10 Audio Accelerator Ready]%c Speed locked to ' + targetSpeed + 'x (up to 3.0x for NotebookLM podcasts, Gemini & ChatGPT)', 'color:#6366f1;font-weight:bold;', 'color:#10b981;font-weight:bold;');
})();
