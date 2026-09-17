/**
 * CIVEX-AIR10 Brain-Limb Architecture & Study Mode Bridge
 * Enables 30 decentralized viral micro-tools ("Limbs") to communicate with
 * the Sovereign Host ("Brain") or gracefully fallback to local 2.9KB Zig WASM.
 */

import { instantiateSovereignKernel } from "./inline-zig-wasm.js";

export const DEFAULT_BRAIN_EXTENSION_ID = "civex-air10-brain-host";

export class BrainHostService {
  constructor(options = {}) {
    this.brainId = options.brainId || DEFAULT_BRAIN_EXTENSION_ID;
    this.studyGraph = new Map();
    this.isAlive = true;
    this.kernelInstance = null;
  }

  async init() {
    if (!this.kernelInstance) {
      this.kernelInstance = await instantiateSovereignKernel();
    }
    return this;
  }

  handleExternalMessage(message, sender, sendResponse) {
    if (!message || !message.type) {
      sendResponse({ success: false, error: "INVALID_PAYLOAD" });
      return false;
    }

    switch (message.type) {
      case "PING":
        sendResponse({
          status: "BRAIN_CONNECTED",
          version: "1.0.0",
          timestamp: Date.now()
        });
        break;

      case "FSRS_EVAL": {
        const { t, s } = message.payload || {};
        const r = this.kernelInstance
          ? this.kernelInstance.calculateFSRS5(t || 1.0, s || 10.0)
          : 0.95;
        sendResponse({ success: true, retrievability: r });
        break;
      }

      case "BM25_SCORE": {
        const { tf, df, dl, avgdl } = message.payload || {};
        const score = this.kernelInstance
          ? this.kernelInstance.scoreBM25(tf || 1, df || 1, dl || 100, avgdl || 100)
          : 1.0;
        sendResponse({ success: true, score });
        break;
      }

      case "STUDY_MODE_SYNC": {
        const { conceptId, metrics } = message.payload || {};
        this.studyGraph.set(conceptId, {
          metrics,
          updatedAt: Date.now()
        });
        sendResponse({ success: true, registeredConcepts: this.studyGraph.size });
        break;
      }

      default:
        sendResponse({ success: false, error: "UNKNOWN_TYPE: " + message.type });
    }
    return true;
  }
}

export class LimbClient {
  constructor(options = {}) {
    this.brainId = options.brainId || DEFAULT_BRAIN_EXTENSION_ID;
    this.toolId = options.toolId || "generic-micro-tool";
    this.isBrainConnected = false;
    this.localKernel = null;
    this.studyModeEnabled = false;
  }

  async connect() {
    try {
      if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
        const resp = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(this.brainId, { type: "PING" }, (response) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(response);
            }
          });
        });

        if (resp && resp.status === "BRAIN_CONNECTED") {
          this.isBrainConnected = true;
          return { mode: "BRAIN_HOST", status: "CONNECTED" };
        }
      }
    } catch (_) {}

    // Graceful fallback to bundled 2.9KB Zig WASM module
    if (!this.localKernel) {
      this.localKernel = await instantiateSovereignKernel();
    }
    this.isBrainConnected = false;
    return { mode: "STANDALONE_LITE", status: "WASM_KERNEL_READY" };
  }

  async executeTask(taskType, payload = {}) {
    if (this.isBrainConnected && typeof chrome !== "undefined" && chrome.runtime) {
      try {
        const resp = await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            this.brainId,
            { type: taskType, payload, sourceTool: this.toolId },
            (response) => {
              if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
              else resolve(response);
            }
          );
        });
        if (resp && resp.success) return resp;
      } catch (_) {
        // Drop to local fallback on transport failure
      }
    }

    // Local execution via Zig WASM
    if (!this.localKernel) {
      this.localKernel = await instantiateSovereignKernel();
    }

    if (taskType === "FSRS_EVAL") {
      const r = this.localKernel.calculateFSRS5(payload.t || 1.0, payload.s || 10.0);
      return { success: true, retrievability: r, executor: "LOCAL_ZIG_WASM" };
    }

    if (taskType === "BM25_SCORE") {
      const score = this.localKernel.scoreBM25(
        payload.tf || 1,
        payload.df || 1,
        payload.dl || 100,
        payload.avgdl || 100
      );
      return { success: true, score, executor: "LOCAL_ZIG_WASM" };
    }

    return { success: true, status: "LOCAL_FALLBACK_EXECUTED", payload };
  }

  toggleStudyMode(enable = true) {
    this.studyModeEnabled = enable;
    return {
      toolId: this.toolId,
      studyMode: this.studyModeEnabled,
      notice: this.studyModeEnabled
        ? "Opt-in Study Mode active. Concept telemetry synchronized with Sovereign Study Commons."
        : "Standard consumer mode active."
    };
  }
}
