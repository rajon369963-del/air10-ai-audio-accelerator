// scripts/verify_node_wheels.js
import assert from 'node:assert';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

console.log("=== VERIFYING NODE WHEELS ===");

// 1. Zod
const { z } = require('zod');
const Schema = z.object({ id: z.string(), score: z.number() });
const valid = Schema.parse({ id: 'test-1', score: 0.95 });
assert.strictEqual(valid.score, 0.95);
console.log(" [PASS] 1. zod");

// 2. jsonrepair
const { jsonrepair } = require('jsonrepair');
const repaired = jsonrepair("{'id': 'test', 'val': 123,}");
assert.strictEqual(JSON.parse(repaired).val, 123);
console.log(" [PASS] 2. jsonrepair");

// 3. destr
const { destr } = require('destr');
assert.strictEqual(destr('{"a":1}').a, 1);
console.log(" [PASS] 3. destr");

// 4. devalue
const devalue = require('devalue');
const serialized = devalue.stringify({ date: new Date(1700000000000) });
assert.ok(serialized.length > 0);
console.log(" [PASS] 4. devalue");

// 5. canonical-json
const canonicalJson = (await import('canonical-json')).default;
assert.strictEqual(canonicalJson({ b: 1, a: 2 }), '{"a":2,"b":1}');
console.log(" [PASS] 5. canonical-json");

// 6. fast-json-patch
const jsonpatch = require('fast-json-patch');
const doc = { count: 1 };
jsonpatch.applyPatch(doc, [{ op: 'replace', path: '/count', value: 2 }]);
assert.strictEqual(doc.count, 2);
console.log(" [PASS] 6. fast-json-patch");

// 7. trie-search
const TrieSearch = require('trie-search');
const trie = new TrieSearch('name');
trie.add({ name: 'transformer' });
assert.strictEqual(trie.get('trans').length, 1);
console.log(" [PASS] 7. trie-search");

// 8. wink-bm25-text-search
const bm25 = require('wink-bm25-text-search');
const engine = bm25();
engine.defineConfig({ fldWeights: { body: 1 } });
engine.definePrepTasks([t => t.toLowerCase().split(/\s+/)]);
engine.addDoc({ body: 'gemini nano on device reasoning' }, 1);
engine.addDoc({ body: 'webaudio dsp pitch preservation' }, 2);
engine.addDoc({ body: 'civex progressive context bridge' }, 3);
engine.addDoc({ body: 'fsrs-5 continuous memory retention' }, 4);
engine.addDoc({ body: 'client side dom risk auditing' }, 5);
engine.consolidate();
const searchRes = engine.search('gemini nano');
assert.ok(searchRes.length > 0);
console.log(" [PASS] 8. wink-bm25-text-search");

// 9. flexsearch
const { Index } = require('flexsearch');
const fIdx = new Index();
fIdx.add(1, "civex progressive bridge");
assert.ok(fIdx.search("civex").length > 0);
console.log(" [PASS] 9. flexsearch");

// 10. fastest-levenshtein
const { distance } = require('fastest-levenshtein');
assert.strictEqual(distance('civex', 'civex2'), 1);
console.log(" [PASS] 10. fastest-levenshtein");

// 11. html-to-text
const { convert } = require('html-to-text');
const plain = convert('<h1>AIR10</h1><p>Active Recall</p>');
assert.ok(plain.includes('AIR10'));
console.log(" [PASS] 11. html-to-text");

// 12. parse5
const parse5 = require('parse5');
const ast = parse5.parse('<div>hello</div>');
assert.strictEqual(ast.nodeName, '#document');
console.log(" [PASS] 12. parse5");

// 13. @mozilla/readability
const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<html><head><title>Deep Title</title></head><body><article><p>Deep content for learning and active recall acceleration.</p></article></body></html>');
const article = new Readability(dom.window.document).parse();
assert.strictEqual(article.title, 'Deep Title');
console.log(" [PASS] 13. @mozilla/readability");

// 14. linkify-it
const linkifyPkg = require('linkify-it');
const LinkifyClass = linkifyPkg.LinkifyIt || linkifyPkg;
const linkify = new LinkifyClass();
assert.strictEqual(linkify.test('visit https://google.com today'), true);
console.log(" [PASS] 14. linkify-it");

// 15. p-queue
const PQueue = (await import('p-queue')).default;
const queue = new PQueue({ concurrency: 1 });
let qRes = 0;
await queue.add(async () => { qRes = 42; });
assert.strictEqual(qRes, 42);
console.log(" [PASS] 15. p-queue");

// 16. p-retry
const pRetry = (await import('p-retry')).default;
let count = 0;
const retryRes = await pRetry(async () => {
  count++;
  if (count < 2) throw new Error('transient');
  return 'ok';
}, { retries: 3 });
assert.strictEqual(retryRes, 'ok');
console.log(" [PASS] 16. p-retry");

