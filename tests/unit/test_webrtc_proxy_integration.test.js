const test = require('node:test');
const assert = require('node:assert/strict');
const { setupMockBrowser } = require('../test_harness');

test('AIR10 WebRTC & Realtime Catch-Up Audio Proxy Integration Suite', async (t) => {
  await t.test('WebRTC Prototype Interception: ontrack and addEventListener capture audio tracks and mute host', async () => {
    const browser = setupMockBrowser();

    let createdMediaStreamSources = [];
    let audioWorkletNodes = [];

    class MockAudioParam {
      constructor(val = 1.0) { this.value = val; }
      setValueAtTime(v) { this.value = v; }
    }

    class MockAudioContext {
      constructor() {
        this.sampleRate = 48000;
        this.state = 'running';
        this.destination = {};
        this.audioWorklet = {
          addModule: async (url) => true
        };
      }
      createMediaStreamSource(stream) {
        const node = {
          stream,
          connect: (dest) => { node.destination = dest; }
        };
        createdMediaStreamSources.push(node);
        return node;
      }
      createBufferSource() {
        return {
          playbackRate: new MockAudioParam(1.0),
          start: () => {},
          addEventListener: () => {}
        };
      }
    }

    class MockAudioWorkletNode {
      constructor(ctx, name, options) {
        this.context = ctx;
        this.name = name;
        this.options = options;
        this.port = {
          postMessage: (data) => { this.lastMessage = data; },
          onmessage: null
        };
        this.connect = (dest) => { this.destination = dest; };
        audioWorkletNodes.push(this);
      }
    }

    class MockMediaStreamTrack {
      constructor(kind = 'audio') {
        this.kind = kind;
        this.id = 'track_' + Math.random().toString(36).substr(2, 6);
        this.enabled = true;
        this.listeners = {};
      }
      addEventListener(type, cb) {
        this.listeners[type] = this.listeners[type] || [];
        this.listeners[type].push(cb);
      }
      dispatchEvent(evt) {
        if (this.listeners[evt.type]) {
          this.listeners[evt.type].forEach(cb => cb(evt));
        }
      }
    }

    class MockMediaStream {
      constructor(tracks = []) {
        this._tracks = tracks;
      }
      getAudioTracks() {
        return this._tracks.filter(t => t.kind === 'audio');
      }
      getTracks() {
        return this._tracks;
      }
    }

    class MockRTCPeerConnection {
      constructor() {
        this.listeners = {};
      }
      addEventListener(type, listener, options) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(listener);
      }
      dispatchEvent(event) {
        if (this.listeners[event.type]) {
          this.listeners[event.type].forEach(l => l.call(this, event));
        }
        if (event.type === 'track' && typeof this.ontrack === 'function') {
          this.ontrack.call(this, event);
        }
      }
    }

    // Attach mocks to global browser environment
    global.AudioContext = MockAudioContext;
    global.webkitAudioContext = MockAudioContext;
    global.AudioWorkletNode = MockAudioWorkletNode;
    global.MediaStream = MockMediaStream;
    global.MediaStreamTrack = MockMediaStreamTrack;
    global.RTCPeerConnection = MockRTCPeerConnection;
    global.URL = { createObjectURL: () => 'blob:mock-worklet' };
    global.Blob = class { constructor() {} };

    window.AudioContext = MockAudioContext;
    window.webkitAudioContext = MockAudioContext;
    window.AudioWorkletNode = MockAudioWorkletNode;
    window.MediaStream = MockMediaStream;
    window.MediaStreamTrack = MockMediaStreamTrack;
    window.RTCPeerConnection = MockRTCPeerConnection;
    window.location.hostname = 'chatgpt.com';
    window.localStorage.setItem('air10_ai_speed', '2.5');

    // Ensure clean re-import
    delete window.__AIR10_AUDIO_ACCELERATOR__;
    delete require.cache[require.resolve('../../modules/audio-accelerator.js')];
    require('../../modules/audio-accelerator.js');

    // 1. Verify global handle is available
    assert.ok(window.__AIR10_CATCHUP_PROXY__, '__AIR10_CATCHUP_PROXY__ must be exposed on window');
    assert.strictEqual(window.__AIR10_CATCHUP_PROXY__.getStatus().targetSpeed, 2.5);

    // 2. Simulate WebRTC incoming track via addEventListener
    const pc = new window.RTCPeerConnection();
    const remoteAudioTrack = new window.MediaStreamTrack('audio');
    const remoteStream = new window.MediaStream([remoteAudioTrack]);

    let appReceivedEvent = null;
    pc.addEventListener('track', (e) => {
      appReceivedEvent = e;
    });

    // Dispatch remote WebRTC track event
    pc.dispatchEvent({ type: 'track', track: remoteAudioTrack, streams: [remoteStream] });

    // Verify application still received the track event
    assert.ok(appReceivedEvent !== null, 'Host application listener must receive track event');
    assert.strictEqual(appReceivedEvent.track, remoteAudioTrack);

    // Verify AIR10 intercepted and flagged the track
    assert.strictEqual(remoteAudioTrack.__air10_proxied, true, 'Audio track must be flagged as __air10_proxied');

    // 3. Simulate host application attaching remote stream to an <audio> element
    const hostAudioEl = window.document.createElement('audio');
    hostAudioEl.srcObject = remoteStream;

    // Verify host audio element was automatically MUTED to prevent unaccelerated duplicate sound
    assert.strictEqual(hostAudioEl.muted, true, 'Host audio element must be muted by Catch-Up Proxy');
    assert.strictEqual(hostAudioEl.volume, 0, 'Host audio element volume must be set to 0');
    assert.strictEqual(hostAudioEl.__air10_host_muted, true, '__air10_host_muted flag must be true');

    // 4. Host Unmuting Defense: simulate host web app trying to unmute and increase volume
    hostAudioEl.muted = false;
    hostAudioEl.volume = 1.0;
    assert.strictEqual(hostAudioEl.muted, true, 'Host audio element must remain locked in muted state');
    assert.strictEqual(hostAudioEl.volume, 0, 'Host audio element volume must remain locked to 0');

    // 5. Retroactive Muting Test: media element attached before track is proxied
    const preExistingEl = window.document.createElement('audio');
    const newTrack = new window.MediaStreamTrack('audio');
    const preStream = new window.MediaStream([newTrack]);
    preExistingEl.srcObject = preStream;
    window.document.body.appendChild(preExistingEl);

    // Track is now proxied after element already had srcObject
    pc.dispatchEvent({ type: 'track', track: newTrack, streams: [preStream] });
    assert.strictEqual(newTrack.__air10_proxied, true, 'Pre-existing track must be proxied');
    assert.strictEqual(preExistingEl.muted, true, 'Pre-existing element must be retroactively muted');
    assert.strictEqual(preExistingEl.volume, 0, 'Pre-existing element volume must be retroactively set to 0');

    // 6. Track Ended Cleanup: wait for AudioWorkletNode attachment then verify disconnection on ended
    await new Promise(r => setTimeout(r, 20));
    let disconnectCalled = false;
    assert.ok(newTrack.__air10_worklet_node, 'AudioWorkletNode must be attached to track');
    newTrack.__air10_worklet_node.disconnect = () => { disconnectCalled = true; };
    newTrack.dispatchEvent({ type: 'ended' });
    assert.strictEqual(disconnectCalled, true, 'AudioWorkletNode must be disconnected when track ends');

    // 7. Test speed change propagation to Catch-Up proxy
    window.__AIR10_CATCHUP_PROXY__.setSpeed(3.0);
    assert.strictEqual(window.__AIR10_CATCHUP_PROXY__.getStatus().targetSpeed, 3.0);
  });
});
