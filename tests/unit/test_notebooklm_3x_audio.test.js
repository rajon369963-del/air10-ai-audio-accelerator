const test = require('node:test');
const assert = require('node:assert');
const { setupMockBrowser } = require('../test_harness');

test('NotebookLM 3x Audio Acceleration, Shadow DOM, and Ratechange Watchdog', async () => {
  const win = setupMockBrowser();

  // Reset accelerator flag for fresh initialization
  delete win.__AIR10_AUDIO_ACCELERATOR__;

  // Mock Element.prototype.attachShadow
  win.Element = class MockElementClass {};
  win.Element.prototype = {};
  win.Element.prototype.attachShadow = function(init) {
    const listeners = {};
    const shadowRoot = {
      nodeType: 11, // Node.DOCUMENT_FRAGMENT_NODE
      childNodes: [],
      children: [],
      addEventListener: (type, cb) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(cb);
      },
      dispatchEvent: (evt) => {
        const cbs = listeners[evt.type] || [];
        cbs.forEach(cb => cb(evt));
      },
      querySelectorAll: (sel) => {
        return shadowRoot.children.filter(c => c.tagName === sel.toUpperCase());
      },
      appendChild: (c) => {
        shadowRoot.children.push(c);
        shadowRoot.childNodes.push(c);
        return c;
      }
    };
    this.shadowRoot = shadowRoot;
    return shadowRoot;
  };
  global.Element = win.Element;

  // Mock Audio constructor
  win.Audio = function() {
    this.tagName = 'AUDIO';
    this.playbackRate = 1.0;
    this.defaultPlaybackRate = 1.0;
    this.preservesPitch = false;
    this.listeners = {};
    this.addEventListener = function(type, cb) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(cb);
    };
    this.dispatchEvent = function(evt) {
      evt.target = this;
      (this.listeners[evt.type] || []).forEach(cb => cb(evt));
    };
  };
  global.Audio = win.Audio;

  delete require.cache[require.resolve('../../modules/audio-accelerator.js')];
  require('../../modules/audio-accelerator.js');

  const controller = win.__AIR10_AUDIO__;
  assert.ok(controller, 'Audio controller must be initialized');

  // 1. Verify locking to 3.0x for NotebookLM podcast
  controller.setSpeed(3.0);
  assert.strictEqual(controller.getSpeed(), 3.0, 'Speed must be locked to 3.0x');
  assert.strictEqual(win.localStorage.getItem('air10_ai_speed'), '3', 'localStorage must persist 3.0x speed');

  // 2. Verify stepping controls (+/- 0.25x)
  controller.stepSpeed(-0.25);
  assert.strictEqual(controller.getSpeed(), 2.75, 'Step down by 0.25x should result in 2.75x');

  controller.stepSpeed(0.25);
  assert.strictEqual(controller.getSpeed(), 3.0, 'Step up by 0.25x should result in 3.0x');

  // 3. Verify hotkey '[' and ']' stepping
  win.dispatchEvent({
    type: 'keydown',
    key: '[',
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(controller.getSpeed(), 2.75, "Key '[' must step down by 0.25x");

  win.dispatchEvent({
    type: 'keydown',
    key: ']',
    preventDefault: () => {},
    stopPropagation: () => {}
  });
  assert.strictEqual(controller.getSpeed(), 3.0, "Key ']' must step up back to 3.0x");

  // 4. Test Mock Audio Element created via new Audio()
  const podcastAudio = new win.Audio();
  assert.strictEqual(podcastAudio.playbackRate, 3.0, 'new Audio() should immediately have 3.0x playbackRate');
  assert.strictEqual(podcastAudio.defaultPlaybackRate, 3.0, 'defaultPlaybackRate should be 3.0x');
  assert.strictEqual(podcastAudio.preservesPitch, true, 'preservesPitch should be true');

  // 5. Test Ratechange Watchdog: if web app resets playbackRate to 1.0
  podcastAudio.playbackRate = 1.0;
  podcastAudio.dispatchEvent({ type: 'ratechange' });

  // Give microtask time to re-assert
  await new Promise(resolve => setImmediate(resolve));
  assert.strictEqual(podcastAudio.playbackRate, 3.0, 'Watchdog must restore 3.0x after ratechange reset attempt');

  // 6. Test Shadow DOM Audio inside Web Component (NotebookLM Audio Overview container)
  const hostComponent = new win.Element();
  const shadow = hostComponent.attachShadow({ mode: 'open' });
  const shadowAudio = {
    tagName: 'AUDIO',
    playbackRate: 1.0,
    defaultPlaybackRate: 1.0,
    preservesPitch: false,
    listeners: {},
    addEventListener: function(type, cb) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(cb);
    },
    dispatchEvent: function(evt) {
      evt.target = this;
      (this.listeners[evt.type] || []).forEach(cb => cb(evt));
    }
  };
  shadow.appendChild(shadowAudio);

  // Trigger media event to simulate playback in shadow DOM
  win.document.dispatchEvent({
    type: 'play',
    target: shadowAudio
  });

  assert.strictEqual(shadowAudio.playbackRate, 3.0, 'Shadow DOM audio element must receive 3.0x speed');
  assert.strictEqual(shadowAudio.preservesPitch, true, 'Shadow DOM audio must have pitch preservation enabled');

  // 7. Test Closed Shadow DOM Audio piercing
  const closedHost = new win.Element();
  const closedShadow = closedHost.attachShadow({ mode: 'closed' });
  closedHost.shadowRoot = null; // In closed mode, host.shadowRoot is null!
  const closedAudio = {
    tagName: 'AUDIO',
    playbackRate: 1.0,
    defaultPlaybackRate: 1.0,
    preservesPitch: false,
    listeners: {},
    addEventListener: function(type, cb) {
      this.listeners[type] = this.listeners[type] || [];
      this.listeners[type].push(cb);
    },
    dispatchEvent: function(evt) {
      evt.target = this;
      (this.listeners[evt.type] || []).forEach(cb => cb(evt));
    }
  };
  closedShadow.appendChild(closedAudio);

  // Trigger media event to simulate playback in closed shadow DOM
  closedShadow.dispatchEvent({
    type: 'play',
    target: closedAudio
  });

  assert.strictEqual(closedAudio.playbackRate, 3.0, 'Closed Shadow DOM audio element must receive 3.0x speed');
  assert.strictEqual(closedAudio.preservesPitch, true, 'Closed Shadow DOM audio must have pitch preservation enabled');

  // 8. Test Document.createElement('audio') hook
  const createdAudio = win.document.createElement('audio');
  assert.strictEqual(createdAudio.playbackRate, 3.0, "createElement('audio') must have 3.0x speed applied");
  assert.strictEqual(createdAudio.preservesPitch, true, "createElement('audio') must preserve pitch");
});