// 17. p-timeout
const pTimeout = (await import('p-timeout')).default;
const timed = await pTimeout(Promise.resolve('fast'), { milliseconds: 100 });
assert.strictEqual(timed, 'fast');
console.log(" [PASS] 17. p-timeout");

// 18. p-throttle
const pThrottle = (await import('p-throttle')).default;
const throttle = pThrottle({ limit: 2, interval: 50 });
const throttled = throttle(async (x) => x * 2);
assert.strictEqual(await throttled(5), 10);
console.log(" [PASS] 18. p-throttle");

// 19. p-debounce
const pDebounce = (await import('p-debounce')).default;
const debounced = pDebounce(async (val) => val + 1, 10);
assert.strictEqual(await debounced(99), 100);
console.log(" [PASS] 19. p-debounce");

// 20. async-mutex
const { Mutex } = require('async-mutex');
const mutex = new Mutex();
const release = await mutex.acquire();
assert.ok(mutex.isLocked());
release();
assert.ok(!mutex.isLocked());
console.log(" [PASS] 20. async-mutex");

// 21. quick-lru
const QuickLRU = (await import('quick-lru')).default;
const lru = new QuickLRU({ maxSize: 5 });
lru.set('k', 'v');
assert.strictEqual(lru.get('k'), 'v');
console.log(" [PASS] 21. quick-lru");

// 22. lru-cache
const { LRUCache } = require('lru-cache');
const lru2 = new LRUCache({ max: 10 });
lru2.set('foo', 'bar');
assert.strictEqual(lru2.get('foo'), 'bar');
console.log(" [PASS] 22. lru-cache");

// 23. xxhash-wasm
const xxhash = (await import('xxhash-wasm')).default;
const { h64ToString } = await xxhash();
const h = h64ToString('civex-air10-federation');
assert.strictEqual(typeof h, 'string');
console.log(" [PASS] 23. xxhash-wasm");

// 24. spark-md5
const SparkMD5 = require('spark-md5');
const md5Hash = SparkMD5.hash('air10');
assert.strictEqual(typeof md5Hash, 'string');
console.log(" [PASS] 24. spark-md5");

// 25. blakejs
const blake = require('blakejs');
const blakeHash = blake.blake2bHex('gemini-nano');
assert.strictEqual(blakeHash.length, 128);
console.log(" [PASS] 25. blakejs");

// 26. wavefile
const { WaveFile } = require('wavefile');
const wav = new WaveFile();
wav.fromScratch(1, 44100, '16', [0, 100, -100, 0]);
assert.ok(wav.toBuffer().length > 0);
console.log(" [PASS] 26. wavefile");

// 27. web-audio-beat-detector
const beatDetector = require('web-audio-beat-detector');
assert.ok(typeof beatDetector.analyze === 'function');
console.log(" [PASS] 27. web-audio-beat-detector");

// 28. flatted
const { parse: fParse, stringify: fStringify } = require('flatted');
const circular = { a: 1 };
circular.self = circular;
const cStr = fStringify(circular);
assert.strictEqual(fParse(cStr).a, 1);
console.log(" [PASS] 28. flatted");

// 29. klona
const { klona } = require('klona');
const cloned = klona({ deep: { nested: 123 } });
assert.strictEqual(cloned.deep.nested, 123);
console.log(" [PASS] 29. klona");

// 30. deepmerge
const deepmerge = require('deepmerge');
const merged = deepmerge({ a: [1] }, { a: [2] });
assert.deepStrictEqual(merged.a, [1, 2]);
console.log(" [PASS] 30. deepmerge");

// 31. radash
const radash = require('radash');
assert.strictEqual(radash.sum([1, 2, 3, 4]), 10);
console.log(" [PASS] 31. radash");

// 32. supercluster
const SuperclusterPkg = require('supercluster');
const Supercluster = SuperclusterPkg.default || SuperclusterPkg;
const sIdx = new Supercluster({ radius: 40, maxZoom: 16 });
sIdx.load([{ type: 'Feature', geometry: { type: 'Point', coordinates: [10, 20] }, properties: {} }]);
assert.ok(sIdx.getClusters([-180, -85, 180, 85], 2).length > 0);
console.log(" [PASS] 32. supercluster");

// 33. timsort
const timsort = require('timsort');
const arr = [5, 2, 8, 1];
timsort.sort(arr);
assert.deepStrictEqual(arr, [1, 2, 5, 8]);
console.log(" [PASS] 33. timsort");

// 34. mnemonist
const mnemonist = require('mnemonist');
const mTrie = new mnemonist.Trie();
mTrie.add('fast');
assert.strictEqual(mTrie.has('fast'), true);
console.log(" [PASS] 34. mnemonist");

// 35. bloom-filters
const { BloomFilter } = require('bloom-filters');
const bloom = new BloomFilter(100, 4);
bloom.add('item1');
assert.strictEqual(bloom.has('item1'), true);
console.log(" [PASS] 35. bloom-filters");

