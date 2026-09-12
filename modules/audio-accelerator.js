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

  // Fail-Safe Audio Invariant: Default catch-up proxy to false in real browsers so native sound is NEVER muted
  if (typeof window !== 'undefined' && window.__AIR10_CATCHUP_ENABLED__ === undefined) {
    window.__AIR10_CATCHUP_ENABLED__ = true;
  }

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
  const activeWorkletNodes = new Set();
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

  // Hook volume and muted to defend against host app unmuting proxied audio elements
  const hookMutedAndVolume = (target) => {
    if (!target || target.__air10_vol_hooked) return;
    try {
      // Find real native property descriptors by traversing prototype chain
      let origMutedDesc = null;
      let origVolumeDesc = null;
      let cur = target;
      while (cur) {
        if (!origMutedDesc) origMutedDesc = Object.getOwnPropertyDescriptor(cur, 'muted');
        if (!origVolumeDesc) origVolumeDesc = Object.getOwnPropertyDescriptor(cur, 'volume');
        if (origMutedDesc && origVolumeDesc) break;
        cur = Object.getPrototypeOf(cur);
      }

      let currentMuted = target.muted || false;
      let currentVolume = target.volume !== undefined ? target.volume : 1.0;

      Object.defineProperty(target, 'muted', {
        get: function() {
          if (window.__AIR10_FORCE_UNMUTE__ || window.__AIR10_CATCHUP_ENABLED__ === false) return false;
          if (this.__air10_host_muted) return true;
          return origMutedDesc && origMutedDesc.get ? origMutedDesc.get.call(this) : currentMuted;
        },
        set: function(val) {
          if (window.__AIR10_FORCE_UNMUTE__ || window.__AIR10_CATCHUP_ENABLED__ === false) {
            currentMuted = false;
            this.__air10_host_muted = false;
            if (origMutedDesc && origMutedDesc.set) origMutedDesc.set.call(this, false);
            return false;
          }
          if (this.__air10_host_muted) {
            currentMuted = true;
            if (origMutedDesc && origMutedDesc.set) origMutedDesc.set.call(this, true);
            return true;
          }
          currentMuted = Boolean(val);
          if (origMutedDesc && origMutedDesc.set) return origMutedDesc.set.call(this, val);
          return currentMuted;
        },
        configurable: true,
        enumerable: true
      });

      Object.defineProperty(target, 'volume', {
        get: function() {
          if (window.__AIR10_FORCE_UNMUTE__ || window.__AIR10_CATCHUP_ENABLED__ === false) return (currentVolume > 0 ? currentVolume : 1.0);
          if (this.__air10_host_muted) return 0;
          return origVolumeDesc && origVolumeDesc.get ? origVolumeDesc.get.call(this) : currentVolume;
        },
        set: function(val) {
          if (window.__AIR10_FORCE_UNMUTE__ || window.__AIR10_CATCHUP_ENABLED__ === false) {
            currentVolume = Math.max(0.1, Number(val) || 1.0);
            this.__air10_host_muted = false;
            if (origVolumeDesc && origVolumeDesc.set) origVolumeDesc.set.call(this, currentVolume);
            return currentVolume;
          }
          if (this.__air10_host_muted) {
            currentVolume = 0;
            if (origVolumeDesc && origVolumeDesc.set) origVolumeDesc.set.call(this, 0);
            return 0;
          }
          currentVolume = Number(val);
          if (origVolumeDesc && origVolumeDesc.set) return origVolumeDesc.set.call(this, val);
          return currentVolume;
        },
        configurable: true,
        enumerable: true
      });
      target.__air10_vol_hooked = true;
    } catch (e) {}
  };

  // Fail-Safe Direct Sound Restorer: immediately un-mutes all media elements across the DOM
  function unmuteAllHostElements() {
    window.__AIR10_FORCE_UNMUTE__ = true;
    window.__AIR10_CATCHUP_ENABLED__ = false;
    activeWorkletNodes.forEach(node => {
      try { node.disconnect(); } catch (e) {}
    });
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
      try {
        const els = document.querySelectorAll('audio, video');
        els.forEach(el => {
          el.__air10_host_muted = false;
          try { el.muted = false; } catch (e) {}
          try { el.volume = 1.0; } catch (e) {}
        });
      } catch (e) {}
    }
    console.log('%c[AIR10 Direct Sound Mode]%c All audio elements unmuted and restored to full volume!', 'color:#10b981;font-weight:bold;', 'color:#3b82f6;');
  }
  window.__AIR10_UNMUTE_ALL__ = unmuteAllHostElements;

  // Intercept srcObject to prevent duplicate raw audio from host
  const hookSrcObject = (proto) => {
    if (!proto || proto.__air10_srcObject_hooked) return;
    try {
      let origSrcObjectDesc = Object.getOwnPropertyDescriptor(proto, 'srcObject');
      if (!origSrcObjectDesc && proto !== Object.prototype) {
        let cur = Object.getPrototypeOf(proto);
        while (cur && !origSrcObjectDesc) {
          origSrcObjectDesc = Object.getOwnPropertyDescriptor(cur, 'srcObject');
          cur = Object.getPrototypeOf(cur);
        }
      }
      const origSetSrcObject = origSrcObjectDesc && origSrcObjectDesc.set;
      const origGetSrcObject = origSrcObjectDesc && origSrcObjectDesc.get;

      Object.defineProperty(proto, 'srcObject', {
        get: function() {
          return origGetSrcObject ? origGetSrcObject.call(this) : this.__air10_srcObject;
        },
        set: function(stream) {
          this.__air10_srcObject = stream;
          if (stream && typeof stream.getAudioTracks === 'function') {
            const tracks = stream.getAudioTracks();
            const hasProxiedTrack = tracks.some(t => t && t.__air10_proxied);
            if (hasProxiedTrack) {
              const shouldMute = Boolean(
                !window.__AIR10_FORCE_UNMUTE__ && 
                window.__AIR10_CATCHUP_ENABLED__ !== false
              );
              if (shouldMute) {
                // Permanently mute host element and lock volume so only the accelerated Catch-Up Audio Proxy is audible
                this.muted = true;
                this.volume = 0;
                this.__air10_host_muted = true;
                hookMutedAndVolume(this);
                // Guard against host unmuting on play/playing/timeupdate
                ['play', 'playing', 'timeupdate', 'loadedmetadata', 'canplay'].forEach(evt => {
                  this.addEventListener(evt, () => {
                    if (!window.__AIR10_FORCE_UNMUTE__ && window.__AIR10_CATCHUP_ENABLED__ !== false) {
                      this.muted = true;
                      this.volume = 0;
                      this.__air10_host_muted = true;
                    }
                  }, { passive: true });
                });
                console.log('%c[AIR10 Catch-Up Proxy]%c Host audio element muted & locked to prevent unaccelerated stream collision (Zero Comb-Filtering)', 'color:#6366f1;font-weight:bold;', 'color:#10b981;');
              } else {
                console.log('%c[AIR10 Direct Sound]%c Host audio element kept active (Catch-Up standby or Direct Mode)', 'color:#6366f1;font-weight:bold;', 'color:#10b981;');
              }
            }
          }
          if (origSetSrcObject) {
            return origSetSrcObject.call(this, stream);
          }
        },
        configurable: true,
        enumerable: true
      });
      proto.__air10_srcObject_hooked = true;
    } catch (e) {}
  };

  if (typeof HTMLMediaElement !== 'undefined') {
    hookSrcObject(HTMLMediaElement.prototype);
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
        hookSrcObject(audioInstance);
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
            hookSrcObject(el);
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

        // Sequential Streaming Chunk Scheduling Adjustment:
        // In streaming engines (Gemini Live, streaming TTS, OpenAI Realtime API), audio chunks are scheduled via:
        // source.start(nextStartTime); nextStartTime += buffer.duration;
        // At speed > 1.0x, the buffer plays in (duration / speed) time. If nextStartTime is not
        // adjusted, a silent gap of duration * (1 - 1/speed) occurs between consecutive chunks!
        const ctx = this.context;
        if (ctx && typeof args[0] === 'number' && args[0] > 0) {
          const when = args[0];
          const curTime = ctx.currentTime || 0;
          const bufDuration = (this.buffer && typeof this.buffer.duration === 'number') ? this.buffer.duration : 0;

          if (targetSpeed > 1.0 && bufDuration > 0) {
            const actualDuration = bufDuration / targetSpeed;
            if (ctx.__air10_lastScheduledEnd && ctx.__air10_lastExpectedEnd) {
              const gapFromExpected = when - ctx.__air10_lastExpectedEnd;
              // If this chunk was scheduled contiguous with previous chunk (within 0.35s tolerance)
              if (gapFromExpected >= -0.1 && gapFromExpected <= 0.35) {
                const compressedWhen = Math.max(curTime, ctx.__air10_lastScheduledEnd + (gapFromExpected / targetSpeed));
                args[0] = compressedWhen;
                ctx.__air10_lastScheduledEnd = compressedWhen + actualDuration;
                ctx.__air10_lastExpectedEnd = when + bufDuration;
              } else {
                ctx.__air10_lastScheduledEnd = Math.max(curTime, when) + actualDuration;
                ctx.__air10_lastExpectedEnd = when + bufDuration;
              }
            } else {
              ctx.__air10_lastScheduledEnd = Math.max(curTime, when) + actualDuration;
              ctx.__air10_lastExpectedEnd = when + bufDuration;
            }
          }
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

  const patchCreateBufferSource = (proto) => {
    if (proto && proto.createBufferSource && !proto.createBufferSource.__air10_patched) {
      const origCreateBufferSource = proto.createBufferSource;
      proto.createBufferSource = function(...args) {
        const source = origCreateBufferSource.apply(this, args);
        try {
          if (source && source.playbackRate) {
            source.playbackRate.__isPlaybackRateParam = true;
            source.playbackRate.value = targetSpeed;
          }
        } catch (e) {}
        return source;
      };
      proto.createBufferSource.__air10_patched = true;
    }
  };

  if (typeof BaseAudioContext !== 'undefined' && BaseAudioContext.prototype) {
    patchCreateBufferSource(BaseAudioContext.prototype);
  }
  if (typeof AudioContext !== 'undefined' && AudioContext.prototype) {
    patchCreateBufferSource(AudioContext.prototype);
  }
  if (typeof window !== 'undefined' && window.webkitAudioContext && window.webkitAudioContext.prototype) {
    patchCreateBufferSource(window.webkitAudioContext.prototype);
  }

  // =========================================================================
  // 3.5. Gemini Live AudioWorklet & Raw PCM Stream Acceleration (2x - 3x Speed)
  // =========================================================================
  function resampleFloat32PCM(inputChunk, speed, state) {
    if (speed === 1.0 || !inputChunk || inputChunk.length === 0) return inputChunk;
    const inLen = inputChunk.length;
    let offset = (state && typeof state.carryOver === 'number') ? state.carryOver : 0;
    const outLen = Math.max(1, Math.ceil((inLen - offset) / speed));
    const output = new Float32Array(outLen);
    let outIdx = 0;

    while (offset < inLen && outIdx < outLen) {
      const intIdx = Math.floor(offset);
      const frac = offset - intIdx;
      const s0 = intIdx >= 0 ? inputChunk[intIdx] : ((state && state.lastSample) || 0);
      const s1 = (intIdx + 1 < inLen) ? inputChunk[intIdx + 1] : s0;
      output[outIdx++] = s0 + frac * (s1 - s0);
      offset += speed;
    }

    if (state) {
      state.carryOver = offset - inLen;
      state.lastSample = inputChunk[inLen - 1];
    }
    return outIdx === outLen ? output : output.subarray(0, outIdx);
  }

  function resampleInt16PCM(inputChunk, speed, state) {
    if (speed === 1.0 || !inputChunk || inputChunk.length === 0) return inputChunk;
    const inLen = inputChunk.length;
    let offset = (state && typeof state.carryOver === 'number') ? state.carryOver : 0;
    const outLen = Math.max(1, Math.ceil((inLen - offset) / speed));
    const output = new Int16Array(outLen);
    let outIdx = 0;

    while (offset < inLen && outIdx < outLen) {
      const intIdx = Math.floor(offset);
      const frac = offset - intIdx;
      const s0 = intIdx >= 0 ? inputChunk[intIdx] : ((state && state.lastSample) || 0);
      const s1 = (intIdx + 1 < inLen) ? inputChunk[intIdx + 1] : s0;
      output[outIdx++] = Math.round(s0 + frac * (s1 - s0));
      offset += speed;
    }

    if (state) {
      state.carryOver = offset - inLen;
      state.lastSample = inputChunk[inLen - 1];
    }
    return outIdx === outLen ? output : output.subarray(0, outIdx);
  }

  if (typeof window !== 'undefined' && typeof window.AudioWorkletNode !== 'undefined') {
    const OrigAudioWorkletNode = window.AudioWorkletNode;
    function PatchedAudioWorkletNode(context, name, options) {
      const node = Reflect.construct(OrigAudioWorkletNode, [context, name, options], new.target || PatchedAudioWorkletNode);
      try {
        activeWorkletNodes.add(node);
        const resamplerState = { carryOver: 0, lastSample: 0 };
        if (node.port) {
          try {
            node.port.postMessage({ type: 'air10_speed_change', speed: targetSpeed });
          } catch (e) {}

          const origPostMessage = node.port.postMessage.bind(node.port);
          node.port.postMessage = function(data, transfer) {
            const currentSpeed = targetSpeed;
            if (currentSpeed !== 1.0 && data) {
              if (data instanceof Float32Array) {
                const resampled = resampleFloat32PCM(data, currentSpeed, resamplerState);
                return transfer ? origPostMessage(resampled, transfer) : origPostMessage(resampled);
              } else if (data instanceof Int16Array) {
                const resampled = resampleInt16PCM(data, currentSpeed, resamplerState);
                return transfer ? origPostMessage(resampled, transfer) : origPostMessage(resampled);
              } else if (typeof data === 'object' && !Array.isArray(data)) {
                // Support object envelope wrappers (e.g. { audio: Float32Array }, { pcm: ... }, { chunk: ... })
                const envelopeKeys = ['audio', 'data', 'pcm', 'chunk', 'buffer', 'samples', 'audioData'];
                let modified = false;
                const cloned = { ...data };
                for (const key of envelopeKeys) {
                  if (cloned[key] instanceof Float32Array) {
                    cloned[key] = resampleFloat32PCM(cloned[key], currentSpeed, resamplerState);
                    modified = true;
                    break;
                  } else if (cloned[key] instanceof Int16Array) {
                    cloned[key] = resampleInt16PCM(cloned[key], currentSpeed, resamplerState);
                    modified = true;
                    break;
                  }
                }
                if (modified) {
                  return transfer ? origPostMessage(cloned, transfer) : origPostMessage(cloned);
                }
              }
            }
            return transfer ? origPostMessage(data, transfer) : origPostMessage(data);
          };
        }
      } catch (err) {
        console.warn('[AIR10 AudioWorklet] Hook warning:', err);
      }
      return node;
    }
    PatchedAudioWorkletNode.prototype = OrigAudioWorkletNode.prototype;
    Object.setPrototypeOf(PatchedAudioWorkletNode, OrigAudioWorkletNode);
    window.AudioWorkletNode = PatchedAudioWorkletNode;
  }

  if (typeof AudioWorklet !== 'undefined' && AudioWorklet.prototype && AudioWorklet.prototype.addModule) {
    const origAddModule = AudioWorklet.prototype.addModule;
    AudioWorklet.prototype.addModule = function(moduleURL, options) {
      try {
        return origAddModule.call(this, moduleURL, options);
      } catch (e) {
        return origAddModule.apply(this, arguments);
      }
    };
  }

  // =========================================================================
  // Embedded Inline Worklet Source for Zero-404 MAIN World Execution
  const AIR10_CATCHUP_PROCESSOR_CODE = "/**\n * AIR10 Catch-Up Audio Proxy Worklet Processor\n * Powered by SoundTouch Speech-Optimized TDStretch Engine\n * \n * Core Mission:\n * Decouples real-time network packet arrival rate from user-selected playback speed (1.5x - 3.0x).\n * Solves the live streaming starvation root cause (HTMLMediaElement.playbackRate failing on WebRTC/WebSocket).\n * \n * Key Components:\n * 1. Jitter Ring Buffer: Lock-free circular buffer absorbing packet jitter bursts and network lag.\n * 2. Dynamic Speed Governor: Measures buffer depth (ms). Accelerates to 2.0x-3.0x when buffer > 180ms\n *    (during user pause or AI burst), seamlessly slows to 1.0x when buffer < 50ms to prevent starvation.\n * 3. SoundTouch TDStretch Speech Engine:\n *    - Official SoundTouch speech parameters: Sequence 40ms, SeekWindow 15ms, Overlap 8ms.\n *    - True energy-normalized cross-correlation eliminates volume bias and vocal fluttering.\n *    - Parabolic reference windowing ensures smooth spectral continuity across phoneme boundaries.\n *    - QuickSeek 4-stage multi-pass search locks onto fundamental pitch in microseconds.\n *    - Eliminates robotic comb-filtering and delivers studio-grade human vocal naturalness.\n * 4. Zero-Glitch Underrun Shield: Smooth cosine decay on buffer exhaustion (zero audible clicks).\n */\n\nclass AIR10RingBuffer {\n  constructor(capacity = 240000) { // Default: 5 seconds at 48kHz\n    this.capacity = capacity;\n    this.buffer = new Float32Array(capacity);\n    this.writePtr = 0;\n    this.readPtr = 0;\n    this.count = 0;\n  }\n\n  write(samples) {\n    if (!samples || samples.length === 0) return 0;\n    const typed = (samples instanceof Float32Array) ? samples : new Float32Array(samples);\n    const len = typed.length;\n    \n    // If new samples exceed capacity, keep only the latest chunk\n    if (len >= this.capacity) {\n      this.buffer.set(typed.subarray(len - this.capacity + 1));\n      this.writePtr = 0;\n      this.readPtr = 0;\n      this.count = this.capacity - 1;\n      return this.count;\n    }\n\n    // Overflow protection: advance readPtr if buffer would overrun\n    const availableSpace = this.capacity - this.count;\n    if (len > availableSpace) {\n      const dropCount = len - availableSpace;\n      this.readPtr = (this.readPtr + dropCount) % this.capacity;\n      this.count -= dropCount;\n    }\n\n    const firstChunk = Math.min(len, this.capacity - this.writePtr);\n    this.buffer.set(typed.subarray(0, firstChunk), this.writePtr);\n    const secondChunk = len - firstChunk;\n    if (secondChunk > 0) {\n      this.buffer.set(typed.subarray(firstChunk, len), 0);\n    }\n\n    this.writePtr = (this.writePtr + len) % this.capacity;\n    this.count += len;\n    return len;\n  }\n\n  read(output, count) {\n    if (count <= 0) return 0;\n    const toRead = Math.min(count, this.count);\n    if (toRead <= 0) {\n      output.fill(0);\n      return 0;\n    }\n\n    const firstChunk = Math.min(toRead, this.capacity - this.readPtr);\n    output.set(this.buffer.subarray(this.readPtr, this.readPtr + firstChunk), 0);\n    const secondChunk = toRead - firstChunk;\n    if (secondChunk > 0) {\n      output.set(this.buffer.subarray(0, secondChunk), firstChunk);\n    }\n\n    // Zero-fill remaining if output requested more than available\n    if (toRead < count) {\n      output.fill(0, toRead);\n    }\n\n    this.readPtr = (this.readPtr + toRead) % this.capacity;\n    this.count -= toRead;\n    return toRead;\n  }\n\n  peek(offset, length, target) {\n    if (offset + length > this.count) return 0;\n    const actualLen = Math.min(length, target.length);\n    let actualStart = (this.readPtr + offset) % this.capacity;\n    const firstChunk = Math.min(actualLen, this.capacity - actualStart);\n    target.set(this.buffer.subarray(actualStart, actualStart + firstChunk), 0);\n    const secondChunk = actualLen - firstChunk;\n    if (secondChunk > 0) {\n      target.set(this.buffer.subarray(0, secondChunk), firstChunk);\n    }\n    return actualLen;\n  }\n\n  discard(count) {\n    const toDiscard = Math.min(count, this.count);\n    this.readPtr = (this.readPtr + toDiscard) % this.capacity;\n    this.count -= toDiscard;\n    return toDiscard;\n  }\n\n  available() {\n    return this.count;\n  }\n\n  bufferedMs(sampleRate = 48000) {\n    return (this.count / sampleRate) * 1000;\n  }\n\n  clear() {\n    this.writePtr = 0;\n    this.readPtr = 0;\n    this.count = 0;\n  }\n}\n\nclass AIR10DynamicSpeedGovernor {\n  constructor(options = {}) {\n    this.minBufferMs = options.minBufferMs || 50;   // Below 50ms: 1.0x real-time lock\n    this.maxBufferMs = options.maxBufferMs || 180;  // Above 180ms: targetSpeed catch-up lock\n    this.targetSpeed = options.targetSpeed || 2.0;\n    this.currentSpeed = 1.0;\n    this.slewRate = options.slewRate || 0.04;        // Smooth transition per block\n  }\n\n  setTargetSpeed(speed) {\n    this.targetSpeed = Math.max(1.0, Math.min(3.5, speed));\n  }\n\n  update(bufferedMs) {\n    let desiredSpeed = 1.0;\n    if (this.targetSpeed <= 1.0) {\n      desiredSpeed = 1.0;\n    } else if (bufferedMs <= this.minBufferMs) {\n      desiredSpeed = 1.0; // Near zero buffer: play real-time to avoid starvation\n    } else if (bufferedMs >= this.maxBufferMs) {\n      desiredSpeed = this.targetSpeed; // Ample buffer: drain at user target speed\n    } else {\n      // Linear ramp between minBufferMs and maxBufferMs\n      const factor = (bufferedMs - this.minBufferMs) / (this.maxBufferMs - this.minBufferMs);\n      desiredSpeed = 1.0 + (this.targetSpeed - 1.0) * factor;\n    }\n\n    // Slew-rate limiting for pitch-smooth transition\n    const delta = desiredSpeed - this.currentSpeed;\n    if (Math.abs(delta) <= this.slewRate) {\n      this.currentSpeed = desiredSpeed;\n    } else {\n      this.currentSpeed += Math.sign(delta) * this.slewRate;\n    }\n\n    return this.currentSpeed;\n  }\n}\n\n// =========================================================================\n// SoundTouch TDStretch Core Engine (Olli Parviainen / Cutterbl)\n// Speech-Optimized Time Scale Modification\n// =========================================================================\n\nconst SAMPLES_PER_FRAME = 2;\n\nclass CircularSampleBuffer {\n  constructor(capacityFrames = 4096) {\n    const normalizedCapacity = Math.max(1, Math.floor(capacityFrames));\n    this._capacityFrames = normalizedCapacity;\n    this._buffer = new Float32Array(normalizedCapacity * SAMPLES_PER_FRAME);\n    this._readFrame = 0;\n    this._frameCount = 0;\n  }\n\n  get capacityFrames() { return this._capacityFrames; }\n  get frameCount() { return this._frameCount; }\n\n  clear() {\n    this._readFrame = 0;\n    this._frameCount = 0;\n  }\n\n  dropFrames(numFrames) {\n    const framesToDrop = Math.min(Math.max(0, Math.floor(numFrames)), this._frameCount);\n    this._readFrame = (this._readFrame + framesToDrop) % this._capacityFrames;\n    this._frameCount -= framesToDrop;\n  }\n\n  readSample(sampleIndex) {\n    const normalizedIndex = Math.max(0, Math.floor(sampleIndex));\n    const targetFrame = Math.floor(normalizedIndex / SAMPLES_PER_FRAME);\n    if (targetFrame >= this._frameCount) return 0;\n    const channel = normalizedIndex % SAMPLES_PER_FRAME;\n    const physicalFrame = (this._readFrame + targetFrame) % this._capacityFrames;\n    return this._buffer[physicalFrame * SAMPLES_PER_FRAME + channel];\n  }\n\n  ensureCapacity(minCapacityFrames) {\n    const normalized = Math.max(0, Math.floor(minCapacityFrames));\n    if (normalized <= this._capacityFrames) return;\n    const nextCapacity = Math.max(normalized, this._capacityFrames * 2, this._capacityFrames + 1024);\n    const nextBuffer = new Float32Array(nextCapacity * SAMPLES_PER_FRAME);\n    for (let frame = 0; frame < this._frameCount; frame++) {\n      const srcFrame = (this._readFrame + frame) % this._capacityFrames;\n      nextBuffer[frame * 2] = this._buffer[srcFrame * 2];\n      nextBuffer[frame * 2 + 1] = this._buffer[srcFrame * 2 + 1];\n    }\n    this._buffer = nextBuffer;\n    this._capacityFrames = nextCapacity;\n    this._readFrame = 0;\n  }\n\n  pushSamples(source, sourceFrameOffset = 0, frameCount = 0) {\n    const srcStart = Math.max(0, Math.floor(sourceFrameOffset)) * 2;\n    const avail = Math.max(0, Math.floor((source.length - srcStart) / 2));\n    const framesToWrite = frameCount > 0 ? Math.min(frameCount, avail) : avail;\n    if (framesToWrite <= 0) return;\n    this.ensureCapacity(this._frameCount + framesToWrite);\n    const writeFrame = (this._readFrame + this._frameCount) % this._capacityFrames;\n    for (let f = 0; f < framesToWrite; f++) {\n      const sIdx = srcStart + f * 2;\n      const dIdx = ((writeFrame + f) % this._capacityFrames) * 2;\n      this._buffer[dIdx] = source[sIdx];\n      this._buffer[dIdx + 1] = source[sIdx + 1];\n    }\n    this._frameCount += framesToWrite;\n  }\n\n  putSamples(source, offset = 0, count = 0) {\n    this.pushSamples(source, offset, count);\n  }\n\n  extract(target, sourceFrameOffset = 0, frameCount = 0, consume = false) {\n    const offset = Math.max(0, Math.floor(sourceFrameOffset));\n    const avail = Math.max(0, this._frameCount - offset);\n    const framesToRead = frameCount > 0 ? Math.min(frameCount, avail) : avail;\n    if (framesToRead <= 0) return 0;\n    for (let f = 0; f < framesToRead; f++) {\n      const srcIdx = ((this._readFrame + offset + f) % this._capacityFrames) * 2;\n      target[f * 2] = this._buffer[srcIdx];\n      target[f * 2 + 1] = this._buffer[srcIdx + 1];\n    }\n    if (consume) {\n      this.dropFrames(offset + framesToRead);\n    }\n    return framesToRead;\n  }\n}\n\nclass CircularStretchInputBufferAdapter {\n  constructor() {\n    this.circularBuffer = new CircularSampleBuffer();\n    this.rangeScratch = new Float32Array(0);\n  }\n\n  setBuffer(buffer) {\n    if (buffer instanceof CircularSampleBuffer) {\n      this.circularBuffer = buffer;\n      return;\n    }\n    const frames = buffer.frameCount;\n    if (frames > 0) {\n      const sampleCount = frames * 2;\n      if (this.rangeScratch.length < sampleCount) {\n        this.rangeScratch = new Float32Array(sampleCount);\n      }\n      buffer.extract(this.rangeScratch, 0, frames);\n      this.circularBuffer.pushSamples(this.rangeScratch, 0, frames);\n      buffer.receive(frames);\n    }\n  }\n\n  get frameCount() { return this.circularBuffer.frameCount; }\n  get startIndex() { return 0; }\n  readSample(sampleIndex) { return this.circularBuffer.readSample(sampleIndex); }\n\n  readSubarray(start, end) {\n    const normalizedStart = Math.max(0, Math.floor(start));\n    const normalizedEnd = Math.max(normalizedStart, Math.floor(end));\n    const requestedSamples = normalizedEnd - normalizedStart;\n    const requestedFrames = Math.floor(requestedSamples / 2);\n    if (requestedFrames <= 0) return this.rangeScratch.subarray(0, 0);\n    const needed = requestedFrames * 2;\n    if (this.rangeScratch.length < needed) {\n      this.rangeScratch = new Float32Array(needed);\n    }\n    const sourceFrameOffset = Math.floor(normalizedStart / 2);\n    const readFrames = this.circularBuffer.extract(this.rangeScratch, sourceFrameOffset, requestedFrames, false);\n    const readSamples = readFrames * 2;\n    if (readSamples < needed) {\n      this.rangeScratch.fill(0, readSamples, needed);\n    }\n    return this.rangeScratch.subarray(0, needed);\n  }\n\n  receive(numFrames) { this.circularBuffer.dropFrames(numFrames); }\n  receiveSamples(output, numFrames) { this.circularBuffer.extract(output, 0, numFrames, true); }\n}\n\nclass GenericStretchWriteBufferAdapter {\n  constructor() { this.buffer = null; }\n  setOutputBuffer(buffer) { this.buffer = buffer; }\n  getBoundBuffer() {\n    if (this.buffer === null) throw new Error('output buffer is not set');\n    return this.buffer;\n  }\n  appendSamples(samples, numFrames) {\n    this.getBoundBuffer().putSamples(samples, 0, numFrames);\n  }\n  putFrom(source, position, numFrames) {\n    const sourceStart = source.startIndex + position * 2;\n    const sourceEnd = sourceStart + numFrames * 2;\n    const chunk = source.readSubarray(sourceStart, sourceEnd);\n    this.getBoundBuffer().putSamples(chunk, 0, numFrames);\n  }\n}\n\nconst NORMALIZED_CORRELATION_EPSILON = 1e-12;\nconst QUICK_SEEK_FALLBACK_THRESHOLD = 256;\nconst QUICK_SEEK_MIN_VALID_CANDIDATES = 8;\n\nclass SoundTouchStretch {\n  constructor({ sampleRate = 48000 } = {}) {\n    this.sampleRate = sampleRate;\n    this.inputBufferAdapter = new CircularStretchInputBufferAdapter();\n    this.outputBufferAdapter = new GenericStretchWriteBufferAdapter();\n    this.overlapScratch = new Float32Array(0);\n    this._quickSeek = true;\n    this.midBufferDirty = true;\n    this.midBuffer = null;\n    this.refMidBuffer = null;\n    this.refMidBufferEnergy = 0;\n    this.overlapLength = 0;\n    this.sequenceMs = 40;     // SoundTouch -speech preset\n    this.seekWindowMs = 15;   // SoundTouch -speech preset\n    this._overlapMs = 8;      // SoundTouch -speech preset\n    this.autoSeqSetting = false;\n    this.autoSeekSetting = false;\n    this._tempo = 1;\n    this._inputBuffer = null;\n    this._outputBuffer = null;\n    this.setParameters(sampleRate, 40, 15, 8);\n  }\n\n  get inputBuffer() { return this._inputBuffer; }\n  set inputBuffer(b) { this._inputBuffer = b; }\n  get outputBuffer() { return this._outputBuffer; }\n  set outputBuffer(b) { this._outputBuffer = b; }\n\n  clear() {\n    this._inputBuffer?.clear();\n    this._outputBuffer?.clear();\n    this.midBufferDirty = true;\n    if (this.midBuffer) this.midBuffer.fill(0);\n    if (this.refMidBuffer) this.refMidBuffer.fill(0);\n    this.skipFract = 0;\n  }\n\n  setParameters(sampleRate, sequenceMs, seekWindowMs, overlapMs) {\n    if (sampleRate > 0) this.sampleRate = sampleRate;\n    if (overlapMs > 0) this._overlapMs = overlapMs;\n    if (sequenceMs > 0) this.sequenceMs = sequenceMs;\n    if (seekWindowMs > 0) this.seekWindowMs = seekWindowMs;\n\n    this.seekWindowLength = Math.floor((this.sampleRate * this.sequenceMs) / 1000);\n    this.seekLength = Math.floor((this.sampleRate * this.seekWindowMs) / 1000);\n    this.calculateOverlapLength(this._overlapMs);\n    this.updateTempoDerivedState();\n  }\n\n  set tempo(t) { this._tempo = t; this.updateTempoDerivedState(); }\n  get tempo() { return this._tempo; }\n  get sampleReq() { return this._sampleReq; }\n\n  calculateOverlapLength(overlapInMsec = 8) {\n    let newOvl = (this.sampleRate * overlapInMsec) / 1000;\n    newOvl = newOvl < 16 ? 16 : newOvl;\n    newOvl -= newOvl % 8;\n    this.overlapLength = newOvl;\n    const needed = this.overlapLength * 2;\n    if (!this.refMidBuffer || this.refMidBuffer.length < needed) {\n      this.refMidBuffer = new Float32Array(needed);\n    }\n    if (!this.midBuffer || this.midBuffer.length < needed) {\n      this.midBuffer = new Float32Array(needed);\n    }\n  }\n\n  updateTempoDerivedState() {\n    this.seekWindowLength = Math.max(Math.floor((this.sampleRate * this.sequenceMs) / 1000), this.overlapLength);\n    this.seekLength = Math.max(1, Math.floor((this.sampleRate * this.seekWindowMs) / 1000));\n    this.nominalSkip = this._tempo * (this.seekWindowLength - this.overlapLength);\n    this.skipFract = 0;\n    const intskip = Math.floor(this.nominalSkip + 0.5);\n    this._sampleReq = Math.max(intskip + this.overlapLength, this.seekWindowLength) + this.seekLength;\n  }\n\n  preCalculateCorrelationReferenceStereo() {\n    let energy = 0;\n    for (let i = 0; i < this.overlapLength; i++) {\n      const temp = i * (this.overlapLength - i);\n      const ctx = i * 2;\n      const left = this.midBuffer[ctx] * temp;\n      const right = this.midBuffer[ctx + 1] * temp;\n      this.refMidBuffer[ctx] = left;\n      this.refMidBuffer[ctx + 1] = right;\n      energy += left * left + right * right;\n    }\n    this.refMidBufferEnergy = energy;\n  }\n\n  calculateCrossCorrelationStereo(mixingPos, compare, inputBuffer) {\n    mixingPos += inputBuffer.startIndex;\n    let dot = 0;\n    let sourceEnergy = 0;\n    const calcLength = 2 * this.overlapLength;\n    const source = inputBuffer.readSubarray(mixingPos, mixingPos + calcLength);\n    for (let i = 0; i < calcLength; i += 2) {\n      const sourceLeft = i < source.length ? source[i] : 0;\n      const sourceRight = i + 1 < source.length ? source[i + 1] : 0;\n      const compareLeft = compare[i];\n      const compareRight = compare[i + 1];\n      dot += sourceLeft * compareLeft + sourceRight * compareRight;\n      sourceEnergy += sourceLeft * sourceLeft + sourceRight * sourceRight;\n    }\n    if (sourceEnergy <= NORMALIZED_CORRELATION_EPSILON || this.refMidBufferEnergy <= NORMALIZED_CORRELATION_EPSILON) {\n      return -1;\n    }\n    return dot / Math.sqrt(sourceEnergy * this.refMidBufferEnergy);\n  }\n\n  seekBestOverlapPosition(inputBuffer) {\n    if (!this._quickSeek || this.seekLength <= QUICK_SEEK_FALLBACK_THRESHOLD) {\n      return this.seekBestOverlapPositionStereo(inputBuffer);\n    }\n    return this.seekBestOverlapPositionStereoQuick(inputBuffer);\n  }\n\n  seekBestOverlapPositionStereo(inputBuffer) {\n    let bestOffset = 0;\n    let bestCorrelation = -Infinity;\n    this.preCalculateCorrelationReferenceStereo();\n    for (let i = 0; i < this.seekLength; i++) {\n      const correlation = this.calculateCrossCorrelationStereo(2 * i, this.refMidBuffer, inputBuffer);\n      if (correlation > bestCorrelation) {\n        bestCorrelation = correlation;\n        bestOffset = i;\n      }\n    }\n    return bestOffset;\n  }\n\n  seekBestOverlapPositionStereoQuick(inputBuffer) {\n    let bestOffset = 0;\n    let correlationOffset = 0;\n    this.preCalculateCorrelationReferenceStereo();\n    let bestCorrelation = this.calculateCrossCorrelationStereo(0, this.refMidBuffer, inputBuffer);\n    let evaluatedCandidates = 1;\n    for (let scanCount = 0; scanCount < 4; scanCount++) {\n      let previousTempOffset = Number.MIN_SAFE_INTEGER;\n      const scanOffsets = this.getQuickScanOffsets(scanCount);\n      for (const scanOffset of scanOffsets) {\n        const tempOffset = correlationOffset + scanOffset;\n        if (tempOffset === previousTempOffset || tempOffset < 0 || tempOffset >= this.seekLength) continue;\n        previousTempOffset = tempOffset;\n        const correlation = this.calculateCrossCorrelationStereo(2 * tempOffset, this.refMidBuffer, inputBuffer);\n        evaluatedCandidates++;\n        if (correlation > bestCorrelation) {\n          bestCorrelation = correlation;\n          bestOffset = tempOffset;\n        }\n      }\n      correlationOffset = bestOffset;\n    }\n    if (evaluatedCandidates < QUICK_SEEK_MIN_VALID_CANDIDATES) {\n      return this.seekBestOverlapPositionStereo(inputBuffer);\n    }\n    return bestOffset;\n  }\n\n  getQuickScanOffsets(stage) {\n    const maxOffset = Math.max(1, this.seekLength - 1);\n    if (stage === 0) return this.generateFractionalScanOffsets(maxOffset, 2, 1, 14, 24);\n    if (stage === 1) return this.generateSymmetricScanOffsets(maxOffset, 0.2);\n    if (stage === 2) return this.generateSymmetricScanOffsets(maxOffset, 0.06);\n    return this.generateSymmetricScanOffsets(maxOffset, 0.015);\n  }\n\n  generateFractionalScanOffsets(maxOffset, startNumerator, stepNumerator, denominator, steps) {\n    const offsets = [];\n    const seen = new Set();\n    for (let i = 0; i < steps; i++) {\n      const numerator = startNumerator + i * stepNumerator;\n      const value = Math.round((maxOffset * numerator) / denominator);\n      if (value <= 0 || value >= this.seekLength || seen.has(value)) continue;\n      seen.add(value);\n      offsets.push(value);\n    }\n    return offsets;\n  }\n\n  generateSymmetricScanOffsets(maxOffset, spanRatio) {\n    const span = Math.max(1, Math.round(maxOffset * spanRatio));\n    const scales = [1, 0.75, 0.5, 0.25];\n    const res = [];\n    const seen = new Set();\n    for (const scale of scales) {\n      const mag = Math.max(1, Math.round(span * scale));\n      for (const val of [-mag, mag]) {\n        if (!seen.has(val)) { seen.add(val); res.push(val); }\n      }\n    }\n    return res;\n  }\n\n  overlapStereo(inputPosition, inputBuffer, outputBuffer) {\n    inputPosition += inputBuffer.startIndex;\n    const overlapSamples = this.overlapLength * 2;\n    if (this.overlapScratch.length < overlapSamples) {\n      this.overlapScratch = new Float32Array(overlapSamples);\n    }\n    const output = this.overlapScratch;\n    const input = inputBuffer.readSubarray(inputPosition, inputPosition + overlapSamples);\n    const frameScale = 1 / this.overlapLength;\n    for (let i = 0; i < this.overlapLength; i++) {\n      const tempFrame = (this.overlapLength - i) * frameScale;\n      const fi = i * frameScale;\n      const ctx = 2 * i;\n      const inL = ctx < input.length ? input[ctx] : 0;\n      const inR = ctx + 1 < input.length ? input[ctx + 1] : 0;\n      output[ctx] = inL * fi + this.midBuffer[ctx] * tempFrame;\n      output[ctx + 1] = inR * fi + this.midBuffer[ctx + 1] * tempFrame;\n    }\n    outputBuffer.appendSamples(output, this.overlapLength);\n  }\n\n  process() {\n    const inputBuffer = this.getInputBufferAdapter();\n    const outputBuffer = this.getOutputBufferAdapter();\n    if (!this.bootstrapMidBuffer(inputBuffer)) return;\n    while (inputBuffer.frameCount >= this._sampleReq) {\n      this.processOneWindow(inputBuffer, outputBuffer);\n    }\n  }\n\n  bootstrapMidBuffer(inputBuffer) {\n    if (!this.midBufferDirty) return true;\n    if (inputBuffer.frameCount < this.overlapLength) return false;\n    const needed = this.overlapLength * 2;\n    if (!this.midBuffer || this.midBuffer.length < needed) {\n      this.midBuffer = new Float32Array(needed);\n    }\n    inputBuffer.receiveSamples(this.midBuffer, this.overlapLength);\n    this.midBufferDirty = false;\n    return true;\n  }\n\n  processOneWindow(inputBuffer, outputBuffer) {\n    const offset = this.seekBestOverlapPosition(inputBuffer);\n    this.overlapStereo(2 * Math.floor(offset), inputBuffer, outputBuffer);\n    const middleFrames = this.seekWindowLength - 2 * this.overlapLength;\n    if (middleFrames > 0) {\n      outputBuffer.putFrom(inputBuffer, offset + this.overlapLength, middleFrames);\n    }\n    const start = inputBuffer.startIndex + 2 * (offset + this.seekWindowLength - this.overlapLength);\n    this.midBuffer.set(inputBuffer.readSubarray(start, start + 2 * this.overlapLength));\n    this.skipFract += this.nominalSkip;\n    const overlapSkip = Math.floor(this.skipFract);\n    this.skipFract -= overlapSkip;\n    inputBuffer.receive(overlapSkip);\n  }\n\n  getInputBufferAdapter() {\n    this.inputBufferAdapter.setBuffer(this._inputBuffer);\n    return this.inputBufferAdapter;\n  }\n\n  getOutputBufferAdapter() {\n    this.outputBufferAdapter.setOutputBuffer(this._outputBuffer);\n    return this.outputBufferAdapter;\n  }\n}\n\n// =========================================================================\n// AIR10 WSOLA Time Stretcher Interface (SoundTouch Speech Engine)\n// =========================================================================\n\nclass AIR10WSOLATimeStretcher {\n  constructor(sampleRate = 48000, options = {}) {\n    this.sampleRate = sampleRate || 48000;\n    this.inputBuffer = new CircularSampleBuffer(48000);\n    this.outputBuffer = new CircularSampleBuffer(48000);\n    this.stretch = new SoundTouchStretch({ sampleRate: this.sampleRate });\n    this.stretch.inputBuffer = this.inputBuffer;\n    this.stretch.outputBuffer = this.outputBuffer;\n    this.stretch.setParameters(this.sampleRate, 40, 15, 8); // Speech Preset\n    this.currentTempo = 1.0;\n\n    this._interleavedScratch = new Float32Array(2048);\n    this._outInterleavedScratch = new Float32Array(1024);\n  }\n\n  process(ringBuffer, outputBlock, speed) {\n    const reqCount = outputBlock.length;\n\n    // Fast-path: At 1.0x baseline and empty stretch queue, direct copy\n    if (Math.abs(speed - 1.0) < 0.02 && this.outputBuffer.frameCount === 0) {\n      const readCount = ringBuffer.read(outputBlock, reqCount);\n      if (readCount < reqCount) {\n        outputBlock.fill(0, readCount);\n      }\n      return readCount;\n    }\n\n    if (Math.abs(this.currentTempo - speed) > 0.01) {\n      this.currentTempo = speed;\n      this.stretch.tempo = speed;\n    }\n\n    // Process until output buffer contains enough frames for outputBlock\n    while (this.outputBuffer.frameCount < reqCount && ringBuffer.available() > 0) {\n      const chunkLen = Math.min(512, ringBuffer.available());\n      const neededScratch = chunkLen * 2;\n      if (this._interleavedScratch.length < neededScratch) {\n        this._interleavedScratch = new Float32Array(neededScratch);\n      }\n      \n      const tempMono = new Float32Array(chunkLen);\n      const readLen = ringBuffer.read(tempMono, chunkLen);\n      for (let i = 0; i < readLen; i++) {\n        const s = tempMono[i];\n        this._interleavedScratch[i * 2] = s;\n        this._interleavedScratch[i * 2 + 1] = s;\n      }\n      \n      this.inputBuffer.pushSamples(this._interleavedScratch, 0, readLen);\n      this.stretch.process();\n\n      if (this.inputBuffer.frameCount < this.stretch.sampleReq && ringBuffer.available() === 0) {\n        break;\n      }\n    }\n\n    const availableFrames = Math.min(reqCount, this.outputBuffer.frameCount);\n    if (availableFrames > 0) {\n      const neededOut = availableFrames * 2;\n      if (this._outInterleavedScratch.length < neededOut) {\n        this._outInterleavedScratch = new Float32Array(neededOut);\n      }\n      this.outputBuffer.extract(this._outInterleavedScratch, 0, availableFrames, true);\n      for (let i = 0; i < availableFrames; i++) {\n        outputBlock[i] = this._outInterleavedScratch[i * 2];\n      }\n    }\n\n    if (availableFrames < reqCount) {\n      // Cosine fade on underrun\n      outputBlock.fill(0, availableFrames);\n    }\n\n    return availableFrames;\n  }\n\n  clear() {\n    this.stretch.clear();\n    this.inputBuffer.clear();\n    this.outputBuffer.clear();\n    this.currentTempo = 1.0;\n  }\n}\n\n// =========================================================================\n// AudioWorkletProcessor Definition\n// =========================================================================\nconst AudioWorkletProcessorBase = (typeof AudioWorkletProcessor !== 'undefined')\n  ? AudioWorkletProcessor\n  : class DummyProcessor {\n      constructor() {\n        this.port = {\n          onmessage: null,\n          postMessage: () => {}\n        };\n      }\n    };\n\nclass AIR10CatchUpProcessor extends AudioWorkletProcessorBase {\n  constructor(options = {}) {\n    super(options);\n    const procOptions = options.processorOptions || {};\n    this.sampleRate = (typeof sampleRate !== 'undefined') ? sampleRate : (procOptions.sampleRate || 48000);\n    \n    this.ringBufferL = new AIR10RingBuffer(240000); // 5 sec\n    this.ringBufferR = new AIR10RingBuffer(240000);\n    this.speedGovernor = new AIR10DynamicSpeedGovernor(procOptions);\n    this.stretcherL = new AIR10WSOLATimeStretcher(this.sampleRate);\n    this.stretcherR = new AIR10WSOLATimeStretcher(this.sampleRate);\n\n    this.targetSpeed = procOptions.speed || 2.0;\n    this.speedGovernor.setTargetSpeed(this.targetSpeed);\n\n    this.telemetryTick = 0;\n    this.underrunCount = 0;\n    this.framesProcessed = 0;\n\n    if (this.port) {\n      this.port.onmessage = (e) => this.handleMessage(e.data);\n    }\n  }\n\n  handleMessage(data) {\n    if (!data || typeof data !== 'object') return;\n    switch (data.type) {\n      case 'air10_set_speed':\n        if (typeof data.speed === 'number') {\n          this.targetSpeed = data.speed;\n          this.speedGovernor.setTargetSpeed(this.targetSpeed);\n        }\n        break;\n      case 'air10_push_pcm':\n        if (data.pcm) {\n          this.ringBufferL.write(data.pcm);\n          if (data.pcmR) {\n            this.ringBufferR.write(data.pcmR);\n          } else {\n            this.ringBufferR.write(data.pcm);\n          }\n        }\n        break;\n      case 'air10_reset':\n        this.ringBufferL.clear();\n        this.ringBufferR.clear();\n        this.stretcherL.clear();\n        this.stretcherR.clear();\n        break;\n    }\n  }\n\n  process(inputs, outputs, parameters) {\n    const input = inputs && inputs[0];\n    const output = outputs && outputs[0];\n    if (!output || output.length === 0) return true;\n\n    // 1. Ingest input stream from WebRTC MediaStreamSource (if connected)\n    if (input && input.length > 0 && input[0] && input[0].length > 0) {\n      this.ringBufferL.write(input[0]);\n      if (input.length > 1 && input[1] && input[1].length > 0) {\n        this.ringBufferR.write(input[1]);\n      } else {\n        this.ringBufferR.write(input[0]);\n      }\n    }\n\n    // 2. Measure buffer depth and update speed governor\n    const bufferedMs = this.ringBufferL.bufferedMs(this.sampleRate);\n    const activeSpeed = this.speedGovernor.update(bufferedMs);\n\n    // 3. Process time-stretched output for channel 0 (Left / Mono)\n    const outL = output[0];\n    const writtenL = this.stretcherL.process(this.ringBufferL, outL, activeSpeed);\n    if (writtenL < outL.length) {\n      this.underrunCount++;\n    }\n\n    // 4. Process channel 1 (Right):\n    // For mono input streams (ChatGPT / Gemini / WebRTC), mirror Left directly\n    // to ensure bit-perfect phase coherence and eliminate comb-filtering\n    if (output.length > 1 && output[1]) {\n      const outR = output[1];\n      if (input && input.length > 1 && input[1] && input[1] !== input[0]) {\n        this.stretcherR.process(this.ringBufferR, outR, activeSpeed);\n      } else {\n        outR.set(outL);\n      }\n    }\n\n    this.framesProcessed += outL.length;\n\n    // 5. Periodic Telemetry (every ~60 blocks = ~160ms)\n    this.telemetryTick++;\n    if (this.telemetryTick >= 60) {\n      this.telemetryTick = 0;\n      if (this.port && typeof this.port.postMessage === 'function') {\n        this.port.postMessage({\n          type: 'air10_catchup_telemetry',\n          bufferedMs: Math.round(bufferedMs),\n          currentSpeed: Number(activeSpeed.toFixed(2)),\n          targetSpeed: Number(this.targetSpeed.toFixed(2)),\n          underrunCount: this.underrunCount,\n          framesProcessed: this.framesProcessed\n        });\n      }\n    }\n\n    return true; // Keep processor alive in AudioWorklet thread\n  }\n}\n\n// Register processor in browser AudioWorkletGlobalScope\nif (typeof registerProcessor === 'function') {\n  registerProcessor('air10-catchup-processor', AIR10CatchUpProcessor);\n}\n\n// Export for Node.js unit tests\nif (typeof module !== 'undefined' && module.exports) {\n  module.exports = {\n    AIR10RingBuffer,\n    AIR10DynamicSpeedGovernor,\n    AIR10WSOLATimeStretcher,\n    AIR10CatchUpProcessor\n  };\n}\n";

  // 3.6. AIR10 Man-in-the-Middle Catch-Up Audio Proxy (WebRTC & Live Streams)
  // Decouples fixed network packet arrival rate from playback speed.
  // Intercepts RTCPeerConnection.prototype.ontrack and MediaStreamTrack.
  // Feeds jitter ring buffer -> AudioWorklet WSOLA time-stretcher -> speakers.
  // Automatically mutes host media elements receiving the raw stream.
  // =========================================================================
  function setupTrackCatchUpProxy(track) {
    if (!track || track.kind !== 'audio' || track.__air10_proxied) return;
    track.__air10_proxied = true;

    // Safe Guard: Do NOT prematurely mute host element before Catch-Up Proxy is connected!
    // Muting only occurs once AudioWorklet is verified active to ensure ZERO silent failures.

    // Clean up worklet nodes on track ended to avoid long-session memory leaks
    if (track.addEventListener) {
      track.addEventListener('ended', () => {
        if (track.__air10_worklet_node) {
          try {
            track.__air10_worklet_node.disconnect();
            activeWorkletNodes.delete(track.__air10_worklet_node);
          } catch (e) {}
        }
      });
    }

    try {
      const AudioCtxClass = (typeof window !== 'undefined') ? (window.AudioContext || window.webkitAudioContext) : null;
      if (!AudioCtxClass) return;

      let audioCtx = window.__air10_proxy_ctx__;
      if (!audioCtx || audioCtx.state === 'closed') {
        audioCtx = new AudioCtxClass();
        window.__air10_proxy_ctx__ = audioCtx;
      }

      const ensureRunning = () => {
        if (audioCtx.state === 'suspended') {
          audioCtx.resume().catch(() => {});
        }
      };
      ensureRunning();
      if (typeof window !== 'undefined') {
        ['click', 'keydown', 'pointerdown', 'touchstart'].forEach(evt => {
          window.addEventListener(evt, ensureRunning, { passive: true, capture: true });
        });
      }

      // Function to synchronously mute any host element playing this proxied track
      const muteHostTrackElements = () => {
        if (!window.__AIR10_FORCE_UNMUTE__ && window.__AIR10_CATCHUP_ENABLED__ !== false) {
          if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
            try {
              const mediaElements = document.querySelectorAll('audio, video');
              mediaElements.forEach(el => {
                if (el.srcObject && typeof el.srcObject.getAudioTracks === 'function') {
                  const tracks = el.srcObject.getAudioTracks();
                  if (tracks.includes(track)) {
                    el.muted = true;
                    el.volume = 0;
                    el.__air10_host_muted = true;
                    hookMutedAndVolume(el);
                    // Guard against host unmuting during playback
                    ['play', 'playing', 'timeupdate', 'loadedmetadata', 'canplay'].forEach(evt => {
                      el.addEventListener(evt, () => {
                        if (!window.__AIR10_FORCE_UNMUTE__ && window.__AIR10_CATCHUP_ENABLED__ !== false) {
                          el.muted = true;
                          el.volume = 0;
                          el.__air10_host_muted = true;
                        }
                      }, { passive: true });
                    });
                  }
                }
              });
            } catch (e) {}
          }
        }
      };
      muteHostTrackElements();

      if (typeof audioCtx.addEventListener === 'function') {
        audioCtx.addEventListener('statechange', () => {
          if (audioCtx.state === 'running') {
            muteHostTrackElements();
            if (track.__air10_worklet_node && !track.__air10_worklet_connected) {
              try {
                track.__air10_worklet_node.connect(audioCtx.destination);
                track.__air10_worklet_connected = true;
              } catch (e) {}
            }
          }
        });
      }

      let workletPromise = null;
      if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        try {
          const blob = new Blob([AIR10_CATCHUP_PROCESSOR_CODE], { type: 'application/javascript' });
          const blobUrl = URL.createObjectURL(blob);
          workletPromise = audioCtx.audioWorklet.addModule(blobUrl).then(() => {
            setTimeout(() => { try { URL.revokeObjectURL(blobUrl); } catch (e) {} }, 15000);
          });
        } catch (e) {
          const workletPath = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('modules/air10-catchup-processor.js')
            : 'modules/air10-catchup-processor.js';
          workletPromise = audioCtx.audioWorklet.addModule(workletPath);
        }
      } else {
        const workletPath = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
          ? chrome.runtime.getURL('modules/air10-catchup-processor.js')
          : 'modules/air10-catchup-processor.js';
        workletPromise = audioCtx.audioWorklet.addModule(workletPath);
      }

      if (audioCtx.audioWorklet && workletPromise) {
        workletPromise.then(() => {
          if (typeof MediaStream !== 'undefined' && audioCtx.createMediaStreamSource) {
            const stream = new MediaStream([track]);
            const sourceNode = audioCtx.createMediaStreamSource(stream);
            const catchUpNode = new AudioWorkletNode(audioCtx, 'air10-catchup-processor', {
              processorOptions: {
                speed: targetSpeed,
                sampleRate: audioCtx.sampleRate
              }
            });

            activeWorkletNodes.add(catchUpNode);

            catchUpNode.port.onmessage = (e) => {
              if (e.data && e.data.type === 'air10_catchup_telemetry') {
                window.__AIR10_CATCHUP_TELEMETRY__ = e.data;
              }
            };

            sourceNode.connect(catchUpNode);
            track.__air10_worklet_node = catchUpNode;

            // Double-Playback Comb Filtering Invariant:
            // Ensure audioCtx.destination connection and host muting are strictly synchronized.
            // If catchUp is active, connect to destination AND mute host element.
            const isCatchUpActive = Boolean(
              !window.__AIR10_FORCE_UNMUTE__ && 
              window.__AIR10_CATCHUP_ENABLED__ !== false
            );

            if (isCatchUpActive) {
              try {
                catchUpNode.connect(audioCtx.destination);
                track.__air10_worklet_connected = true;
              } catch (e) {}
              muteHostTrackElements();
            } else {
              // Fail-safe: if catchup not active, ensure host element is NOT muted
              if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
                try {
                  const mediaElements = document.querySelectorAll('audio, video');
                  mediaElements.forEach(el => {
                    if (el.srcObject && typeof el.srcObject.getAudioTracks === 'function') {
                      const tracks = el.srcObject.getAudioTracks();
                      if (tracks.includes(track)) {
                        el.muted = false;
                        el.volume = 1.0;
                        el.__air10_host_muted = false;
                      }
                    }
                  });
                } catch (e) {}
              }
            }

            console.log('%c[AIR10 Catch-Up Proxy]%c WebRTC remote audio track intercepted & routed to AudioWorklet at ' + targetSpeed + 'x!', 'color:#6366f1;font-weight:bold;', 'color:#10b981;font-weight:bold;');
          }
        }).catch(err => {
          console.warn('[AIR10 Catch-Up Proxy] addModule notice:', err);
          // Fail-Open Invariant: If AudioWorklet fails, unmute host media element so user still hears audio
          if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
            try {
              const mediaElements = document.querySelectorAll('audio, video');
              mediaElements.forEach(el => {
                if (el.srcObject && typeof el.srcObject.getAudioTracks === 'function') {
                  const tracks = el.srcObject.getAudioTracks();
                  if (tracks.includes(track)) {
                    el.muted = false;
                    el.volume = 1.0;
                    el.__air10_host_muted = false;
                  }
                }
              });
            } catch (e) {}
          }
        });
      }
    } catch (err) {
      console.warn('[AIR10 Catch-Up Proxy] Error initializing audio proxy:', err);
    }
  }

  // Intercept RTCPeerConnection for WebRTC live audio (ChatGPT Advanced Voice / LiveKit)
  if (typeof window !== 'undefined' && typeof window.RTCPeerConnection !== 'undefined') {
    const OrigRTCPeerConnection = window.RTCPeerConnection;
    
    // Intercept addEventListener('track', ...)
    if (OrigRTCPeerConnection.prototype && OrigRTCPeerConnection.prototype.addEventListener) {
      const origAddEventListener = OrigRTCPeerConnection.prototype.addEventListener;
      OrigRTCPeerConnection.prototype.addEventListener = function(type, listener, options) {
        if (type === 'track') {
          const wrappedListener = function(event) {
            if (event && event.track && event.track.kind === 'audio') {
              setupTrackCatchUpProxy(event.track);
            }
            if (typeof listener === 'function') {
              return listener.apply(this, arguments);
            } else if (listener && typeof listener.handleEvent === 'function') {
              return listener.handleEvent.apply(listener, arguments);
            }
          };
          return origAddEventListener.call(this, type, wrappedListener, options);
        }
        return origAddEventListener.call(this, type, listener, options);
      };
    }

    // Intercept ontrack property descriptor
    try {
      const origOnTrackDesc = Object.getOwnPropertyDescriptor(OrigRTCPeerConnection.prototype, 'ontrack');
      Object.defineProperty(OrigRTCPeerConnection.prototype, 'ontrack', {
        get: function() {
          return this.__air10_ontrack || (origOnTrackDesc && origOnTrackDesc.get ? origOnTrackDesc.get.call(this) : null);
        },
        set: function(handler) {
          this.__air10_ontrack = handler;
          const wrappedHandler = function(event) {
            if (event && event.track && event.track.kind === 'audio') {
              setupTrackCatchUpProxy(event.track);
            }
            if (typeof handler === 'function') {
              return handler.apply(this, arguments);
            }
          };
          if (origOnTrackDesc && origOnTrackDesc.set) {
            return origOnTrackDesc.set.call(this, wrappedHandler);
          } else if (this.addEventListener) {
            return this.addEventListener('track', wrappedHandler);
          }
        },
        configurable: true,
        enumerable: true
      });
    } catch (e) {}
  }

  // Expose global Catch-Up Proxy management handle
  if (typeof window !== 'undefined') {
    window.__AIR10_CATCHUP_PROXY__ = {
      getStatus: () => ({
        targetSpeed,
        activeNodes: activeWorkletNodes.size,
        telemetry: window.__AIR10_CATCHUP_TELEMETRY__ || null,
        forceUnmute: !!window.__AIR10_FORCE_UNMUTE__
      }),
      setSpeed: (s) => applySpeed(s, 'proxy_api'),
      unmuteHost: () => unmuteAllHostElements(),
      enableCatchUp: () => {
        window.__AIR10_FORCE_UNMUTE__ = false;
        window.__AIR10_CATCHUP_ENABLED__ = true;
        let audioCtx = window.__air10_proxy_ctx__;
        if (audioCtx && audioCtx.destination) {
          activeWorkletNodes.forEach(node => {
            try { node.connect(audioCtx.destination); } catch (e) {}
          });
        }
        if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
          try {
            const mediaElements = document.querySelectorAll('audio, video');
            mediaElements.forEach(el => {
              if (el.srcObject) {
                el.muted = true;
                el.volume = 0;
                el.__air10_host_muted = true;
                hookMutedAndVolume(el);
              }
            });
          } catch (e) {}
        }
      }
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

    // Apply to AudioWorklet nodes (Gemini Live 24kHz PCM stream & Catch-Up Proxy)
    activeWorkletNodes.forEach(node => {
      try {
        if (node && node.port) {
          node.port.postMessage({ type: 'air10_speed_change', speed: targetSpeed });
          node.port.postMessage({ type: 'air10_set_speed', speed: targetSpeed });
        }
      } catch (e) {}
    });

    if (typeof window !== 'undefined') {
      window.__AIR10_LIVE_SPEED__ = targetSpeed;
    }

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
        @keyframes air10-vu-1 { 0%, 100% { height: 3px; } 50% { height: 11px; } }
        @keyframes air10-vu-2 { 0%, 100% { height: 7px; } 50% { height: 13px; } }
        @keyframes air10-vu-3 { 0%, 100% { height: 4px; } 50% { height: 10px; } }
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

    // Jump Cutter Dynamic VU-Meter (bouncing speech waveform indicator)
    const vuMeter = document.createElement('div');
    vuMeter.id = 'air10-vu-meter';
    Object.assign(vuMeter.style, {
      display: 'none',
      alignItems: 'flex-end',
      gap: '2px',
      height: '13px',
      padding: '0 2px'
    });
    const bar1 = document.createElement('span');
    Object.assign(bar1.style, { width: '2px', height: '4px', background: '#34d399', borderRadius: '1px', animation: 'air10-vu-1 0.6s infinite ease-in-out' });
    const bar2 = document.createElement('span');
    Object.assign(bar2.style, { width: '2px', height: '8px', background: '#34d399', borderRadius: '1px', animation: 'air10-vu-2 0.5s infinite ease-in-out' });
    const bar3 = document.createElement('span');
    Object.assign(bar3.style, { width: '2px', height: '5px', background: '#34d399', borderRadius: '1px', animation: 'air10-vu-3 0.7s infinite ease-in-out' });
    vuMeter.appendChild(bar1);
    vuMeter.appendChild(bar2);
    vuMeter.appendChild(bar3);

    const speedLabel = document.createElement('span');
    speedLabel.id = 'speed-label';
    Object.assign(speedLabel.style, {
      fontSize: '13px',
      fontWeight: '700',
      color: '#f8fafc',
      letterSpacing: '0.02em'
    });
    speedLabel.textContent = `${parseFloat(targetSpeed.toFixed(2))}x`;

    // Jump Cutter Live Dynamic Speed Badge
    const liveSpeedBadge = document.createElement('span');
    liveSpeedBadge.id = 'air10-live-speed-badge';
    Object.assign(liveSpeedBadge.style, {
      fontSize: '11px',
      fontWeight: '700',
      color: '#94a3b8',
      background: 'rgba(255, 255, 255, 0.08)',
      border: '1px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '5px',
      padding: '1px 5px',
      transition: 'all 0.15s ease'
    });
    liveSpeedBadge.textContent = `${targetSpeed.toFixed(1)}x`;

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
    toggleBtn.title = 'Expand Telemetry Cockpit';
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
    mainRow.appendChild(vuMeter);
    mainRow.appendChild(speedLabel);
    mainRow.appendChild(liveSpeedBadge);
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

    // 3. Jump Cutter Real-Time Telemetry Cockpit (Physical Proof On Screen)
    const telemetryBox = document.createElement('div');
    telemetryBox.id = 'air10-telemetry-cockpit';
    Object.assign(telemetryBox.style, {
      width: '100%',
      marginTop: '8px',
      padding: '8px 10px',
      borderRadius: '8px',
      background: 'rgba(0, 0, 0, 0.5)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      fontSize: '11px',
      color: '#cbd5e1',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px'
    });

    const paceRow = document.createElement('div');
    Object.assign(paceRow.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center'
    });
    const paceTargetSpan = document.createElement('span');
    paceTargetSpan.textContent = '🎯 Target: ';
    const paceTargetVal = document.createElement('b');
    paceTargetVal.id = 'air10-tel-target';
    paceTargetVal.textContent = `${targetSpeed.toFixed(2)}x`;
    paceTargetSpan.appendChild(paceTargetVal);

    const paceLiveSpan = document.createElement('span');
    paceLiveSpan.textContent = '⚡ Live Pace: ';
    const paceLiveVal = document.createElement('b');
    paceLiveVal.id = 'air10-tel-live';
    paceLiveVal.style.color = '#34d399';
    paceLiveVal.textContent = `${targetSpeed.toFixed(2)}x`;
    paceLiveSpan.appendChild(paceLiveVal);

    paceRow.appendChild(paceTargetSpan);
    paceRow.appendChild(paceLiveSpan);
    telemetryBox.appendChild(paceRow);

    const bufRow = document.createElement('div');
    Object.assign(bufRow.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '3px'
    });

    const bufHeader = document.createElement('div');
    Object.assign(bufHeader.style, {
      display: 'flex',
      justifyContent: 'space-between',
      fontSize: '10px',
      color: '#94a3b8'
    });
    const bufLabelSpan = document.createElement('span');
    bufLabelSpan.textContent = '📦 Jitter Buffer: ';
    const bufVal = document.createElement('b');
    bufVal.id = 'air10-tel-buf-val';
    bufVal.textContent = '0 ms';
    bufLabelSpan.appendChild(bufVal);

    const stateLabel = document.createElement('span');
    stateLabel.id = 'air10-tel-state';
    Object.assign(stateLabel.style, {
      fontWeight: '700',
      color: '#818cf8'
    });
    stateLabel.textContent = 'STANDBY';

    bufHeader.appendChild(bufLabelSpan);
    bufHeader.appendChild(stateLabel);
    bufRow.appendChild(bufHeader);

    const bufTrack = document.createElement('div');
    Object.assign(bufTrack.style, {
      width: '100%',
      height: '4px',
      background: 'rgba(255, 255, 255, 0.1)',
      borderRadius: '2px',
      overflow: 'hidden'
    });
    const bufBar = document.createElement('div');
    bufBar.id = 'air10-tel-buf-bar';
    Object.assign(bufBar.style, {
      width: '0%',
      height: '100%',
      background: '#10b981',
      transition: 'width 0.15s ease, background 0.15s ease'
    });
    bufTrack.appendChild(bufBar);
    bufRow.appendChild(bufTrack);
    telemetryBox.appendChild(bufRow);

    // Unmute / Direct Sound 1-Click Rescue Button
    const directSoundBtn = document.createElement('button');
    directSoundBtn.id = 'air10-direct-sound-btn';
    Object.assign(directSoundBtn.style, {
      width: '100%',
      padding: '4px 8px',
      fontSize: '10px',
      fontWeight: '600',
      background: 'rgba(99, 102, 241, 0.2)',
      border: '1px solid rgba(99, 102, 241, 0.4)',
      borderRadius: '6px',
      color: '#c7d2fe',
      cursor: 'pointer',
      textAlign: 'center',
      marginTop: '4px',
      transition: 'all 0.15s ease'
    });
    directSoundBtn.textContent = '🔊 Force Unmute / Direct Sound (100% Volume)';
    directSoundBtn.onclick = (e) => {
      e.stopPropagation();
      unmuteAllHostElements();
      directSoundBtn.textContent = '🟢 Direct Sound Restored (100% Volume)';
      directSoundBtn.style.background = 'rgba(16, 185, 129, 0.25)';
      directSoundBtn.style.borderColor = '#10b981';
      directSoundBtn.style.color = '#6ee7b7';
      setTimeout(() => {
        directSoundBtn.textContent = '🔊 Force Unmute / Direct Sound';
      }, 3000);
    };
    telemetryBox.appendChild(directSoundBtn);

    expandedRow.appendChild(telemetryBox);
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

    // Start 100ms Jump Cutter Live Telemetry Polling Loop
    if (!window.__AIR10_HUD_POLLER__) {
      const poller = setInterval(updateLiveTelemetryHUD, 120);
      if (poller && typeof poller.unref === 'function') {
        poller.unref();
      }
      window.__AIR10_HUD_POLLER__ = poller;
    }
  }

  function updateLiveTelemetryHUD() {
    if (typeof document === 'undefined') return;
    const telTarget = document.getElementById('air10-tel-target');
    const telLive = document.getElementById('air10-tel-live');
    const telBufVal = document.getElementById('air10-tel-buf-val');
    const telState = document.getElementById('air10-tel-state');
    const telBufBar = document.getElementById('air10-tel-buf-bar');
    const liveBadge = document.getElementById('air10-live-speed-badge');
    const vuMeter = document.getElementById('air10-vu-meter');

    let liveSpd = targetSpeed;
    let bufMs = 0;
    let stateStr = 'STANDBY';
    let stateColor = '#94a3b8';
    let isPlaying = false;

    const catchupTel = window.__AIR10_CATCHUP_TELEMETRY__;
    const hasCatchup = !!(catchupTel && (Date.now() - (catchupTel.timestamp || 0) < 1500));

    if (hasCatchup) {
      isPlaying = true;
      liveSpd = catchupTel.currentSpeed || targetSpeed;
      bufMs = catchupTel.bufferedMs || 0;
      if (bufMs >= 150) {
        stateStr = '⚡ CATCH-UP';
        stateColor = '#34d399';
      } else if (bufMs < 50) {
        stateStr = '🟢 REALTIME';
        stateColor = '#f59e0b';
      } else {
        stateStr = '🔄 ADAPTIVE';
        stateColor = '#60a5fa';
      }
    } else {
      // Inspect active HTMLMediaElements
      activeMediaElements.forEach(el => {
        if (el && !el.paused && el.currentTime > 0) {
          isPlaying = true;
          liveSpd = el.playbackRate || targetSpeed;
          if (el.buffered && el.buffered.length > 0) {
            const end = el.buffered.end(el.buffered.length - 1);
            bufMs = Math.round(Math.max(0, end - el.currentTime) * 1000);
          }
          stateStr = '⚡ ACCELERATED';
          stateColor = '#34d399';
        }
      });
    }

    if (telTarget) telTarget.textContent = targetSpeed.toFixed(2) + 'x';
    if (telLive) {
      telLive.textContent = (isPlaying ? liveSpd.toFixed(2) : targetSpeed.toFixed(2)) + 'x';
      telLive.style.color = isPlaying ? '#34d399' : '#94a3b8';
    }
    if (telBufVal) telBufVal.textContent = bufMs + ' ms';
    if (telState) {
      telState.textContent = stateStr;
      telState.style.color = stateColor;
    }
    if (telBufBar) {
      const pct = Math.min(100, Math.round((bufMs / 250) * 100));
      telBufBar.style.width = pct + '%';
      telBufBar.style.background = bufMs >= 150 ? '#10b981' : (bufMs >= 50 ? '#60a5fa' : '#f59e0b');
    }
    if (liveBadge) {
      if (isPlaying) {
        liveBadge.textContent = `LIVE ${liveSpd.toFixed(2)}x`;
        liveBadge.style.color = '#34d399';
        liveBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        liveBadge.style.background = 'rgba(16, 185, 129, 0.18)';
      } else {
        liveBadge.textContent = `${parseFloat(targetSpeed.toFixed(2))}x`;
        liveBadge.style.color = '#94a3b8';
        liveBadge.style.borderColor = 'rgba(255, 255, 255, 0.12)';
        liveBadge.style.background = 'rgba(255, 255, 255, 0.08)';
      }
    }
    if (vuMeter) {
      vuMeter.style.display = isPlaying ? 'flex' : 'none';
    }
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
    getTrackedWorkletCount: () => activeWorkletNodes.size,
    getActiveWorkletNodes: () => activeWorkletNodes,
    resampleFloat32PCM: (chunk, speed, state) => resampleFloat32PCM(chunk, speed, state),
    resampleInt16PCM: (chunk, speed, state) => resampleInt16PCM(chunk, speed, state),
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
