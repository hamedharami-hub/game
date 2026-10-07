import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectLandmarks,
  renderLandMap,
  renderLandMapMarkup,
  type LandMapLandmark,
} from './land-map.ts';

const landmarks: LandMapLandmark[] = [
  { id: 'garden', name: 'باغ مشترک', x: -2, z: 14, icon: '❋', color: '#e6a9c2' },
  { id: 'greenhouse', name: 'گلخانهٔ پیوند', x: 20, z: 14, icon: '✿', color: '#91cdb3' },
  { id: 'grove', name: 'بیشهٔ جویبار', x: -21, z: 19, icon: '♤', color: '#8dc9bd' },
];

test('world x/z positions project proportionally with positive z moving down', () => {
  const projected = projectLandmarks([
    { id: 'origin', name: 'Origin', x: 0, z: 0 },
    { id: 'east', name: 'East', x: 20, z: 0 },
    { id: 'south', name: 'South', x: 0, z: 10 },
  ], { width: 100, height: 100, padding: 10 });

  const [origin, east, south] = projected;
  assert.equal(origin.mapX, 10);
  assert.equal(east.mapX - origin.mapX, 80);
  assert.equal(south.mapY - origin.mapY, 40);
  assert.equal(origin.mapY, 30);
});

test('projection handles one landmark and fixed world bounds without NaN coordinates', () => {
  const single = projectLandmarks([{ id: 'only', name: 'Only', x: 4, z: -3 }]);
  assert.equal(single.length, 1);
  assert.ok(Number.isFinite(single[0].mapX));
  assert.ok(Number.isFinite(single[0].mapY));

  const fixed = projectLandmarks(landmarks, {
    width: 200,
    height: 160,
    padding: 20,
    worldBounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
  });
  assert.ok(fixed.every(point => point.mapX >= 20 && point.mapX <= 180));
  assert.ok(fixed.every(point => point.mapY >= 20 && point.mapY <= 140));
});

test('markup exposes one connected world and keyboard-operable landmark controls', () => {
  const html = renderLandMapMarkup(landmarks, {
    label: 'نقشهٔ دشت',
    selectedId: 'grove',
    playerPosition: { x: -20, z: 18 },
  });

  assert.match(html, /یک سرزمین پیوسته/);
  assert.match(html, /class="land-map__land"/);
  assert.equal((html.match(/class="land-map__land"/g) ?? []).length, 1);
  assert.match(html, /data-landmark-id="grove" role="button" tabindex="0"[^>]*aria-pressed="true"/);
  assert.match(html, /<button[^>]*data-landmark-id="garden"[^>]*aria-pressed="false"/);
  assert.match(html, /data-player-marker="true"[^>]*aria-label="موقعیت بازیکن: x -20، z 18"/);
  assert.match(html, /aria-live="polite"/);
});

test('landmark text and identifiers are escaped and unsupported colors are replaced', () => {
  const html = renderLandMapMarkup([{
    id: 'odd" data-x="1',
    name: '<script>alert(1)</script>',
    x: 0,
    z: 0,
    icon: '<svg>',
    color: 'url(javascript:alert(1))',
    description: 'say "hello" & goodbye',
  }]);

  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.match(html, /odd&quot; data-x=&quot;1/);
  assert.match(html, /&lt;svg&gt;/);
  assert.match(html, /title="say &quot;hello&quot; &amp; goodbye"/);
  assert.match(html, /fill="#c35b79"/);
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /fill="url\(/);
});

class FakeElement {
  readonly attributes = new Map<string, string>();
  child: FakeElement | null = null;
  textContent = '';
  readonly tagName: string;

  constructor(tagName: string, attributes: Record<string, string> = {}) {
    this.tagName = tagName;
    for (const [name, value] of Object.entries(attributes)) this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null { return this.attributes.get(name) ?? null; }
  setAttribute(name: string, value: string): void { this.attributes.set(name, value); }
  closest(_selector: string): FakeElement { return this; }
  querySelector(_selector: string): FakeElement | null { return this.child; }
}

class FakeContainer {
  private markup = '';
  readonly controls = [
    new FakeElement('BUTTON', { 'data-landmark-id': 'garden', 'aria-pressed': 'false' }),
    new FakeElement('G', { 'data-landmark-id': 'greenhouse', 'aria-pressed': 'false' }),
  ];
  readonly status = new FakeElement('P');
  readonly playerMarker = new FakeElement('G');
  readonly listeners = new Map<string, EventListener>();

  constructor() { this.playerMarker.child = new FakeElement('PATH'); }
  get innerHTML(): string { return this.markup; }
  set innerHTML(value: string) { this.markup = value; }
  addEventListener(type: string, listener: EventListener): void { this.listeners.set(type, listener); }
  removeEventListener(type: string): void { this.listeners.delete(type); }
  querySelectorAll<T extends Element>(_selector: string): NodeListOf<T> {
    return this.controls as unknown as NodeListOf<T>;
  }
  querySelector<T extends Element>(selector: string): T | null {
    if (selector.includes('data-player-marker')) return this.playerMarker as unknown as T;
    if (selector.includes('data-land-map-status')) return this.status as unknown as T;
    return null;
  }
  dispatch(type: string, event: object): void {
    this.listeners.get(type)?.(event as Event);
  }
}

test('selection works from pointer and keyboard controls; player updates do not rebuild the map', () => {
  const container = new FakeContainer();
  const selected: LandMapLandmark[] = [];
  const map = renderLandMap(
    container as unknown as HTMLElement,
    landmarks,
    landmark => selected.push(landmark),
    { selectedId: 'garden', playerPosition: { x: 0, z: 14 } },
  );

  container.dispatch('click', { target: container.controls[0] });
  assert.equal(selected[0], landmarks[0], 'callback receives the original input record');
  assert.equal(container.controls[0].getAttribute('aria-pressed'), 'true');
  assert.equal(container.controls[1].getAttribute('aria-pressed'), 'false');
  assert.match(container.status.textContent, /باغ مشترک/);

  let prevented = false;
  container.dispatch('keydown', {
    target: container.controls[1],
    key: ' ',
    preventDefault() { prevented = true; },
  });
  assert.equal(prevented, true);
  assert.equal(selected[1], landmarks[1]);
  assert.equal(container.controls[1].getAttribute('aria-pressed'), 'true');

  const originalMarkup = container.innerHTML;
  map.setPlayerPosition({ x: 500, z: -500 });
  assert.equal(container.innerHTML, originalMarkup, 'player tracking keeps the mounted controls in place');
  assert.equal(container.playerMarker.getAttribute('aria-hidden'), 'false');
  assert.match(container.playerMarker.getAttribute('aria-label') ?? '', /x 500، z -500، بیرون از قاب/);
  assert.match(container.playerMarker.getAttribute('transform') ?? '', /translate\(246 42\)/);
  assert.equal(container.playerMarker.child?.getAttribute('display'), 'inline');

  map.setPlayerPosition(null);
  assert.equal(container.playerMarker.getAttribute('display'), 'none');
  map.destroy();
  assert.equal(container.innerHTML, '');
  assert.equal(container.listeners.size, 0);
});
