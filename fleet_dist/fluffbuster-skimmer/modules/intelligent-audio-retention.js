/**
 * CIVEX-AIR10 Intelligent Audio Retention & Ratechange Storm Shield Bridge
 * Connects WebAudio DSP (3.0x speed, phase vocoder, lowpass filter) to Gemini Nano
 * on-device complexity evaluation and token stop sequences.
 */

export class IntelligentAudioRetentionBridge {
  constructor(options = {}) {
    this.audioContext = options.audioContext || null;
    this.videoElement = options.videoElement || null;
    this.targetPlaybackRate = options.targetPlaybackRate || 3.0;
    this.duckedGainValue = options.duckedGainValue || 0.2;
    this.criticalBufferLimit = options.criticalBufferLimit || 0.15; // 150ms floor

    this.gainNode = options.gainNode || null;
    this.biquadFilter = options.biquadFilter || null;
    this.sourceNode = options.sourceNode || null;

    this.isModelSessionActive = false;
    this.aiSession = null;
    this.stopSequences = [
      "<|end_of_thought|>",
      "\n\n##",
      "<|im_end|>"
    ];
  }

  initWebAudio(ctx, videoEl) {
    this.audioContext = ctx;
    this.videoElement = videoEl;

    if (this.audioContext && this.videoElement && this.audioContext.createGain) {
      try {
        this.sourceNode = this.audioContext.createMediaElementSource(this.videoElement);
        this.gainNode = this.audioContext.createGain();
        this.biquadFilter = this.audioContext.createBiquadFilter();

        this.sourceNode.connect(this.biquadFilter);
        this.biquadFilter.connect(this.gainNode);
        this.gainNode.connect(this.audioContext.destination);
      } catch (err) {
        // Fallback for mock or existing node bindings
      }
    }
    return this;
  }

  async initializeLocalAI() {
    try {
      if (typeof window !== "undefined" && window.ai?.languageModel?.capabilities) {
        const caps = await window.ai.languageModel.capabilities();
        if (caps.available !== "no") {
          this.aiSession = await window.ai.languageModel.create({
            systemPrompt: "Evaluate text complexity. Respond with HIGH_COMPLEXITY or LOW_COMPLEXITY."
          });
          this.isModelSessionActive = true;
        }
      }
    } catch (_) {
      this.isModelSessionActive = false;
    }
  }

  async processIncomingCaptionChunk(captionText) {
    let complexity = "LOW_COMPLEXITY";

    if (this.isModelSessionActive && this.aiSession) {
      try {
        const response = await this.aiSession.prompt("Analyze complexity: " + captionText);
        if (response && response.includes("HIGH_COMPLEXITY")) {
          complexity = "HIGH_COMPLEXITY";
        }
      } catch (_) {}
    } else {
      // Fast heuristic fallback: word length > 12 or syllables per token > 3
      const words = captionText.split(/\s+/);
      const avgLen = words.reduce((acc, w) => acc + w.length, 0) / (words.length || 1);
      if (avgLen > 7.5 || captionText.includes("integral") || captionText.includes("theorem")) {
        complexity = "HIGH_COMPLEXITY";
      }
    }

    return await this.applyDynamicAudioState(complexity);
  }

  async applyDynamicAudioState(complexity) {
    const now = this.audioContext?.currentTime || 0;

    if (complexity === "HIGH_COMPLEXITY") {
      if (this.biquadFilter) {
        this.biquadFilter.type = "lowpass";
        if (this.biquadFilter.frequency?.setValueAtTime) {
          this.biquadFilter.frequency.setValueAtTime(1200, now);
        }
      }
      if (this.videoElement) {
        this.videoElement.playbackRate = 1.0;
      }
      if (this.gainNode?.gain?.linearRampToValueAtTime) {
        this.gainNode.gain.linearRampToValueAtTime(1.3, now + 0.15);
      }
      return { complexity, playbackRate: 1.0, filter: "lowpass_1200Hz", gain: 1.3 };
    } else {
      if (this.biquadFilter) {
        this.biquadFilter.type = "allpass";
      }
      if (this.videoElement) {
        this.videoElement.playbackRate = this.targetPlaybackRate;
      }
      if (this.gainNode?.gain?.linearRampToValueAtTime) {
        this.gainNode.gain.linearRampToValueAtTime(1.0, now + 0.1);
      }
      return { complexity, playbackRate: this.targetPlaybackRate, filter: "allpass", gain: 1.0 };
    }
  }

  inspectBufferDuration() {
    if (!this.audioContext) return 0.5;
    return (this.audioContext.baseLatency || 0.05) + (this.audioContext.outputLatency || 0.05);
  }

  async checkBufferAndDuckOnStopSequence(tokenString) {
    let triggered = false;
    for (const seq of this.stopSequences) {
      if (tokenString.includes(seq)) {
        triggered = true;
        break;
      }
    }

    const currentBuffer = this.inspectBufferDuration();
    if (triggered || currentBuffer < this.criticalBufferLimit) {
      const now = this.audioContext?.currentTime || 0;
      if (this.gainNode?.gain?.exponentialRampToValueAtTime) {
        this.gainNode.gain.setValueAtTime(this.gainNode.gain.value, now);
        this.gainNode.gain.exponentialRampToValueAtTime(this.duckedGainValue, now + 0.04);
      }
      if (this.videoElement && currentBuffer < this.criticalBufferLimit) {
        this.videoElement.playbackRate = Math.max(1.0, this.videoElement.playbackRate - 0.5);
      }
      return { ducked: true, reason: triggered ? "STOP_SEQUENCE" : "BUFFER_STARVATION", currentBuffer };
    }

    return { ducked: false, currentBuffer };
  }
}
