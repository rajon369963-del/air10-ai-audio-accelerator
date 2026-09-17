/**
 * AIR10 & CIVEX Offscreen Document Sidecar (MV3 Persistent Host)
 * ==============================================================
 * Hosts:
 * 1. Window.ai / Chrome Built-in AI (Gemini Nano Prompt API) persistent session
 * 2. In-Browser BM25 Router for Sub-Millisecond Tool Selection (< 250B schemas)
 * 3. Cognitive Audio Pacing for dynamic playback speed calculation
 * 4. Local DOM Risk Auditor (Zero-Cloud Quant execution gate)
 * 5. 25-second Keep-Alive Heartbeat maintaining background SW persistence
 */

(function () {
  'use strict';

  // Import or reference CIVEXNanoBridge
  const Bridge = typeof CIVEXNanoBridge !== 'undefined' ? CIVEXNanoBridge : (typeof require !== 'undefined' ? require('./modules/civex-nano-bridge.js') : null);

  let bm25Router = null;
  let nanoSession = null;
  let indexedTools = [];

  // Default seed tools from AIR10 & CIVEX
  const DEFAULT_SEED_TOOLS = [
    { id: 'study_resume', name: 'study_resume', cat: 'study', desc: 'Resume active study session and load next archetype question' },
    { id: 'study_inspect_page', name: 'study_inspect_page', cat: 'dom', desc: 'Inspect current Gemini or NotebookLM page elements' },
    { id: 'study_click_native_selector', name: 'study_click_native_selector', cat: 'action', desc: 'Click native UI element matching selector or text' },
    { id: 'study_verify_native_origin', name: 'study_verify_native_origin', cat: 'audit', desc: 'Verify DOM ancestry of study question for genuine origin' },
    { id: 'quant_risk_audit', name: 'quant_risk_audit', cat: 'quant', desc: 'Audit trade order size and slippage locally before dispatch' },
    { id: 'audio_dynamic_pace', name: 'audio_dynamic_pace', cat: 'audio', desc: 'Calculate dynamic DSP speed scaling based on concept density' }
  ];

  function initBM25() {
    if (Bridge && Bridge.InBrowserBM25Router) {
      bm25Router = new Bridge.InBrowserBM25Router(DEFAULT_SEED_TOOLS);
      indexedTools = [...DEFAULT_SEED_TOOLS];
      console.log('[AIR10 Offscreen] InBrowserBM25Router initialized with', indexedTools.length, 'tools');
    }
  }

  // Initialize Gemini Nano session
  async function getNanoSession(candidateTools = []) {
    if (nanoSession && (!candidateTools || candidateTools.length === 0)) {
      return nanoSession;
    }

    const systemPrompt = Bridge && Bridge.JITHydrator ? 
      Bridge.JITHydrator.buildSystemPrompt(candidateTools) : 
      'You are an on-device function router. Output JSON only.';

    // Check Chrome Built-in AI availability
    const ai = typeof window !== 'undefined' && (window.ai || (window.chrome && window.chrome.ai) || self.ai);
    if (ai && ai.languageModel && typeof ai.languageModel.create === 'function') {
      try {
        const capabilities = ai.languageModel.capabilities ? await ai.languageModel.capabilities() : { available: 'readily' };
        if (capabilities.available === 'no') {
          console.warn('[AIR10 Offscreen] Gemini Nano not available on this device');
          return null;
        }
        nanoSession = await ai.languageModel.create({
          systemPrompt: systemPrompt,
          temperature: 0.1,
          topK: 1
        });
        return nanoSession;
      } catch (err) {
        console.warn('[AIR10 Offscreen] Error creating Gemini Nano session:', err);
        return null;
      }
    }
    return null;
  }

  // Handle messages from Background Service Worker
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !msg.type) return false;

      // 1. Offscreen ping
      if (msg.type === 'OFFSCREEN_PING') {
        sendResponse({
          status: 'PONG',
          timestamp: Date.now(),
          nanoReady: !!nanoSession,
          toolCount: indexedTools.length
        });
        return true;
      }

      // 2. CIVEX BM25 Route Query
      if (msg.type === 'CIVEX_ROUTE_QUERY') {
        const query = msg.query || '';
        const limit = msg.limit || 2;
        if (!bm25Router) initBM25();
        const topTools = bm25Router.routeQuery(query, limit);
        const shadowSchemas = topTools.map(t => Bridge.SchemaShrinker.shrinkTool(t));
        sendResponse({
          status: 'SUCCESS',
          candidates: topTools,
          shadowSchemas: shadowSchemas,
          byteSizes: shadowSchemas.map(s => new TextEncoder().encode(JSON.stringify(s)).length)
        });
        return true;
      }

      // 3. Prompt Gemini Nano
      if (msg.type === 'CIVEX_PROMPT_NANO') {
        (async () => {
          try {
            const query = msg.query || '';
            if (!bm25Router) initBM25();
            const topCandidates = bm25Router.routeQuery(query, 2);
            const session = await getNanoSession(topCandidates);

            if (session && typeof session.prompt === 'function') {
              const promptText = ;
              const rawOutput = await session.prompt(promptText);
              let parsedResult = null;
              try {
                const jsonMatch = rawOutput.match(/\{[\s\S]*\}/);
                parsedResult = jsonMatch ? JSON.parse(jsonMatch[0]) : null;
              } catch (e) {
                parsedResult = { raw: rawOutput, parseError: e.message };
              }

              sendResponse({
                status: 'SUCCESS',
                engine: 'GEMINI_NANO_ON_DEVICE',
                tool: parsedResult ? (parsedResult.tool || parsedResult.id) : topCandidates[0].id,
                args: parsedResult ? (parsedResult.args || {}) : {},
                raw: rawOutput,
                candidates: topCandidates.map(c => c.id)
              });
            } else {
              // Fallback to deterministic BM25 routing if Nano prompt API not available
              sendResponse({
                status: 'SUCCESS',
                engine: 'CIVEX_BM25_DETERMINISTIC_FALLBACK',
                tool: topCandidates[0] ? topCandidates[0].id : 'study_resume',
                args: {},
                candidates: topCandidates.map(c => c.id),
                notice: 'Gemini Nano Prompt API offline, routed deterministically via BM25'
              });
            }
          } catch (err) {
            sendResponse({ status: 'ERROR', error: err.message });
          }
        })();
        return true;
      }

      // 4. Cognitive Audio Pacing
      if (msg.type === 'COGNITIVE_AUDIO_PACING') {
        const text = msg.text || '';
        const pacingResult = Bridge.CognitiveAudioPacer.analyzeDensity(text);
        sendResponse({
          status: 'SUCCESS',
          pacing: pacingResult
        });
        return true;
      }

      // 5. Local DOM Risk Audit (Quant)
      if (msg.type === 'LOCAL_DOM_RISK_AUDIT') {
        const order = msg.order || {};
        const auditResult = Bridge.LocalDomRiskAuditor.auditOrder(order);
        sendResponse({
          status: 'SUCCESS',
          audit: auditResult
        });
        return true;
      }

      // 6. Register New Tools
      if (msg.type === 'CIVEX_REGISTER_TOOLS') {
        const newTools = msg.tools || [];
        if (Array.isArray(newTools) && newTools.length > 0) {
          indexedTools = [...indexedTools, ...newTools];
          if (!bm25Router) {
            initBM25();
          } else {
            bm25Router.indexTools(indexedTools);
          }
        }
        sendResponse({
          status: 'SUCCESS',
          totalTools: indexedTools.length
        });
        return true;
      }

      return false;
    });
  }


  // Long-Lived RuntimePort Stream Listener (Stream-to-Port Proxy Pattern)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onConnect) {
    chrome.runtime.onConnect.addListener((port) => {
      if (port.name !== 'civex-inference' && port.name !== 'civex-stream') return;

      port.onMessage.addListener(async (msg) => {
        if (!msg) return;
        if (msg.action === 'PROMPT' || msg.type === 'PROMPT') {
          const query = msg.query || msg.text || '';
          try {
            if (!bm25Router) initBM25();
            const topCandidates = bm25Router.routeQuery(query, 2);
            const session = await getNanoSession(topCandidates);

            if (session && typeof session.promptStreaming === 'function') {
              const promptText = `User intent: "${query}". Select the best tool from the available list and emit JSON.`;
              const stream = session.promptStreaming(promptText);
              for await (const chunk of stream) {
                // Micro-protocol: 1 = data chunk, 2 = done, 3 = error
                port.postMessage({ t: 1, d: chunk });
              }
              port.postMessage({ t: 2 });
            } else if (session && typeof session.prompt === 'function') {
              const promptText = `User intent: "${query}". Select the best tool from the available list and emit JSON.`;
              const fullText = await session.prompt(promptText);
              port.postMessage({ t: 1, d: fullText });
              port.postMessage({ t: 2 });
            } else {
              // Deterministic BM25 fallback
              const fallbackPayload = JSON.stringify({
                tool: topCandidates[0] ? topCandidates[0].id : 'study_resume',
                args: {},
                engine: 'CIVEX_BM25_DETERMINISTIC_FALLBACK'
              });
              port.postMessage({ t: 1, d: fallbackPayload });
              port.postMessage({ t: 2 });
            }
          } catch (err) {
            port.postMessage({ t: 3, e: err.message });
          }
        }
      });
    });
  }

  // 25-second Keep-Alive Heartbeat to Service Worker
  function startHeartbeat() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      setInterval(() => {
        try {
          chrome.runtime.sendMessage({
            type: 'OFFSCREEN_HEARTBEAT',
            timestamp: Date.now(),
            alive: true
          }, () => {
            if (chrome.runtime.lastError) {}
          });
        } catch (e) {}
      }, 25000);
    }
  }

  // Initialize
  initBM25();
  startHeartbeat();

  // Export for testing in Node / Jest environment
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      initBM25,
      getNanoSession,
      DEFAULT_SEED_TOOLS,
      getIndexedTools: () => indexedTools
    };
  }
})();
