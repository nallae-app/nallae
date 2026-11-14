import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../../web/app.js', import.meta.url), 'utf8');
const guard = app.split('/* MAP_GESTURE_GUARD_START */')[1]?.split('/* MAP_GESTURE_GUARD_END */')[0];
assert.ok(guard, 'map gesture guard is present in the app initialization');

function fixture() {
  const listeners = new Map(), windowListeners = new Map();
  const surface = { contains: node => node?.scope === 'map' };
  const register = store => (type, fn, options) => {
    if (!store.has(type)) store.set(type, []);
    store.get(type).push({ fn, options });
  };
  const document = { hidden: false, getElementById: () => surface, addEventListener: register(listeners) };
  const window = { addEventListener: register(windowListeners) };
  vm.runInNewContext(guard, { document, window });
  function target(scope, { editable = false, control = false } = {}) {
    return { nodeType: 1, scope,
      closest(selector) {
        if (selector.startsWith('input,')) return editable ? this : null;
        if (selector.startsWith('.leaflet-control')) return control ? this : null;
        return ['header', 'panel'].includes(scope) ? this : null;
      }
    };
  }
  function emit(type, targets = [], eventTarget = targets[0], cancelable = true) {
    const event = { type, target: eventTarget, touches: targets.map((node, identifier) => ({ target: node, identifier })),
      cancelable, defaultPrevented: false, preventionCalls: 0,
      preventDefault() { this.defaultPrevented = true; this.preventionCalls++; },
      stopPropagation() { throw new Error('Map guard must not swallow Leaflet events'); }
    };
    for (const { fn } of listeners.get(type) || []) fn(event);
    return event;
  }
  return { target, emit, listeners, document, windowListeners };
}

test('map-only pinch cancels browser defaults without stopping propagation to Leaflet', () => {
  const f = fixture(), a = f.target('map'), b = f.target('map');
  assert.equal(f.emit('touchstart', [a]).defaultPrevented, false);
  assert.equal(f.emit('touchstart', [a, b]).defaultPrevented, true);
  assert.equal(f.emit('touchmove', [a, b]).defaultPrevented, true);
  for (const type of ['touchstart', 'touchmove', 'gesturestart', 'gesturechange']) {
    assert.equal(f.listeners.get(type)[0].options.capture, true);
    assert.equal(f.listeners.get(type)[0].options.passive, false);
  }
  assert.equal(f.listeners.has('wheel'), false);
  assert.equal(f.listeners.has('keydown'), false);
});

test('cross-target map/header and header/map gestures are owned, but ordinary app page zoom is preserved', () => {
  for (const reverse of [false, true]) {
    const f = fixture(), map = f.target('map'), header = f.target('header');
    const targets = reverse ? [header, map] : [map, header];
    f.emit('touchstart', targets.slice(0, 1));
    assert.equal(f.emit('touchstart', targets).defaultPrevented, true);
    assert.equal(f.emit('gesturechange', [], header).defaultPrevented, true);
  }
  const f = fixture(), header = f.target('header'), panel = f.target('panel');
  assert.equal(f.emit('touchstart', [header, panel]).defaultPrevented, false);
  assert.equal(f.emit('gesturestart', [], header).defaultPrevented, false);
});

test('input editing, external content, popup controls and one-finger sheet scroll keep their defaults', () => {
  const f = fixture(), map = f.target('map'), input = f.target('panel', { editable: true });
  assert.equal(f.emit('touchstart', [map, input]).defaultPrevented, false);
  assert.equal(f.emit('gesturestart', [], input).defaultPrevented, false);
  assert.equal(f.emit('touchstart', [map, f.target('outside')]).defaultPrevented, false);
  assert.equal(f.emit('touchmove', [f.target('panel')]).defaultPrevented, false);
  const popup = f.target('map', { control: true });
  assert.equal(f.emit('touchstart', [popup, popup]).defaultPrevented, false);
});

test('Safari waits for both actual touch origins and releases ownership afterwards', () => {
  const f = fixture(), map = f.target('map'), header = f.target('header');
  f.emit('touchstart', [map]);
  assert.equal(f.emit('gesturestart', [], map).defaultPrevented, false);
  f.emit('touchstart', [map, header]);
  assert.equal(f.emit('gesturechange', [], header).defaultPrevented, true);
  assert.equal(f.emit('gestureend', [], header).defaultPrevented, true);
  assert.equal(f.emit('gesturechange', [], header).defaultPrevented, false);
  f.emit('touchstart', [map, header]);
  f.emit('touchend', []);
  assert.equal(f.emit('gesturechange', [], header).defaultPrevented, false);
});

test('an unknown second contact is never invented when it later belongs to an input', () => {
  const f = fixture(), map = f.target('map'), input = f.target('panel', { editable: true });
  f.emit('touchstart', [map]);
  assert.equal(f.emit('gesturestart', [], map).defaultPrevented, false);
  assert.equal(f.emit('touchstart', [map, input]).defaultPrevented, false);
  assert.equal(f.emit('gesturechange', [], input).defaultPrevented, false);
});

test('cancel, backgrounding and input handoff cannot leave the next browser gesture blocked', () => {
  for (const reset of ['cancel', 'blur', 'hidden', 'input']) {
    const f = fixture(), map = f.target('map'), header = f.target('header');
    f.emit('touchstart', [map, header]);
    if (reset === 'cancel') f.emit('touchcancel');
    if (reset === 'blur') f.windowListeners.get('blur')[0].fn();
    if (reset === 'hidden') { f.document.hidden = true; f.emit('visibilitychange'); }
    if (reset === 'input') f.emit('gesturechange', [], f.target('panel', { editable: true }));
    assert.equal(f.emit('gesturechange', [], header).defaultPrevented, false, reset);
  }
});

test('non-cancelable events are observed without attempting preventDefault', () => {
  const f = fixture(), map = f.target('map');
  assert.equal(f.emit('touchstart', [map, map], map, false).preventionCalls, 0);
  assert.equal(f.emit('gesturechange', [], map, false).preventionCalls, 0);
});
