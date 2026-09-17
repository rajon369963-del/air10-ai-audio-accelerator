import test from 'node:test';
import assert from 'node:assert/strict';

// 1. Search & Retrieval Wheels
import MiniSearch from 'minisearch';
import Fuse from 'fuse.js';
import natural from 'natural';
import * as stopword from 'stopword';

// 2. Mathematical & Quant Risk Engines
import * as mathjs from 'mathjs';
import BigNumber from 'bignumber.js';
import * as ss from 'simple-statistics';
import regression from 'regression';
import Fraction from 'fraction.js';
import Complex from 'complex.js';

// 3. IPC & Offscreen Data Layer
import * as msgpack from '@msgpack/msgpack';
import * as comlink from 'comlink';

// 4. HTML, DOM & Markdown Processing
import { parseHTML } from 'linkedom';
import TurndownService from 'turndown';
import { parse as parseNodeHTML } from 'node-html-parser';
import sanitizeHtml from 'sanitize-html';
import { XMLParser } from 'fast-xml-parser';
import { marked } from 'marked';

// 5. Token Budgeting, Schema & Diffing
import { encodingForModel } from 'js-tiktoken';
import Ajv from 'ajv';
import { z } from 'zod';
import fastDiff from 'fast-diff';

// 6. Spaced Repetition & NLP
import { fsrs, generatorParameters, Rating } from 'ts-fsrs';
import nlp from 'compromise';
import * as chrono from 'chrono-node';

// 7. Compression, Hashing & Utilities
import { deflate as pakoDeflate, inflate as pakoInflate } from 'pako';
import * as fflate from 'fflate';
import LZString from 'lz-string';
import CryptoJS from 'crypto-js';
import { v4 as uuidv4 } from 'uuid';

// 8. Concurrency & Event Emitters
import pLimit from 'p-limit';
import EventEmitter from 'eventemitter3';
import { minimatch } from 'minimatch';

// Core Federation Module (CommonJS default import)
import civexNanoBridge from '../../modules/civex-nano-bridge.js';
const {
  SchemaShrinker,
  InBrowserBM25Router,
  CognitiveAudioPacer,
  LocalDomRiskAuditor,
  JITHydrator,
  StreamingChunkParser,
  AudioDucker,
  WebGPUWatchdog
} = civexNanoBridge;

test('Wheel Suite 1: Search, Retrieval & BM25 In-Browser Engines', (t) => {
  const miniSearch = new MiniSearch({
    fields: ['title', 'text'],
    storeFields: ['title', 'category']
  });
  miniSearch.addAll([
    { id: 1, title: 'Transformer Derivations', text: 'Lorentz force and magnetic flux linkage', category: 'EE' },
    { id: 2, title: 'Quant Risk Guard', text: 'DOM level slippage check and order size audit', category: 'QUANT' }
  ]);
  const searchRes = miniSearch.search('flux linkage');
  assert.ok(searchRes.length > 0);
  assert.equal(searchRes[0].title, 'Transformer Derivations');

  const fuse = new Fuse(['Gemini Nano', 'WebGPU Accelerate', 'Offscreen Worker']);
  const fuseRes = fuse.search('gemini');
  assert.ok(fuseRes.length > 0);
  assert.equal(fuseRes[0].item, 'Gemini Nano');

  const tokenizer = new natural.WordTokenizer();
  const tokens = tokenizer.tokenize('running audio acceleration algorithms');
  assert.ok(tokens.includes('acceleration'));
  const stemmed = natural.PorterStemmer.stem('acceleration');
  assert.equal(stemmed, 'acceler');

  const cleanedTokens = stopword.removeStopwords(['the', 'audio', 'is', 'running', 'at', '3x']);
  assert.ok(!cleanedTokens.includes('the') && !cleanedTokens.includes('is'));
});

test('Wheel Suite 2: Mathematical, Statistical & Quant Risk Engines', (t) => {
  const expr = mathjs.evaluate('sqrt(3) * 400 * 10 * cos(unit(30, "deg"))');
  assert.ok(typeof expr === 'number' && expr > 0);

  const x = new BigNumber('123456789.987654321');
  const y = new BigNumber('987654321.123456789');
  const sum = x.plus(y);
  assert.equal(sum.toFixed(9), '1111111111.111111110');

  const data = [1.2, 1.5, 1.4, 1.6, 1.3, 1.5];
  const mean = ss.mean(data);
  const std = ss.standardDeviation(data);
  assert.ok(mean > 1.3 && mean < 1.5);
  assert.ok(std > 0);

  const points = [[0, 1], [1, 3], [2, 5]];
  const line = regression.linear(points);
  assert.equal(line.equation[0], 2);
  assert.equal(line.equation[1], 1);

  const f = new Fraction(1, 3).add(new Fraction(1, 6));
  assert.equal(f.toFraction(), '1/2');

  const c1 = new Complex(3, 4);
  assert.equal(c1.abs(), 5);
});

