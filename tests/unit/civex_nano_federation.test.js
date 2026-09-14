const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const Bridge = require('../../modules/civex-nano-bridge.js');
const { SchemaShrinker, InBrowserBM25Router, CognitiveAudioPacer, LocalDomRiskAuditor, JITHydrator } = Bridge;

test('CIVEX-NANO Federation: Shadow Schema Compressor (<= 250 Bytes)', async (t) => {
  const sampleTools = [
    {
      id: 'study_resume',
      name: 'study_resume',
      cat: 'study',
      desc: 'Resume active study session and load next archetype question for GATE/ESE',
      cmd: 'study_resume --auto'
    },
    {
      id: 'study_inspect_page',
      name: 'study_inspect_page',
      cat: 'dom',
      desc: 'Inspect current Gemini or NotebookLM page elements, headings, and clickable controls in real DOM ancestry',
      cmd: 'study_inspect_page'
    },
    {
      id: 'quant_risk_audit',
      name: 'quant_risk_audit',
      cat: 'quant',
      desc: 'Audit trade order size and execution slippage locally before dispatch with zero data leakage to cloud',
      cmd: 'quant_risk_audit'
    },
    {
      id: 'audio_dynamic_pace',
      name: 'audio_dynamic_pace',
      cat: 'audio',
      desc: 'Calculate dynamic DSP speed scaling based on concept density and mathematical tokens in real time',
      cmd: 'audio_dynamic_pace'
    }
  ];

  for (const tool of sampleTools) {
    const shadow = SchemaShrinker.shrinkTool(tool);
    const byteSize = new TextEncoder().encode(JSON.stringify(shadow)).length;
    assert.ok(byteSize <= 250, `Tool ${tool.id} exceeded 250 bytes: ${byteSize} bytes`);
    assert.equal(shadow.id, tool.id);
    assert.ok(shadow.summary.length > 0);

    const tsSig = SchemaShrinker.toTypeScriptSignature(shadow);
    assert.ok(tsSig.startsWith(`interface ${shadow.id}`));
  }
});

test('CIVEX-NANO Federation: In-Browser Sub-Millisecond BM25 Router', async (t) => {
  const tools = [
    { id: 'study_resume', name: 'study_resume', cat: 'study', desc: 'Resume active study session and load next archetype question' },
    { id: 'study_inspect_page', name: 'study_inspect_page', cat: 'dom', desc: 'Inspect current Gemini or NotebookLM page elements' },
    { id: 'study_click_native_selector', name: 'study_click_native_selector', cat: 'action', desc: 'Click native UI element matching selector or text' },
    { id: 'study_verify_native_origin', name: 'study_verify_native_origin', cat: 'audit', desc: 'Verify DOM ancestry of study question for genuine origin' },
    { id: 'quant_risk_audit', name: 'quant_risk_audit', cat: 'quant', desc: 'Audit trade order size and slippage locally before dispatch' },
    { id: 'audio_dynamic_pace', name: 'audio_dynamic_pace', cat: 'audio', desc: 'Calculate dynamic DSP speed scaling based on concept density' }
  ];

  const router = new InBrowserBM25Router(tools);

  // Test 1: Study query
  const startStudy = performance.now();
  const studyMatches = router.routeQuery('resume the current active study question and continue', 2);
  const studyElapsed = performance.now() - startStudy;
  assert.ok(studyElapsed < 5.0, `BM25 latency must be sub-5ms in Node (was ${studyElapsed.toFixed(3)}ms)`);
  assert.equal(studyMatches[0].id, 'study_resume');

  // Test 2: Quant query
  const startQuant = performance.now();
  const quantMatches = router.routeQuery('check slippage and verify risk of this market order', 2);
  const quantElapsed = performance.now() - startQuant;
  assert.ok(quantElapsed < 5.0, `BM25 latency must be sub-5ms in Node (was ${quantElapsed.toFixed(3)}ms)`);
  assert.equal(quantMatches[0].id, 'quant_risk_audit');

  // Test 3: Audio pacing query
  const audioMatches = router.routeQuery('adjust audio speed for formula density and derivation', 2);
  assert.equal(audioMatches[0].id, 'audio_dynamic_pace');
});

