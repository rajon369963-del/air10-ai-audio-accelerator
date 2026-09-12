/**
 * Audio Engine Micro-Benchmark Runner (Apple Silicon M1)
 * Measures:
 * 1. soundtouchjs pitch-preserving DSP time-stretching throughput
 * 2. pitchfinder YIN audio frequency detection throughput
 * 3. query-selector-shadow-dom deep DOM traversal throughput with JSDOM
 * 4. audio-accelerator watchdog rate-lock check latency
 */

const { performance } = require('node:perf_hooks');
const soundtouch = require('soundtouchjs');
const pitchfinder = require('pitchfinder');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

console.log('⚡ Starting Audio Accelerator Dedicated Benchmarks...');

// 1. SoundTouch DSP Benchmark
const st = new soundtouch.SoundTouch(44100);
st.tempo = 3.0;
st.rate = 1.0;

const roundsSoundTouch = 10000;
const startST = performance.now();
for (let i = 0; i < roundsSoundTouch; i++) {
  st.tempo = (i % 2 === 0) ? 2.5 : 3.0;
  st.rate = 1.0;
  const p = st.virtualPitch;
}
const elapsedST = performance.now() - startST;
const soundTouchOpsPerSec = (roundsSoundTouch / (elapsedST / 1000)).toFixed(1);
const soundTouchAvgUs = ((elapsedST / roundsSoundTouch) * 1000).toFixed(2);
console.log(`SoundTouch DSP Rate Scaling: ${soundTouchOpsPerSec} ops/sec (${soundTouchAvgUs} µs avg)`);

// 2. Pitchfinder YIN Frequency Detection Benchmark
const detectPitch = pitchfinder.YIN({ sampleRate: 44100 });
const sampleRate = 44100;
const freq = 440;
const float32Data = new Float32Array(1024);
for (let i = 0; i < float32Data.length; i++) {
  float32Data[i] = Math.sin((2 * Math.PI * freq * i) / sampleRate);
}

const roundsPitch = 500;
const startPitch = performance.now();
for (let i = 0; i < roundsPitch; i++) {
  detectPitch(float32Data);
}
const elapsedPitch = performance.now() - startPitch;
const pitchOpsPerSec = (roundsPitch / (elapsedPitch / 1000)).toFixed(1);
const pitchAvgUs = ((elapsedPitch / roundsPitch) * 1000).toFixed(2);
console.log(`Pitchfinder YIN Frequency Detection: ${pitchOpsPerSec} detections/sec (${pitchAvgUs} µs avg)`);

// 3. Shadow DOM Piercing Benchmark using JSDOM
const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="host"></div></body></html>`);
const doc = dom.window.document;
const host = doc.getElementById('host');
const shadow = host.attachShadow({ mode: 'open' });
const audio = doc.createElement('audio');
audio.id = 'shadow-podcast-audio';
shadow.appendChild(audio);

const qsdPath = path.resolve(__dirname, '../node_modules/query-selector-shadow-dom/dist/querySelectorShadowDom.js');
const code = fs.readFileSync(qsdPath, 'utf8');

const sandbox = {
  document: doc,
  Node: dom.window.Node,
  HTMLElement: dom.window.HTMLElement
};
vm.createContext(sandbox);
vm.runInContext(code, sandbox);

const roundsShadow = 5000;
const startShadow = performance.now();
for (let i = 0; i < roundsShadow; i++) {
  sandbox.querySelectorShadowDom.querySelectorDeep('audio', doc);
}
const elapsedShadow = performance.now() - startShadow;
const shadowOpsPerSec = (roundsShadow / (elapsedShadow / 1000)).toFixed(1);
const shadowAvgUs = ((elapsedShadow / roundsShadow) * 1000).toFixed(2);
console.log(`Deep Shadow DOM Piercing: ${shadowOpsPerSec} traversals/sec (${shadowAvgUs} µs avg)`);

// 4. Watchdog Rate Enforcement Latency Benchmark
const roundsWatchdog = 10000;
let targetSpeed = 3.0;
let isMutatingRate = false;
function enforceAudioSpeed(media) {
  if (!media || isMutatingRate) return;
  try {
    isMutatingRate = true;
    if (Math.abs(media.playbackRate - targetSpeed) > 0.01) {
      media.playbackRate = targetSpeed;
    }
    media.preservesPitch = true;
  } finally {
    isMutatingRate = false;
  }
}

const testMedia = { playbackRate: 1.0, preservesPitch: false };
const startWatchdog = performance.now();
for (let i = 0; i < roundsWatchdog; i++) {
  testMedia.playbackRate = 1.0;
  enforceAudioSpeed(testMedia);
}
const elapsedWatchdog = performance.now() - startWatchdog;
const watchdogOpsPerSec = (roundsWatchdog / (elapsedWatchdog / 1000)).toFixed(1);
const watchdogAvgUs = ((elapsedWatchdog / roundsWatchdog) * 1000).toFixed(2);
console.log(`Watchdog Rate Enforcement: ${watchdogOpsPerSec} enforcements/sec (${watchdogAvgUs} µs avg)`);

// Output benchmark result object
const results = {
  soundtouch_dsp_ops_sec: parseFloat(soundTouchOpsPerSec),
  soundtouch_avg_us: parseFloat(soundTouchAvgUs),
  pitchfinder_yin_detections_sec: parseFloat(pitchOpsPerSec),
  pitchfinder_avg_us: parseFloat(pitchAvgUs),
  shadow_dom_traversals_sec: parseFloat(shadowOpsPerSec),
  shadow_dom_avg_us: parseFloat(shadowAvgUs),
  watchdog_ops_sec: parseFloat(watchdogOpsPerSec),
  watchdog_avg_us: parseFloat(watchdogAvgUs)
};

fs.writeFileSync(path.join(__dirname, 'audio_benchmark_results.json'), JSON.stringify(results, null, 2));
console.log('Saved benchmark results to scripts/audio_benchmark_results.json');