test('Wheel Suite 3: IPC Serialization & Offscreen Protocols', (t) => {
  const payload = {
    type: 'CIVEX_INFERENCE_REQUEST',
    query: 'Calculate synchronous reactance',
    lotSize: 2.5,
    timestamp: 1726000000000
  };
  const encoded = msgpack.encode(payload);
  const decoded = msgpack.decode(encoded);
  assert.deepEqual(decoded, payload);
  assert.ok(encoded.byteLength > 0);

  assert.ok(typeof comlink.expose === 'function');
  assert.ok(typeof comlink.wrap === 'function');
});

test('Wheel Suite 4: HTML Parsing, Sanitization & Markdown Conversion', (t) => {
  const { document } = parseHTML('<html><body><div class="civex-node">Derivation Step 1</div></body></html>');
  assert.equal(document.querySelector('.civex-node').textContent, 'Derivation Step 1');

  const turndownService = new TurndownService({ headingStyle: 'atx' });
  const md = turndownService.turndown('<h1>Title</h1><p>Derivation <strong>bold</strong> formula.</p>');
  assert.ok(md.includes('# Title') && md.includes('**bold**'));

  const root = parseNodeHTML('<div id="risk-val">0.025</div>');
  assert.equal(root.getElementById('risk-val').text, '0.025');

  const dirty = '<p>Normal text <script>alert("hack")</script></p>';
  const clean = sanitizeHtml(dirty);
  assert.ok(!clean.includes('<script>'));

  const parser = new XMLParser();
  const xmlObj = parser.parse('<tt xml:lang="en"><body><p begin="0:00:01.00">Speech Cue</p></body></tt>');
  assert.equal(xmlObj.tt.body.p, 'Speech Cue');

  const htmlOutput = marked.parse('### Sub-Heading\n* Item 1');
  assert.ok(htmlOutput.includes('<h3>Sub-Heading</h3>'));
});

test('Wheel Suite 5: Token Budgeting, Schema Shrinking & Fast Diffing', (t) => {
  const enc = encodingForModel('gpt-3.5-turbo');
  const tokens = enc.encode('Synchronous machine armature reaction under leading power factor');
  assert.ok(tokens.length > 5 && tokens.length < 20);

  const ajv = new Ajv();
  const schema = {
    type: 'object',
    properties: {
      action: { type: 'string' },
      speed: { type: 'number' }
    },
    required: ['action', 'speed'],
    additionalProperties: false
  };
  const validate = ajv.compile(schema);
  assert.ok(validate({ action: 'SET_AUDIO_SPEED', speed: 3.0 }));
  assert.equal(validate({ action: 'INVALID' }), false);

  const RiskSchema = z.object({
    symbol: z.string(),
    maxSlippage: z.number().max(0.05)
  });
  const validRisk = RiskSchema.safeParse({ symbol: 'BANKNIFTY', maxSlippage: 0.02 });
  assert.ok(validRisk.success);

  const diffs = fastDiff('Derivation of EMF equation', 'Derivation of Torque equation');
  assert.ok(diffs.length >= 3);
});

test('Wheel Suite 6: Spaced Repetition (FSRS-5) & Chrono Parsing', (t) => {
  const f = fsrs(generatorParameters({ enable_fuzz: false }));
  const card = {
    due: new Date(),
    stability: 2.0,
    difficulty: 5.0,
    elapsed_days: 0,
    scheduled_days: 0,
    reps: 1,
    lapses: 0,
    state: 0,
    last_review: new Date()
  };
  const recordLog = f.repeat(card, new Date());
  assert.ok(recordLog[Rating.Good]);
  assert.ok(recordLog[Rating.Good].card.scheduled_days >= 0);

  const doc = nlp('Study transformers and solve three numerical problems');
  const verbs = doc.verbs().out('array');
  assert.ok(verbs.includes('study') || verbs.includes('solve'));

  const parsedDate = chrono.parseDate('Tomorrow at 10am');
  assert.ok(parsedDate instanceof Date);
});