// 36. flatbuffers
const flatbuffers = require('flatbuffers');
assert.ok(typeof flatbuffers.Builder === 'function');
console.log(" [PASS] 36. flatbuffers");

// 37. protobufjs
const protobuf = require('protobufjs');
const Root = new protobuf.Root();
assert.ok(Root !== null);
console.log(" [PASS] 37. protobufjs");

// 38. fast-fuzzy
const { search: fuzzySearch } = require('fast-fuzzy');
const fuzzyMatches = fuzzySearch('civex', ['civex-bridge', 'audio-player', 'other']);
assert.ok(fuzzyMatches.length > 0);
console.log(" [PASS] 38. fast-fuzzy");

// 39. string-similarity
const stringSimilarity = require('string-similarity');
const sim = stringSimilarity.compareTwoStrings('healed', 'sealed');
assert.ok(sim > 0.5);
console.log(" [PASS] 39. string-similarity");

// 40. he
const he = require('he');
assert.strictEqual(he.decode('&lt;div&gt;'), '<div>');
console.log(" [PASS] 40. he");

// 41. entities
const entities = require('entities');
assert.strictEqual(entities.decodeHTML('&amp;'), '&');
console.log(" [PASS] 41. entities");

// 42. n-gram
const { nGram } = await import('n-gram');
assert.strictEqual(nGram(2)('hello').length, 4);
console.log(" [PASS] 42. n-gram");

// 43. limiter
const { RateLimiter } = require('limiter');
const limiter = new RateLimiter({ tokensPerInterval: 10, interval: 'second' });
assert.ok(await limiter.removeTokens(1));
console.log(" [PASS] 43. limiter");

// 44. bottleneck
const Bottleneck = require('bottleneck');
const bLimiter = new Bottleneck({ maxConcurrent: 1, minTime: 10 });
const bRes = await bLimiter.schedule(() => Promise.resolve('ok'));
assert.strictEqual(bRes, 'ok');
console.log(" [PASS] 44. bottleneck");

// 45. soundtouchjs
const soundtouchjs = require('soundtouchjs');
assert.ok(soundtouchjs !== null);
console.log(" [PASS] 45. soundtouchjs");

// 46. cheerio
const cheerio = require('cheerio');
const $ = cheerio.load('<p id="c">civex</p>');
assert.strictEqual($('#c').text(), 'civex');
console.log(" [PASS] 46. cheerio");

// 47. dompurify
const createDOMPurify = require('dompurify');
const { window } = new JSDOM('');
const DOMPurify = createDOMPurify(window);
const clean = DOMPurify.sanitize('<script>alert(1)</script><p>safe</p>');
assert.strictEqual(clean, '<p>safe</p>');
console.log(" [PASS] 47. dompurify");

// 48. sanitize-html
const sanitizeHtml = require('sanitize-html');
const sanitized = sanitizeHtml('<b onmouseover="x">bold</b>');
assert.strictEqual(sanitized, '<b>bold</b>');
console.log(" [PASS] 48. sanitize-html");

// 49. minisearch
const MiniSearch = require('minisearch');
const mini = new MiniSearch({ fields: ['title'], storeFields: ['title'] });
mini.add({ id: 1, title: 'Gemini Nano On-Device' });
assert.strictEqual(mini.search('Nano').length, 1);
console.log(" [PASS] 49. minisearch");

// 50. fuse.js
const Fuse = require('fuse.js');
const fuse = new Fuse(['Gemini Nano', 'WebAudio DSP']);
assert.ok(fuse.search('Nano').length > 0);
console.log(" [PASS] 50. fuse.js");

// 51. natural
const natural = require('natural');
const tfidf = new natural.TfIdf();
tfidf.addDocument('civex high speed ranker');
assert.ok(tfidf.documents.length > 0);
console.log(" [PASS] 51. natural");

// 52. ts-fsrs
const { fsrs } = require('ts-fsrs');
const f = fsrs();
assert.ok(typeof f.repeat === 'function');
console.log(" [PASS] 52. ts-fsrs");

// 53. mathjs
const { evaluate } = require('mathjs');
assert.strictEqual(evaluate('2 + 3 * 4'), 14);
console.log(" [PASS] 53. mathjs");

// 54. bignumber.js
const BigNumber = require('bignumber.js');
assert.strictEqual(new BigNumber('0.1').plus('0.2').toString(), '0.3');
console.log(" [PASS] 54. bignumber.js");

// 55. @msgpack/msgpack
const { encode: mpEncode, decode: mpDecode } = require('@msgpack/msgpack');
const packed = mpEncode({ hello: 'world' });
assert.strictEqual(mpDecode(packed).hello, 'world');
console.log(" [PASS] 55. @msgpack/msgpack");

console.log("\n>>> ALL 55 NODE WHEELS VERIFIED AND OPERATIONAL! <<<");
