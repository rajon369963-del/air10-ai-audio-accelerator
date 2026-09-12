/**
 * Audio Engine Dedicated Micro-Benchmark Runner (Apple Silicon M1)
 * 
 * Authentic Benchmarks:
 * 1. soundtouchjs REAL audio sample DSP time-stretching throughput & pitch verification via SimpleFilter
 * 2. soundtouchjs control/parameter access ops/sec (tempo/rate property updates)
 * 3. WebAudio speed engine buffer duration & pitch-correction factor transform calculation
 * 4. pitchfinder YIN audio frequency detection throughput
 * 5. query-selector-shadow-dom deep DOM traversal throughput with JSDOM
 * 6. audio-accelerator watchdog rate-lock check latency
 */

const { performance } = require('node:perf_hooks');
const soundtouch = require('soundtouchjs');
const pitchfinder = require('pitchfinder');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const os = require('node:os');

console.log('======================================================================');
console.log('⚡ AIR10 AUDIO ACCELERATOR BENCHMARK REPRODUCER');
console.log(`• Runtime Environment   : ${os.type()} ${os.arch()} (${os.cpus()[0]?.model || 'Generic CPU'}) [Node ${process.version}]`);
console.log('• Workload              : SoundTouch DSP, WebAudio Transforms, YIN Pitch');
console.log('======================================================================');

// 1. Real SoundTouch DSP Sample Time-Stretching & Pitch Verification
const sampleRate = 44100;
const totalInputFrames = 44100; // 1 second of 440 Hz Sine wave
const inputStereo = new Float32Array(totalInputFrames * 2);
for (let i = 0; i < totalInputFrames; i++) {
  const v = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
  inputStereo[i * 2] = v;
  inputStereo[i * 2 + 1] = v;
}

const sourceSound = {
  extract: function(target, numFrames, position) {
    const framesToExtract = Math.min(numFrames, totalInputFrames - position);
    if (framesToExtract <= 0) return 0;
    for (let i = 0; i < framesToExtract * 2; i++) {
      target[i] = inputStereo[(position * 2) + i];
    }
    return framesToExtract;
  }
};

const st = new soundtouch.SoundTouch(sampleRate);
st.tempo = 2.0;
const filter = new soundtouch.SimpleFilter(sourceSound, st);
const outBlock = new Float32Array(2048 * 2);
const monoOut = new Float32Array(2048);
const detectPitch = pitchfinder.YIN({ sampleRate });

let totalExtractedFrames = 0;
const detectedFreqs = [];
const startDSP = performance.now();

while (true) {
  const extracted = filter.extract(outBlock, 2048);
  if (extracted === 0) break;
  totalExtractedFrames += extracted;
  for (let i = 0; i < extracted; i++) {
    monoOut[i] = outBlock[i * 2];
  }
  const f = detectPitch(monoOut.subarray(0, extracted));
  if (f) detectedFreqs.push(f);
}
const elapsedDSP = performance.now() - startDSP;
const totalOutputSamples = totalExtractedFrames * 2;
const dspThroughputSamplesSec = (totalOutputSamples / (elapsedDSP / 1000)).toFixed(1);
const dspLatencyUs = ((elapsedDSP / (totalExtractedFrames / 2048)) * 1000).toFixed(2);
const meanDetectedFreq = (detectedFreqs.reduce((a, b) => a + b, 0) / detectedFreqs.length).toFixed(1);

console.log(`Real SoundTouch DSP Time-Stretch: ${dspThroughputSamplesSec} samples/sec (${dspLatencyUs} µs per 2048-frame block)`);
console.log(`Pitch Verification: Target=440.0 Hz, Mean Detected Frequency=${meanDetectedFreq} Hz (${detectedFreqs.length} windows verified)`);