test('Wheel Suite 7: Compression, Cryptographic Hashing & UUIDs', (t) => {
  const inputStr = 'AIR10-CIVEX-FEDERATION-'.repeat(20);
  const deflated = pakoDeflate(inputStr);
  const inflated = new TextDecoder().decode(pakoInflate(deflated));
  assert.equal(inflated, inputStr);

  const fflateDeflated = fflate.zlibSync(fflate.strToU8(inputStr));
  const fflateInflated = fflate.strFromU8(fflate.unzlibSync(fflateDeflated));
  assert.equal(fflateInflated, inputStr);

  const lzCompressed = LZString.compress(inputStr);
  const lzDecompressed = LZString.decompress(lzCompressed);
  assert.equal(lzDecompressed, inputStr);

  const hash = CryptoJS.SHA256(inputStr).toString();
  assert.equal(hash.length, 64);

  const id = uuidv4();
  assert.equal(id.length, 36);
});

test('Wheel Suite 8: Concurrency & Event Dispatching', async (t) => {
  const limit = pLimit(2);
  let active = 0;
  let maxActive = 0;

  const tasks = Array.from({ length: 6 }, (_, i) => limit(async () => {
    active++;
    maxActive = Math.max(maxActive, active);
    await new Promise(r => setTimeout(r, 10));
    active--;
    return i;
  }));

  const results = await Promise.all(tasks);
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5]);
  assert.ok(maxActive <= 2);

  const ee = new EventEmitter();
  let received = false;
  ee.on('CIVEX_EVENT', (data) => {
    received = (data === 'AUDIO_READY');
  });
  ee.emit('CIVEX_EVENT', 'AUDIO_READY');
  assert.equal(received, true);

  assert.ok(minimatch('tests/unit/audio.test.js', '**/*.test.js'));
  assert.equal(minimatch('src/index.html', '**/*.test.js'), false);
});

test('Interconnection² Compound Pipeline: Search + Math + FSRS + Zod + Nano Bridge', (t) => {
  const { document } = parseHTML(`
    <div id="lecture-notes">
      <h3>Transformer Phasor Diagram</h3>
      <p>Under lagging power factor, E2 = V2 + I2*R2 + j*I2*X2. Resistance R2 is 0.05 ohms.</p>
    </div>
  `);
  const rawText = document.getElementById('lecture-notes').textContent;

  const ms = new MiniSearch({ fields: ['content'], storeFields: ['content'] });
  ms.add({ id: 1, content: rawText });
  const hit = ms.search('lagging power factor')[0];
  assert.ok(hit);

  const shadow = SchemaShrinker.shrinkTool({
    id: 'PhasorCalc',
    name: 'calc_phasor',
    desc: 'Calculate transformer secondary voltage drop'
  });
  const tsSig = SchemaShrinker.toTypeScriptSignature(shadow);
  assert.ok(new TextEncoder().encode(JSON.stringify(shadow)).length <= 250);
  assert.ok(tsSig.includes('interface PhasorCalc'));

  const v2 = 230;
  const i2 = 10;
  const r2 = 0.05;
  const drop = mathjs.evaluate(`${i2} * ${r2}`);
  assert.equal(drop, 0.5);

  const pacerRes = CognitiveAudioPacer.analyzeDensity(rawText);
  assert.ok(pacerRes.recommendedSpeed <= 1.5, 'Complex phasor formula slows down pacing for optimal retention');

  const OutputSchema = z.object({
    rate: z.number().min(0.5).max(3.0),
    drop: z.number().positive()
  });
  const res = OutputSchema.safeParse({ rate: pacerRes.recommendedSpeed, drop });
  assert.ok(res.success);
});

test('10x Hostile Stress Test: 10 Consecutive High-Throughput Compound Cycles', async (t) => {
  const enc = encodingForModel('gpt-3.5-turbo');

  for (let round = 1; round <= 10; round++) {
    const cycleQuery = `Round ${round}: Analyze voltage regulation with inductive impedance Z = 3 + 4j`;
    
    const tokens = enc.encode(cycleQuery);
    assert.ok(tokens.length > 0);

    const shadow = SchemaShrinker.shrinkTool({
      id: `Tool_${round}`,
      name: `calc_${round}`,
      desc: cycleQuery
    });
    assert.ok(new TextEncoder().encode(JSON.stringify(shadow)).length <= 250);

    const zMag = new Complex(3, 4).abs();
    assert.equal(zMag, 5);

    const auditRes = LocalDomRiskAuditor.auditOrder({ size: round * 10, maxSizingLimit: 200, price: 50 });
    assert.equal(auditRes.approved, true);

    const pacerRes = CognitiveAudioPacer.analyzeDensity(cycleQuery);
    assert.ok(pacerRes.recommendedSpeed >= 1.25 && pacerRes.recommendedSpeed <= 3.0);
  }
});