test('CIVEX-NANO Federation: Cognitive Audio Pacing DSP', async (t) => {
  // Analytical derivation -> speed slows to 1.25x - 1.5x
  const mathHeavyText = 'Here we derive the synchronous reactance equation using transient impedance, flux linkage, and Laplace differential operators.';
  const heavyPacing = CognitiveAudioPacer.analyzeDensity(mathHeavyText);
  assert.ok(heavyPacing.recommendedSpeed <= 1.5, `Math heavy text should slow down (got ${heavyPacing.recommendedSpeed}x)`);
  assert.equal(heavyPacing.reason, 'HIGH_CONCEPT_DENSITY');

  // Chit-chat filler -> speed accelerates to 2.5x - 3.0x
  const chatText = 'Welcome guys! Hello and thank you for joining! Cool and awesome intro, like and subscribe, you know basically!';
  const chatPacing = CognitiveAudioPacer.analyzeDensity(chatText);
  assert.ok(chatPacing.recommendedSpeed >= 2.5, `Chit-chat filler should speed up (got ${chatPacing.recommendedSpeed}x)`);
  assert.equal(chatPacing.reason, 'CONVERSATIONAL_FILLER');

  // Balanced normal text -> 2.0x default
  const balancedText = 'In this section we review the agenda and discuss the general overview of our weekly schedule.';
  const balancedPacing = CognitiveAudioPacer.analyzeDensity(balancedText);
  assert.equal(balancedPacing.recommendedSpeed, 2.0);
});

test('CIVEX-NANO Federation: Local DOM Risk Auditor (Zero-Cloud Quant)', async (t) => {
  // 1. Safe order -> Approved
  const safeOrder = { symbol: 'AAPL', size: 25, price: 180, maxSizeLimit: 100, type: 'LIMIT' };
  const safeAudit = LocalDomRiskAuditor.auditOrder(safeOrder);
  assert.equal(safeAudit.riskLevel, 'PASS');
  assert.equal(safeAudit.approved, true);
  assert.equal(safeAudit.telemetryEgress, 'ZERO_EGRESS_VERIFIED');

  // 2. Oversized order -> Blocked with CRITICAL
  const hugeOrder = { symbol: 'AAPL', size: 500, price: 180, maxSizeLimit: 100, type: 'LIMIT' };
  const hugeAudit = LocalDomRiskAuditor.auditOrder(hugeOrder);
  assert.equal(hugeAudit.riskLevel, 'CRITICAL');
  assert.equal(hugeAudit.approved, false);
  assert.ok(hugeAudit.risks.some(r => r.code === 'SIZE_EXCEEDED'));

  // 3. High notional market order -> Warning flag
  const slippageOrder = { symbol: 'TSLA', size: 400, price: 200, maxSizeLimit: 1000, type: 'MARKET' };
  const slippageAudit = LocalDomRiskAuditor.auditOrder(slippageOrder);
  assert.equal(slippageAudit.riskLevel, 'MEDIUM');
  assert.equal(slippageAudit.approved, true);
  assert.ok(slippageAudit.risks.some(r => r.code === 'SLIPPAGE_WARNING'));
});

test('CIVEX-NANO Federation: JIT System Prompt Token Budget (< 500 tokens)', async (t) => {
  const tools = [
    { id: 'study_resume', name: 'study_resume', cat: 'study', desc: 'Resume active study session and load next archetype question' },
    { id: 'study_inspect_page', name: 'study_inspect_page', cat: 'dom', desc: 'Inspect current Gemini or NotebookLM page elements' }
  ];

  const systemPrompt = JITHydrator.buildSystemPrompt(tools);
  const estimatedTokens = JITHydrator.estimateTokens(systemPrompt);

  assert.ok(estimatedTokens < 500, `JIT system prompt must fit comfortably under 500 tokens (was ${estimatedTokens} tokens)`);
  assert.ok(systemPrompt.includes('study_resume'));
  assert.ok(systemPrompt.includes('study_inspect_page'));
});

test('CIVEX-NANO Federation: Security Guard - Zero Network Egress', async (t) => {
  const bridgePath = path.join(__dirname, '../../modules/civex-nano-bridge.js');
  const offscreenPath = path.join(__dirname, '../../offscreen.js');

  const bridgeCode = fs.readFileSync(bridgePath, 'utf8');
  const offscreenCode = fs.readFileSync(offscreenPath, 'utf8');

  // Must not have fetch(), XMLHttpRequest, or external https URLs
  for (const [name, code] of [['civex-nano-bridge.js', bridgeCode], ['offscreen.js', offscreenCode]]) {
    assert.ok(!code.includes('fetch('), `${name} must not call fetch()`);
    assert.ok(!code.includes('XMLHttpRequest'), `${name} must not use XMLHttpRequest`);
    assert.ok(!code.includes('WebSocket'), `${name} must not use WebSocket`);
    assert.ok(!code.includes('https://api.'), `${name} must not communicate with cloud APIs`);
  }
});