// 2. SoundTouch Parameter / Property Updates Benchmark
const roundsSTProp = 10000;
const startSTProp = performance.now();
for (let i = 0; i < roundsSTProp; i++) {
  st.tempo = (i % 2 === 0) ? 2.5 : 3.0;
  st.rate = 1.0;
  const p = st.virtualPitch;
}
const elapsedSTProp = performance.now() - startSTProp;
const soundTouchPropOpsSec = (roundsSTProp / (elapsedSTProp / 1000)).toFixed(1);
const soundTouchPropAvgUs = ((elapsedSTProp / roundsSTProp) * 1000).toFixed(2);
console.log(`SoundTouch Property/Control Updates: ${soundTouchPropOpsSec} ops/sec (${soundTouchPropAvgUs} µs avg)`);

// 3. WebAudio Buffer Duration & Pitch Factor Engine Benchmark
const roundsTransforms = 10000;
const transformLatencies = [];
const audioBlocks = [
  { samples: 1024, sampleRate: 44100, speed: 2.0 },
  { samples: 2048, sampleRate: 48000, speed: 1.5 },
  { samples: 512, sampleRate: 44100, speed: 2.5 },
  { samples: 4096, sampleRate: 44100, speed: 3.0 }
];

for (let i = 0; i < roundsTransforms; i++) {
  const blk = audioBlocks[i % audioBlocks.length];
  const t0 = performance.now();
  const targetDurationMs = (blk.samples / blk.sampleRate / blk.speed) * 1000.0;
  const pitchSemitones = 12.0 * Math.log2(blk.speed);
  const correctionFactor = 1.0 / Math.pow(2.0, pitchSemitones / 12.0);
  const t1 = performance.now();
  transformLatencies.push((t1 - t0) * 1000.0); // microseconds
}

const transformAvgUs = (transformLatencies.reduce((a, b) => a + b, 0) / transformLatencies.length).toFixed(3);
const sortedTransforms = transformLatencies.slice().sort((a, b) => a - b);
const transformP95Us = sortedTransforms[Math.floor(sortedTransforms.length * 0.95)].toFixed(3);
const transformOpsSec = (1000000.0 / parseFloat(transformAvgUs)).toFixed(1);
console.log(`WebAudio Buffer Pitch Transforms: ${transformOpsSec} transforms/sec (avg ${transformAvgUs} µs, p95 ${transformP95Us} µs)`);

// 4. Pitchfinder YIN Frequency Detection Benchmark
const float32Data = new Float32Array(1024);
for (let i = 0; i < float32Data.length; i++) {
  float32Data[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate);
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

// 5. Shadow DOM Piercing Benchmark using JSDOM
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

// 6. Watchdog Rate Enforcement Latency Benchmark
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
  real_soundtouch_dsp_samples_sec: parseFloat(dspThroughputSamplesSec),
  real_soundtouch_dsp_latency_us: parseFloat(dspLatencyUs),
  pitch_target_hz: 440.0,
  pitch_detected_hz: parseFloat(meanDetectedFreq),
  soundtouch_property_access_ops_sec: parseFloat(soundTouchPropOpsSec),
  soundtouch_property_access_avg_us: parseFloat(soundTouchPropAvgUs),
  speed_engine_buffer_transform_ops_sec: parseFloat(transformOpsSec),
  speed_engine_buffer_transform_avg_us: parseFloat(transformAvgUs),
  speed_engine_buffer_transform_p95_us: parseFloat(transformP95Us),
  pitchfinder_yin_detections_sec: parseFloat(pitchOpsPerSec),
  pitchfinder_avg_us: parseFloat(pitchAvgUs),
  shadow_dom_traversals_sec: parseFloat(shadowOpsPerSec),
  shadow_dom_avg_us: parseFloat(shadowAvgUs),
  watchdog_rate_checks_sec: parseFloat(watchdogOpsPerSec),
  watchdog_avg_us: parseFloat(watchdogAvgUs)
};

fs.writeFileSync(path.join(__dirname, 'audio_benchmark_results.json'), JSON.stringify(results, null, 2));
console.log('Saved benchmark results to scripts/audio_benchmark_results.json');
