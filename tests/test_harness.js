/**
 * AIR10 Lightweight Standalone DOM & Browser Harness
 * Allows complete deterministic execution of extension modules in pure Node.js without network dependencies.
 */
class DOMTokenList extends Set {
  add(token) { super.add(token); }
  remove(token) { super.delete(token); }
  contains(token) { return super.has(token); }
}

class MockElement {
  constructor(tagName, attributes = {}, text = '') {
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.children = [];
    this.parentElement = null;
    this.textContent = text;
    this._innerText = text;
    this.classList = new DOMTokenList((attributes.class || '').split(/\s+/).filter(Boolean));
    this.listeners = {};
    this.style = {};
    this.checked = attributes.checked === 'true' || attributes.checked === true;
    this.disabled = attributes.disabled !== undefined;
    this.value = attributes.value || '';
  }

  get innerText() {
    if (this._innerText) return this._innerText;
    return this.children.map(c => c.innerText).join(' ').trim();
  }

  set innerText(val) {
    this._innerText = val;
    this.textContent = val;
  }

  getAttribute(name) {
    if (name === 'class') return Array.from(this.classList).join(' ') || null;
    return this.attributes[name] !== undefined ? this.attributes[name] : null;
  }

  setAttribute(name, val) {
    this.attributes[name] = String(val);
    if (name === 'class') {
      this.classList = new DOMTokenList(String(val).split(/\s+/).filter(Boolean));
    }
    if (name === 'aria-checked') {
      this.style = {};
      this.checked = (val === 'true');
    }
    if (name === 'disabled') {
      this.disabled = (val !== 'false' && val !== false);
    }
  }

  removeAttribute(name) {
    delete this.attributes[name];
    if (name === 'disabled') this.disabled = false;
    if (name === 'aria-checked') this.checked = false;
    if (name === 'class') this.classList.clear();
  }

  hasAttribute(name) {
    return this.attributes[name] !== undefined;
  }

