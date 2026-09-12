const test = require('node:test');
const assert = require('node:assert');
const { setupMockBrowser } = require('../test_harness');

test('Long-Session Leak Prevention: Observer/Listener Singleton Guard and Disconnected Media Pruning', async () => {
  const win = setupMockBrowser();
  delete win.__AIR10_AUDIO_ACCELERATOR__;

  // Track event listeners on document to detect listener accumulation
  let documentClickListeners = 0;
  const origAddEventListener = win.document.addEventListener;
  win.document.addEventListener = function(type, cb, options) {
    if (type === 'click') {
      documentClickListeners++;
    }
    return origAddEventListener.call(win.document, type, cb, options);
  };

  // Track MutationObserver instances
  let mutationObserverInstances = 0;
  const origMutationObserver = win.MutationObserver;
  win.MutationObserver = class TrackedMutationObserver {
    constructor(cb) {
      mutationObserverInstances++;
      this.cb = cb;
    }
    observe() {}
    disconnect() {}
  };
  global.MutationObserver = win.MutationObserver;

  // Mock AudioParam prototype to test setValueAtTime isolation
  win.AudioParam = function() {
    this.value = 1.0;
  };
  win.AudioParam.prototype = {
    setValueAtTime(val, time) {
      this.value = val;
    }
  };
  global.AudioParam = win.AudioParam;

  // Load module
  delete require.cache[require.resolve('../../modules/audio-accelerator.js')];
  require('../../modules/audio-accelerator.js');

  const controller = win.__AIR10_AUDIO__;
  assert.ok(controller, 'Audio controller must be initialized');

  // Baseline check:
  // 1 DOM scanner MutationObserver + 1 NotebookLM menu MutationObserver = 2 total
  assert.strictEqual(mutationObserverInstances, 2, 'Initial load should create exactly 2 MutationObservers (DOM scanner + Menu observer)');
  assert.strictEqual(documentClickListeners, 1, 'Initial hook should create exactly 1 document click listener');
  assert.strictEqual(controller.isMenuHooked(), true, 'isMenuHooked should be true');

  // 1. Simulate 1,000 guardian timer invocations (representing a long multi-hour session)
  for (let i = 0; i < 1000; i++) {
    controller.hookNotebookLMSpeedMenu();
  }

  // Verify ZERO listener or observer leaks
  assert.strictEqual(
    mutationObserverInstances,
    2,
    'MutationObserver instance count must remain strictly 2 after 1,000 guardian ticks'
  );
  assert.strictEqual(
    documentClickListeners,
    1,
    'Document click listener count must remain strictly 1 after 1,000 guardian ticks'
  );

  // 2. Test Disconnected Media Element Pruning
  const activeSet = controller.getActiveMediaElements();
  const shadowSet = controller.getInterceptedShadowRoots();
  assert.ok(activeSet, 'activeMediaElements set should be accessible');

  // Create mock audio elements
  const elConnected = { tagName: 'AUDIO', isConnected: true, playbackRate: 2.0 };
  const elDisconnected1 = { tagName: 'AUDIO', isConnected: false, playbackRate: 2.0 };
  const elDisconnected2 = { tagName: 'VIDEO', isConnected: false, playbackRate: 2.0 };

  activeSet.add(elConnected);
  activeSet.add(elDisconnected1);
  activeSet.add(elDisconnected2);

  assert.strictEqual(activeSet.size, 3, 'Set should hold 3 media elements before pruning');

  // Also add shadow roots
  const shadowConnected = { host: { isConnected: true } };
  const shadowDisconnected = { host: { isConnected: false } };
  shadowSet.add(shadowConnected);
  shadowSet.add(shadowDisconnected);
  assert.strictEqual(shadowSet.size, 2, 'Shadow set should hold 2 shadow roots before pruning');

  // Execute pruning (or trigger applySpeed which automatically calls pruneDisconnectedMedia)
  controller.pruneDisconnectedMedia();

  assert.strictEqual(activeSet.size, 1, 'Disconnected media elements must be pruned');
  assert.ok(activeSet.has(elConnected), 'Connected media element must remain in set');
  assert.ok(!activeSet.has(elDisconnected1), 'Disconnected element 1 must be evicted');
  assert.ok(!activeSet.has(elDisconnected2), 'Disconnected element 2 must be evicted');

  assert.strictEqual(shadowSet.size, 1, 'Disconnected shadow roots must be pruned');
  assert.ok(shadowSet.has(shadowConnected), 'Connected shadow root must remain in set');
  assert.ok(!shadowSet.has(shadowDisconnected), 'Disconnected shadow root must be evicted');

  // 3. Test AudioParam.prototype.setValueAtTime Strict Isolation
  // Verify that an unrelated audio param (e.g. GainNode.gain) is NOT contaminated
  const dummyGainParam = {
    value: 1.0,
    setValueAtTime(val, time) {
      this.value = val;
    }
  };
  // Calling setValueAtTime on an AudioParam without __isPlaybackRateParam
  AudioParam.prototype.setValueAtTime.call(dummyGainParam, 1.0, 0);
  assert.strictEqual(dummyGainParam.value, 1.0, 'Unrelated AudioParam value of 1.0 must NOT be converted to 3.0x');

  // But a playbackRate param WITH __isPlaybackRateParam = true MUST receive targetSpeed
  controller.setSpeed(3.0);
  const playbackRateParam = {
    __isPlaybackRateParam: true,
    value: 1.0,
    setValueAtTime(val, time) {
      this.value = val;
    }
  };
  AudioParam.prototype.setValueAtTime.call(playbackRateParam, 1.0, 0);
  assert.strictEqual(playbackRateParam.value, 3.0, 'PlaybackRate AudioParam must be locked to targetSpeed (3.0x)');

  // 4. Test applySpeed input validation
  controller.setSpeed('2.5');
  assert.strictEqual(controller.getSpeed(), 2.5, 'String "2.5" should be parsed to 2.5');

  controller.setSpeed(null);
  assert.strictEqual(controller.getSpeed(), 2.5, 'Null speed input should be safely rejected without mutating speed');

  controller.setSpeed(undefined);
  assert.strictEqual(controller.getSpeed(), 2.5, 'Undefined speed input should be safely rejected');

  controller.setSpeed(NaN);
  assert.strictEqual(controller.getSpeed(), 2.5, 'NaN speed input should be safely rejected');

  controller.setSpeed(Infinity);
  assert.strictEqual(controller.getSpeed(), 2.5, 'Infinity speed input should be safely rejected');
});