test('CIVEX-NANO Federation: StreamingChunkParser Optimistic Token Detection', async (t) => {
  const { StreamingChunkParser } = Bridge;
  assert.ok(StreamingChunkParser, 'StreamingChunkParser should be exported');

  // Test 1: Partial JSON streaming chunk
  const partialChunk = '{"tool":"audio_dynamic_pace","args":{"text":"calculating Laplace transform';
  const detected = StreamingChunkParser.scanForTools(partialChunk);
  assert.ok(detected, 'Should detect tool from partial chunk');
  assert.equal(detected.tool, 'audio_dynamic_pace');
  assert.equal(detected.isPartial, true);

  // Test 2: Complete JSON chunk
  const completeChunk = '{"tool":"quant_risk_audit","args":{"size":10,"price":150}}';
  const completeDetected = StreamingChunkParser.scanForTools(completeChunk);
  assert.ok(completeDetected, 'Should detect tool from complete chunk');
  assert.equal(completeDetected.tool, 'quant_risk_audit');
  assert.equal(completeDetected.args.size, 10);
  assert.equal(completeDetected.args.price, 150);

  // Test 3: Irrelevant conversational stream
  const chatter = 'Sure, here is your analysis: The market looks neutral today.';
  const chatterDetected = StreamingChunkParser.scanForTools(chatter);
  assert.equal(chatterDetected, null);
});

test('CIVEX-NANO Federation: AudioDucker Background Media Attenuation', async (t) => {
  const { AudioDucker } = Bridge;
  assert.ok(AudioDucker, 'AudioDucker should be exported');

  const fakeVideo = { volume: 1.0 };
  const fakeAudio = { volume: 0.8 };

  // Duck to 0.2x
  const duckedStates = AudioDucker.duck([fakeVideo, fakeAudio], 0.2);
  assert.equal(fakeVideo.volume, 0.2);
  assert.equal(fakeAudio.volume, 0.2);

  // Restore back to original volumes
  AudioDucker.restore(duckedStates);
  assert.equal(fakeVideo.volume, 1.0);
  assert.equal(fakeAudio.volume, 0.8);
});

test('CIVEX-NANO Federation: WebGPUWatchdog Device Guard & Fallback', async (t) => {
  const { WebGPUWatchdog } = Bridge;
  assert.ok(WebGPUWatchdog, 'WebGPUWatchdog should be exported');

  const health = await WebGPUWatchdog.checkDeviceHealth(50);
  assert.ok(health.status === 'HEALTHY' || health.status === 'FALLBACK_CPU' || health.status === 'RECOVERY_TRIGGERED');
  if (health.status === 'FALLBACK_CPU') {
    assert.ok(health.reason);
  }
});

test('CIVEX-NANO Federation: Adversarial Stress Test (500 High-Throughput Queries & Fuzzing)', async (t) => {
  const tools = [
    { id: 'study_resume', name: 'study_resume', cat: 'study', desc: 'Resume active study session and load next archetype question' },
    { id: 'study_inspect_page', name: 'study_inspect_page', cat: 'dom', desc: 'Inspect current Gemini or NotebookLM page elements' },
    { id: 'study_click_native_selector', name: 'study_click_native_selector', cat: 'action', desc: 'Click native UI element matching selector or text' },
    { id: 'quant_risk_audit', name: 'quant_risk_audit', cat: 'quant', desc: 'Audit trade order size and slippage locally before dispatch' },
    { id: 'audio_dynamic_pace', name: 'audio_dynamic_pace', cat: 'audio', desc: 'Calculate dynamic DSP speed scaling based on concept density' }
  ];

  const router = new InBrowserBM25Router(tools);

  // 1. High-throughput throughput check (500 queries)
  const queries = [
    'resume study question',
    'audit quant risk limit',
    'inspect DOM buttons',
    'adjust audio speed factor',
    'click native submit button'
  ];

  const startBatch = performance.now();
  for (let i = 0; i < 500; i++) {
    const q = queries[i % queries.length];
    const res = router.routeQuery(q, 2);
    assert.ok(res.length > 0);
  }
  const totalDuration = performance.now() - startBatch;
  const avgQueryLatency = totalDuration / 500;
  assert.ok(avgQueryLatency < 1.0, `Avg BM25 routing latency must be sub-1ms (was ${avgQueryLatency.toFixed(3)}ms)`);

  // 2. Adversarial Fuzzing
  const fuzzed = [
    '',
    '   ',
    '???@@@###$$$%%%^^^&&&***((()))',
    'a'.repeat(5000),
    '{"tool": "invalid", "args": null}',
    'SELECT * FROM tools WHERE 1=1'
  ];

  for (const malicious of fuzzed) {
    const safeOutput = router.routeQuery(malicious, 2);
    assert.ok(Array.isArray(safeOutput), 'Must safely return array on adversarial inputs');
  }
});