  contains(other) {
    if (!other) return false;
    let cur = other.parentElement;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentElement;
    }
    return false;
  }

  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  removeChild(child) {
    const idx = this.children.indexOf(child);
    if (idx !== -1) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
    return child;
  }

  addEventListener(type, cb) {
    this.listeners[type] = this.listeners[type] || [];
    this.listeners[type].push(cb);
  }

  dispatchEvent(evt) {
    evt.target = this;
    const cbs = this.listeners[evt.type] || [];
    cbs.forEach(cb => cb(evt));
    return true;
  }

  click() {
    if (this.disabled || this.getAttribute('aria-disabled') === 'true') {
      return false; // Disabled elements cannot be clicked in genuine DOM
    }
    if (this.getAttribute('role') === 'radio' || this.tagName === 'INPUT') {
      this.setAttribute('aria-checked', 'true');
      this.style = {};
      this.checked = true;
      this.classList.add('selected');
      // Deselect siblings in radiogroup
      if (this.parentElement) {
        this.parentElement.querySelectorAll('[role="radio"]').forEach(sibling => {
          if (sibling !== this) {
            sibling.setAttribute('aria-checked', 'false');
            sibling.checked = false;
            sibling.classList.remove('selected');
          }
        });
      }
    }
    this.dispatchEvent({ type: 'click', target: this, isTrusted: false });
  }

  scrollIntoView() {}
  focus() {}
  getClientRects() { return [{ width: 100, height: 20 }]; }
  get offsetWidth() { return 100; }
  get offsetHeight() { return 20; }

  matches(sel) {
    if (!sel) return false;
    if (sel.includes(',')) {
      return sel.split(',').some(part => this.matches(part.trim()));
    }
    sel = sel.trim();
    if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
    if (sel.startsWith('#')) return this.attributes.id === sel.slice(1);
    if (sel.startsWith('[') && sel.endsWith(']')) {
      const inside = sel.slice(1, -1);
      if (inside.includes('=')) {
        let [attr, val] = inside.split('=');
        val = val.replace(/["\']/g, '');
        let op = '=';
        if (attr.endsWith('*')) { attr = attr.slice(0, -1); op = '*='; }
        const cur = this.getAttribute(attr);
        if (cur === null) return false;
        if (op === '*=') return cur.toLowerCase().includes(val.toLowerCase());
        return cur.toLowerCase() === val.toLowerCase();
      } else {
        return this.hasAttribute(inside);
      }
    }
    return this.tagName.toLowerCase() === sel.toLowerCase();
  }

  closest(sel) {
    let cur = this;
    while (cur) {
      if (cur.matches && cur.matches(sel)) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  querySelectorAll(sel) {
    const results = [];
    const parts = sel.split(',').map(s => s.trim());
    const walk = (node) => {
      for (const child of node.children) {
        if (parts.some(p => child.matches(p))) {
          results.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return results;
  }

  querySelector(sel) {
    const all = this.querySelectorAll(sel);
    return all.length > 0 ? all[0] : null;
  }
}

// Simple HTML to MockElement parser
function parseHtml(html) {
  const root = new MockElement('root');
  let current = root;
  const tagRegex = /<(\/)?([a-zA-Z0-9]+)([^>]*)>|([^<]+)/g;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    const [full, isClose, tagName, attrStr, text] = match;
    if (text) {
      const clean = text.trim();
      if (clean && current !== root) {
        current.innerText = (current.innerText ? current.innerText + ' ' : '') + clean;
      }
    } else if (tagName) {
      if (isClose) {
        if (current.parentElement) current = current.parentElement;
      } else {
        const attrs = {};
        const attrRegex = /([a-zA-Z0-9_-]+)(?:=["\']([^"\']*)["\'])?/g;
        let aMatch;
        while ((aMatch = attrRegex.exec(attrStr)) !== null) {
          attrs[aMatch[1]] = aMatch[2] !== undefined ? aMatch[2] : true;
        }
        const el = new MockElement(tagName, attrs);
        current.appendChild(el);
        const isSelfClosing = full.endsWith('/>') || ['INPUT', 'IMG', 'BR', 'HR'].includes(tagName.toUpperCase());
        if (!isSelfClosing) {
          current = el;
        }
      }
    }
  }
  return root;
}

function setupMockBrowser(htmlFixture = '') {
  const root = parseHtml(htmlFixture);
  const body = root.querySelector('body') || root;
  const docElement = root.querySelector('html') || root;

  const listeners = {};
  const storage = {};

  const windowMock = {
    document: {
      documentElement: docElement,
      body: body,
      readyState: 'complete',
      querySelector: (sel) => root.querySelector(sel),
      querySelectorAll: (sel) => root.querySelectorAll(sel),
      getElementById: (id) => {
        const found = root.querySelectorAll('*').find(el => el.attributes.id === id);
        return found || null;
      },
      createElement: (tag) => new MockElement(tag),
      addEventListener: (type, cb) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(cb);
      },
      dispatchEvent: (evt) => {
        const cbs = listeners[evt.type] || [];
        cbs.forEach(cb => cb(evt));
      },
      activeElement: null
    },
    location: {
      href: 'https://gemini.google.com/students',
      pathname: '/students',
      hostname: 'gemini.google.com'
    },
    localStorage: {
      getItem: (k) => storage[k] || null,
      setItem: (k, v) => { storage[k] = String(v); },
      removeItem: (k) => { delete storage[k]; }
    },
    addEventListener: (type, cb) => {
      listeners[type] = listeners[type] || [];
      listeners[type].push(cb);
    },
    removeEventListener: (type, cb) => {
      if (!listeners[type]) return;
      listeners[type] = listeners[type].filter(f => f !== cb);
    },
    dispatchEvent: (evt) => {
      const cbs = listeners[evt.type] || [];
      cbs.forEach(cb => cb(evt));
    },
    postMessage: (data) => {
      const evt = { data, origin: 'https://gemini.google.com' };
      const cbs = listeners['message'] || [];
      cbs.forEach(cb => cb(evt));
    },
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    MutationObserver: class MockMutationObserver {
      constructor(cb) { this.cb = cb; }
      observe() {}
      disconnect() {}
    },
    AudioBufferSourceNode: function() {},
    HTMLMediaElement: function() {},
    HTMLAudioElement: function() {}
  };

  windowMock.window = windowMock;
  global.window = windowMock;
  global.document = windowMock.document;
  global.location = windowMock.location;
  global.localStorage = windowMock.localStorage;
  global.CustomEvent = windowMock.CustomEvent;
  global.MutationObserver = windowMock.MutationObserver;

  return windowMock;
}


const path = require('path');
function loadModules() {
  [
    '../modules/audio-accelerator.js',
    '../modules/telemetry.js',
    '../modules/gemini-route-observer.js',
    '../modules/gemini-state-parser.js',
    '../modules/chrome-local-ai.js',
    '../modules/gemini-study-tools.js'
  ].forEach(p => {
    try {
      const full = path.resolve(__dirname, p);
      delete require.cache[full];
      require(full);
    } catch(e) {}
  });
}

module.exports = { MockElement, parseHtml, setupMockBrowser, loadModules };

