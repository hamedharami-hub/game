import * as T from 'three';
import './style.css';
import { directionFrame } from './directions';
import { createGarden } from './garden';
import { sampleAmbience } from './ambience';
import {
  initialState, decodeSave, storageKey, growthStage, species, setAppearance, hairColors, outfits,
  placeLandscapePlacement, moveLandscapePlacement, removeLandscapePlacement,
  landscapeFootprintRadii, landscapeKinds, LANDSCAPE_PLACEMENT_CLEARANCE,
  type LandscapeKind, type LandscapePlacement, type HairColor, type Outfit,
} from './state';
import type { State } from './state';
import { lookAssets, diagonalAssets } from './appearance';
import { createWorld } from './world';
import { createAudioEngine, type AudioEngine } from './audio';
import { createVisualFXSystem, computeNightIntensity, calculateShadowParams, type VisualFXSystem } from './particles';
import {
  calculateSideBySideOffset,
  calculateFlightAltitude,
  calculateCameraFocusY,
  calculateBankingRoll,
  isCompanionIdle,
  computeHandPositions,
  isHandHoldDetached,
  calculateEmbraceTransform,
  planetElevation,
  adjustFlightAltitude,
  resolveObstacleCollision,
  projectAndSnapToLand,
  stepPlacementRotation,
  isPlacementClear,
  type ObstacleCircle,
  MIN_FLIGHT_ALTITUDE,
  MAX_FLIGHT_ALTITUDE,
  type FlightState,
} from './interactions';
import {
  triggerVignette,
  updateVignetteState,
  createVignetteState,
  type VignetteState,
} from './vignette';
import { createFaunaMeshGroup } from './fauna';

const audioEngine = createAudioEngine();
if (typeof window !== 'undefined') {
  (window as unknown as { audioEngine: AudioEngine }).audioEngine = audioEngine;
}

const gameSaveKey = storageKey(new URLSearchParams(location.search).get('profile'));
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main data-phase="morning" data-weather="clear">
  <div id="world" aria-label="سرزمین زندهٔ دوشاخ‌ها"></div>
  <header class="hud">
    <div class="brand"><span class="brand-mark" aria-hidden="true">✦</span><span>سرزمین دوشاخ‌ها<small>خانهٔ زندهٔ ما</small></span></div>
  <nav class="action-bar" aria-label="کارهای دشت">
    <button id="plant-action" class="glass" aria-label="کاشت گل">کاشت</button>
      <button id="build-action" class="glass" aria-label="ساخت‌وساز آزاد" aria-pressed="false">ساخت آزاد</button>
      <button id="people-action" class="glass" aria-label="دیدار با همراهان">همراه‌ها</button>
      <button id="flight-ascend-btn" class="glass flight-altitude-btn" aria-label="افزایش ارتفاع پرواز" hidden>▲ اوج</button>
      <button id="flight-descend-btn" class="glass flight-altitude-btn" aria-label="کاهش ارتفاع پرواز" hidden>▼ فرود</button>
      <button id="camera-view" class="glass" aria-pressed="false" aria-label="تغییر نمای دوربین">نمای باز</button>
    </nav>
  </header>
  <section id="build-palette" class="build-palette glass" role="region" aria-labelledby="build-palette-title" hidden>
    <div class="build-palette__heading">
      <h2 id="build-palette-title">ساخت در سراسر دشت</h2>
      <button id="finish-building" class="object-control" aria-label="پایان ساخت‌وساز">پایان</button>
    </div>
    <p class="build-palette__hint">گل‌های این فهرست تزئینی‌اند؛ گل‌های کاشتنی در باغچه می‌رویند. روی چمن بزن یا با جهت‌ها جابه‌جا کن؛ R بچرخان و Enter ثبت کن.</p>
    <label class="build-object-picker" for="landscape-object-select">
      <span>انتخاب سازه برای ویرایش</span>
      <select id="landscape-object-select" aria-describedby="placement-status">
        <option value="">سازه‌ای را انتخاب کن</option>
        <option value="main-garden">باغچهٔ اصلی</option>
      </select>
    </label>
    <div id="build-tools" class="build-palette__tools" role="group" aria-label="چیزهایی برای ساخت">
      <button class="build-tool" data-kind="tree" aria-pressed="false"><span class="build-tool__icon" aria-hidden="true">♧</span>درخت باغی</button>
      <button class="build-tool" data-kind="spirit-tree" aria-pressed="false"><span class="build-tool__icon" aria-hidden="true">✧</span>درخت روح</button>
      <button class="build-tool" data-kind="flower" aria-pressed="false"><span class="build-tool__icon" aria-hidden="true">✿</span>یک گل تزئینی</button>
      <button class="build-tool" data-kind="flower-clump" aria-pressed="false"><span class="build-tool__icon" aria-hidden="true">❀</span>گروه گل تزئینی</button>
      <button class="build-tool" data-kind="garden-bed" aria-pressed="false"><span class="build-tool__icon" aria-hidden="true">▦</span>باغچهٔ زندهٔ فعلی</button>
      <button class="build-tool" data-kind="cottage" aria-pressed="false"><span class="build-tool__icon" aria-hidden="true">⌂</span>خانهٔ باغی</button>
      <button class="build-tool" data-kind="cabin" aria-pressed="false"><span class="build-tool__icon" aria-hidden="true">⌂</span>کلبهٔ روستایی</button>
      <button class="build-tool" data-kind="gazebo" aria-pressed="false"><span class="build-tool__icon" aria-hidden="true">⌑</span>آلاچیق</button>
      <button class="build-tool" data-kind="wooden-bridge" aria-pressed="false"><span class="build-tool__icon" aria-hidden="true">⌁</span>پل چوبی</button>
      <button class="build-tool" data-kind="well" aria-pressed="false"><span class="build-tool__icon" aria-hidden="true">◉</span>چاه سنگی</button>
    </div>
    <p id="placement-status" class="build-palette__status" data-placement-state="idle" role="status" aria-live="polite">یک چیز را انتخاب کن تا پیش‌نمایش جای آن را ببینی.</p>
    <div class="object-controls">
      <button id="rotate-landscape-left" class="object-control" aria-label="چرخش ۱۵ درجه به چپ">↺ ۱۵°</button>
      <button id="rotate-landscape-right" class="object-control" aria-label="چرخش ۱۵ درجه به راست">↻ ۱۵°</button>
      <button id="remove-landscape" class="object-control object-control--remove" data-action="remove" aria-label="برداشتن سازهٔ انتخاب‌شده" disabled>برداشتن</button>
    </div>
  </section>
  <div id="placement-preview" class="placement-preview" data-placement-state="invalid" aria-hidden="true" hidden></div>
  <footer class="world-footer">
    <span id="ambient-status" role="status" aria-live="polite">باغ آمادهٔ کاشت و چیدمان است.</span>
    <button id="interact" class="primary" aria-label="صحبت با گوراستاخ" title="صحبت با گوراستاخ" disabled>سلام</button>
  </footer>
  <div id="overlay" hidden></div>
  <div id="romance-vignette" class="romance-vignette" aria-hidden="true"></div>
</main>`;
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
const gameRoot = document.querySelector<HTMLElement>('main')!;

let state: State = initialState();
try {
  const raw = localStorage.getItem(gameSaveKey);
  state = decodeSave(raw);
  if (!raw) {
    const profile = new URLSearchParams(location.search).get('profile');
    state.worldSeed = profile
      ? [...profile].reduce((hash, char) => (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0, 7) % 2147483646 + 1
      : crypto.getRandomValues(new Uint32Array(1))[0] % 2147483646 + 1;
  }
} catch { /* The garden remains playable when browser storage is unavailable. */ }

const status = $('ambient-status');
const overlay = $('overlay');
const buildPalette = $('build-palette');
const placementStatus = $('placement-status');
const placementMarker = $('placement-preview');
let reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const keys = new Set<string>();
let target: T.Vector3 | null = null;
let nearestCompanion = false;
let activeDialogReturn: HTMLElement | null = null;
let wideView = false;
let zoom = 1;
let elapsed = 0;
let socialBeat = 0;
type CompanionMoment = {
  kind: 'flower' | 'decoration';
  target: T.Vector3;
  emote: 'wave' | 'sit';
  status: string;
  expiresAt: number;
  startedAt?: number;
  arrivedAt?: number;
};
let queuedCompanionMoment: CompanionMoment | null = null;
let activeCompanionMoment: CompanionMoment | null = null;
const observedPlantStages = new Map(state.plants.map(plant => [plant.id, growthStage(plant)]));
let lastBloomCheck = 0;

function cancelCompanionMoments() {
  queuedCompanionMoment = null;
  activeCompanionMoment = null;
}

function queueCompanionMoment(kind: CompanionMoment['kind'], focus: T.Vector3, emote: CompanionMoment['emote'], message: string, standOff: number) {
  if (reducedMotion || queuedCompanionMoment || activeCompanionMoment) return;
  // Keep these small reactions local to the player; distant gardens do not run behavior off-screen.
  if (angel.position.distanceTo(focus) > 18) return;
  const approach = gor.position.clone().sub(focus).setY(0);
  if (approach.lengthSq() < .01) approach.set(1, 0, 0);
  approach.normalize().multiplyScalar(standOff);
  queuedCompanionMoment = {
    kind,
    target: focus.clone().add(approach),
    emote,
    status: message,
    expiresAt: performance.now() + 20000,
  };
}

function updateAutonomousCompanion(now: number, dt: number) {
  if (reducedMotion || !overlay.hidden || ownGarden.editing) return false;
  if (target || keys.size) {
    cancelCompanionMoments();
    return false;
  }
  if (queuedCompanionMoment) {
    if (now > queuedCompanionMoment.expiresAt) queuedCompanionMoment = null;
    else {
      queuedCompanionMoment.startedAt = now;
      activeCompanionMoment = queuedCompanionMoment;
      queuedCompanionMoment = null;
    }
  }
  const moment = activeCompanionMoment;
  if (!moment) return false;
  if (moment.arrivedAt !== undefined) {
    if (now - moment.arrivedAt > 2600) activeCompanionMoment = null;
    return true;
  }
  if (now - (moment.startedAt ?? now) > 9000) {
    activeCompanionMoment = null;
    return false;
  }
  const step = moment.target.clone().sub(gor.position).setY(0);
  const distance = step.length();
  if (distance < .24) {
    gor.position.copy(moment.target);
    moment.arrivedAt = now;
    gor.userData.emoteKind = moment.emote;
    gor.userData.emoteUntil = now + 2600;
    setStatus(moment.status);
    return true;
  }
  step.normalize();
  gor.position.addScaledVector(step, Math.min(distance, dt * 2.1));
  faceDirection(gor, step);
  return true;
}

function noticeFreshBlooms(now: number) {
  if (now - lastBloomCheck < 1000) return;
  lastBloomCheck = now;
  const present = new Set<string>();
  for (const plant of state.plants) {
    present.add(plant.id);
    const stage = growthStage(plant, now);
    const previous = observedPlantStages.get(plant.id);
    observedPlantStages.set(plant.id, stage);
    if (previous !== undefined && previous < 3 && stage === 3) {
      audioEngine.playBloomChime();
      const flower = plantWorldPosition(plant);
      queueCompanionMoment('flower', flower, 'wave', 'گوراستاخ کنار شکوفهٔ تازه مکث کرد.', 1.2);
    }
  }
  for (const id of observedPlantStages.keys()) if (!present.has(id)) observedPlantStages.delete(id);
}

function refreshAmbience() {
  const base = new T.Color('#a4cfb6');
  if (!state.plants.length) { ambienceTarget.copy(base); return; }
  const color = new T.Color(0, 0, 0);
  let weight = 0;
  for (const plant of state.plants) {
    const growth = .35 + .65 * (plant.boostMs > 0 ? 1 : Math.min(1, (Date.now() - plant.plantedAt) / (species[plant.species].minutes * 60000)));
    color.add(new T.Color(species[plant.species].color).multiplyScalar(growth));
    weight += growth;
  }
  color.multiplyScalar(1 / Math.max(weight, 1));
  ambienceTarget.copy(base).lerp(color, .22);
}

function save() {
  try { localStorage.setItem(gameSaveKey, JSON.stringify(state)); }
  catch { status.textContent = 'این نوبت روی همین دستگاه می‌ماند.'; }
  updateWorld();
  refreshAmbience();
}
function setStatus(message: string) { status.textContent = message; }

function closeDialog() {
  overlay.hidden = true;
  overlay.replaceChildren();
  keys.clear();
  activeDialogReturn?.focus();
  activeDialogReturn = null;
}
function dialog(title: string, body = '', actions = '', returnFocus?: HTMLElement) {
  target = null;
  keys.clear();
  activeDialogReturn = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  overlay.hidden = false;
  overlay.innerHTML = `<section class="dialog glass" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
    <h2 id="dialog-title">${title}</h2>
    ${body ? `<div class="dialog-body">${body}</div>` : ''}
    <div class="actions">${actions}<button id="close-dialog" aria-label="بستن">بستن</button></div>
  </section>`;
  $('close-dialog').onclick = closeDialog;
  overlay.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
}
const scene = new T.Scene();
  scene.background = new T.Color('#a4cfb6');
  scene.fog = new T.Fog('#a4cfb6', 65, 220);
const camera = new T.PerspectiveCamera(42, 1, .1, 450);
let renderer: T.WebGLRenderer;
try {
  renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
} catch {
  $('world').innerHTML = '<div class="fallback glass"><h2>نمای سه‌بعدی در دسترس نیست</h2><p>بازی را با مرورگری با پشتیبانی WebGL باز کن.</p></div>';
  throw new Error('WebGL unavailable');
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
renderer.shadowMap.enabled = true;
renderer.shadowMap.autoUpdate = false;
renderer.shadowMap.needsUpdate = true;
renderer.shadowMap.type = T.PCFSoftShadowMap;
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = .96;
$('world').append(renderer.domElement);
renderer.domElement.setAttribute('aria-label', 'برای قدم‌زدن روی زمین کلیک کن؛ حرکت با کلیدهای جهت‌دار هم کار می‌کند.');
renderer.domElement.tabIndex = 0;
const skyLight = new T.HemisphereLight(0xfff3d7, 0x52785d, 1.65);
scene.add(skyLight);
const sun = new T.DirectionalLight(0xffe1a8, 2.35);
sun.position.set(-14, 24, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38 });
scene.add(sun);
const softFill = new T.DirectionalLight(0xc9f0e1, .55);
softFill.position.set(20, 12, -14);
scene.add(softFill);

const districtWorld = createWorld(scene);
const fauna = createFaunaMeshGroup(scene);
const cameraFocus = new T.Vector3(-2, 0, 14);
const worldBounds = () => districtWorld.bounds();
const ambienceTarget = new T.Color('#a4cfb6');
const skyColorTarget = new T.Color();
const fogColorTarget = new T.Color();
const hemisphereColorTarget = new T.Color();
const groundHemisphereColorTarget = new T.Color();
const groundHemisphereBase = new T.Color('#3f594f');
const sunColorTarget = new T.Color();

// A small local drizzle follows the player while rain is active. The geometry
// is reused each frame and hidden completely in reduced-motion mode.
const rainDropCount = 88;
const rainPositions = new Float32Array(rainDropCount * 6);
const rainSpeeds = new Float32Array(rainDropCount);
let rainSeed = 0x51f15e;
const rainRandom = () => {
  rainSeed = (Math.imul(rainSeed, 1664525) + 1013904223) >>> 0;
  return rainSeed / 4294967296;
};
for (let i = 0; i < rainDropCount; i++) {
  const x = (rainRandom() - 0.5) * 28;
  const y = 2 + rainRandom() * 15;
  const z = (rainRandom() - 0.5) * 26;
  const length = 0.18 + rainRandom() * 0.2;
  const at = i * 6;
  rainPositions.set([x, y, z, x + 0.035, y - length, z], at);
  rainSpeeds[i] = 6 + rainRandom() * 3.5;
}
const rainGeometry = new T.BufferGeometry();
const rainPositionAttribute = new T.BufferAttribute(rainPositions, 3).setUsage(T.DynamicDrawUsage);
rainGeometry.setAttribute('position', rainPositionAttribute);
const rainMaterial = new T.LineBasicMaterial({
  color: '#e1f2ee', transparent: true, opacity: 0, depthWrite: false,
});
const rainStreaks = new T.LineSegments(rainGeometry, rainMaterial);
rainStreaks.visible = false;
scene.add(rainStreaks);

function unlockAudio() {
  audioEngine.enable();
}
document.addEventListener('pointerdown', unlockAudio, { passive: true });
window.addEventListener('keydown', unlockAudio);

// Character sheets are 1774x887 RGBA (~6.3 MB decoded each) and one sweep over
// both characters' nine looks plus their diagonals can ask for 36 of them. Only
// the six most recently used stay cached - one character's wardrobe plus slack -
// so long appearance-cycling sessions stay clear of the memory ceiling that
// crashes mobile Safari tabs.
const atlasMaxEntries = 6;
const atlasByteBudget = 64 * 1024 * 1024;
// Anisotropy is part of three's texture cache key, so it must be set before the
// first upload or the same sheet is uploaded twice; 8 is plenty at these grazing
// isometric angles.
const atlasAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
type AtlasEntry = { texture: T.Texture; bytes: number };
type AtlasStats = {
  entries: number; pinned: number; estimatedBytes: number; evictions: number; disposed: number;
  disposeEvents: number; maxEntries: number; byteBudget: number; anisotropy: number; gpuTextures: number;
};
const atlasCache = new Map<string, AtlasEntry>();
const atlasDisposed = new WeakSet<T.Texture>();
const visualActors: T.Group[] = [];
let atlasBytesTotal = 0;
let atlasEvictions = 0;
let atlasDisposals = 0;
let atlasDisposeEvents = 0;
// Cloned actor textures share one GPU upload per Source, so a sheet any live
// actor map still draws with is pinned: disposing it would kill that sprite.
const atlasPinnedSources = () => {
  const pinned = new Set<T.Source>();
  for (const actor of visualActors) for (const texture of [actor.userData.texture, actor.userData.ghostTexture] as T.Texture[]) {
    if (texture) pinned.add(texture.source);
  }
  return pinned;
};
const atlasImageBytes = (texture: T.Texture) => {
  const image = texture.image as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number } | null;
  return ((image?.naturalWidth ?? image?.width ?? 0) * (image?.naturalHeight ?? image?.height ?? 0)) * 4;
};
function atlasTrim() {
  const pinned = atlasPinnedSources();
  while (atlasCache.size > atlasMaxEntries || atlasBytesTotal > atlasByteBudget) {
    let victim: string | undefined;
    for (const [url, entry] of atlasCache) if (!pinned.has(entry.texture.source)) { victim = url; break; }
    // Everything left is still drawn by a live actor. Exceeding the soft budget
    // is the safe failure, so keep them and retry after the next actor swap.
    if (victim === undefined) break;
    const entry = atlasCache.get(victim)!;
    atlasCache.delete(victim);
    atlasBytesTotal -= entry.bytes;
    atlasEvictions++;
    if (!atlasDisposed.has(entry.texture)) {
      atlasDisposed.add(entry.texture);
      entry.texture.dispose();
      atlasDisposals++;
    }
  }
}
function atlasLoaded(url: string, texture: T.Texture) {
  const entry = atlasCache.get(url);
  if (entry?.texture === texture) {
    entry.bytes = atlasImageBytes(texture);
    atlasBytesTotal += entry.bytes;
  }
  // An actor can point at this Source before the sheet finishes decoding.
  for (const actor of visualActors) for (const live of [actor.userData.texture, actor.userData.ghostTexture] as T.Texture[]) {
    if (live?.source === texture.source) live.needsUpdate = true;
  }
  atlasTrim();
}
function selectedAtlas(isAngel: boolean, diagonal = false) {
  const hair = isAngel ? state.angelHair : state.gorHair;
  const outfit = isAngel ? state.angelOutfit : state.gorOutfit;
  const url = (diagonal ? diagonalAssets : lookAssets)[outfit][hair];
  const cached = atlasCache.get(url);
  if (cached) {
    atlasCache.delete(url);
    atlasCache.set(url, cached);
    return cached.texture;
  }
  const atlas = new T.TextureLoader().load(url, loaded => atlasLoaded(url, loaded));
  atlas.anisotropy = atlasAnisotropy;
  atlas.colorSpace = T.SRGBColorSpace;
  atlas.wrapS = T.ClampToEdgeWrapping;
  atlas.wrapT = T.ClampToEdgeWrapping;
  atlas.addEventListener('dispose', () => { atlasDisposeEvents++; });
  atlasCache.set(url, { texture: atlas, bytes: 0 });
  atlasTrim();
  return atlas;
}
// Growth counters for automated probes: no save data, credentials or user data.
if (typeof window !== 'undefined') {
  (window as unknown as { __caravanAtlasDebug?: { stats(): AtlasStats } }).__caravanAtlasDebug = {
    stats: () => {
      const pinned = atlasPinnedSources();
      let pinnedEntries = 0;
      for (const entry of atlasCache.values()) if (pinned.has(entry.texture.source)) pinnedEntries++;
      return {
        entries: atlasCache.size, pinned: pinnedEntries, estimatedBytes: atlasBytesTotal,
        evictions: atlasEvictions, disposed: atlasDisposals, disposeEvents: atlasDisposeEvents,
        maxEntries: atlasMaxEntries, byteBudget: atlasByteBudget, anisotropy: atlasAnisotropy,
        gpuTextures: renderer.info.memory.textures,
      };
    },
  };
}
function character(isAngel: boolean) {
  const group = new T.Group();
  const texture = selectedAtlas(isAngel).clone();
  texture.needsUpdate = true;
  texture.repeat.set(0.248, 0.494);
  const yOffset = isAngel ? 0.503 : 0.002;
  texture.offset.set(0.001, yOffset);
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, alphaTest: 0.08, depthWrite: false }));
  sprite.scale.set(2.8, 2.8, 1);
  sprite.position.y = 1.45;
  group.add(sprite);
  group.userData.texture = texture;
  group.userData.angel = isAngel;
  group.userData.direction = new T.Vector3(0, 0, 1);
  group.userData.sprite = sprite;
  group.userData.sector = 0;
  group.userData.fade = 1;
  group.userData.emoteUntil = 0;
  const shadow = new T.Mesh(new T.CircleGeometry(.43, 24), new T.MeshBasicMaterial({ color: '#355949', transparent: true, opacity: .19, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .025;
  group.add(shadow);
  const ghostTexture = texture.clone();
  ghostTexture.repeat.copy(texture.repeat);
  const ghost = new T.Sprite(new T.SpriteMaterial({ map: ghostTexture, transparent: true, opacity: 0, alphaTest: 0.08, depthWrite: false }));
  ghost.scale.copy(sprite.scale);
  ghost.position.copy(sprite.position);
  group.add(ghost);
  group.userData.ghost = ghost;
  group.userData.ghostTexture = ghostTexture;
  sprite.renderOrder = 2;
  ghost.renderOrder = 1;

  visualActors.push(group);
  return group;
}
const angel = character(true);
angel.position.set(-3.5, 0, 15.4);
scene.add(angel);
const gor = character(false);
gor.position.set(-2.25, 0, 14.3);
scene.add(gor);

const fx = createVisualFXSystem(scene, { camera, reducedMotion });
if (typeof window !== 'undefined' && window.matchMedia) {
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => {
    reducedMotion = event.matches;
    fx.setReducedMotion?.(event.matches);
  });
}
if (typeof window !== 'undefined') {
  (window as unknown as { fx: VisualFXSystem }).fx = fx;
}

function faceDirection(actor: T.Group, direction: T.Vector3) {
  actor.userData.direction.copy(direction);
  const right = new T.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const forward = camera.position.clone().sub(cameraFocus).setY(0).normalize();
  const frame = directionFrame(direction.dot(right), direction.dot(forward), actor.userData.angel);
  if (frame.sector === actor.userData.sector) return;
  const texture = actor.userData.texture as T.Texture;
  const ghostTexture = actor.userData.ghostTexture as T.Texture;
  const next = selectedAtlas(actor.userData.angel, frame.diagonal);
  // Dispose while a texture still points at its old Source: three reads
  // texture.source then and frees that GPU texture at refcount zero, whereas a
  // bare reassignment would keep drawing through the stale upload. The ghost
  // keeps the previous frame's Source for the fade.
  if (ghostTexture.source !== texture.source) {
    ghostTexture.dispose();
    ghostTexture.source = texture.source;
  }
  if (texture.source !== next.source) {
    texture.dispose();
    texture.source = next.source;
  }
  ghostTexture.offset.copy(texture.offset);
  ghostTexture.needsUpdate = true;
  const yOffset = actor.userData.angel ? 0.503 : 0.002;
  texture.offset.set(frame.column * 0.25 + 0.001, yOffset);
  texture.needsUpdate = true;
  actor.userData.sector = frame.sector;
  actor.userData.fade = reducedMotion ? 1 : 0;
  if (actor.userData.angel) $('world').dataset.direction = String(frame.sector);
}

const ownGarden = createGarden(
  scene,
  () => state,
  next => {
    if (next === state) return;
    const previous = state;
    state = next;
    save();
    const newPlant = next.plants.find(plant => !previous.plants.some(old => old.id === plant.id));
    if (newPlant) {
      gor.userData.emoteUntil = performance.now() + 1000;
      gor.userData.emoteKind = 'wave';
      setStatus(`${species[newPlant.species].name} کاشته شد.`);
      const flower = plantWorldPosition(newPlant);
      queueCompanionMoment('flower', flower, 'wave', 'گوراستاخ کنار گل تازه مکث کرد.', 1.2);
    } else if (next.essence > previous.essence) setStatus('گل برداشت شد.');
  },
  () => { target = null; keys.clear(); cancelCompanionMoments(); },
  () => { keys.clear(); },
  () => { ownGarden.close(); openBuild(); },
);
let building = false;
let buildKind: LandscapeKind | null = null;
let selectedLandscapeId: string | null = null;
let buildRotation = 0;
let placementCandidate: { x: number; z: number; kind: LandscapeKind; rotation: number; valid: boolean } | null = null;
let placementSequence = 0;
const gardenPlacementId = 'main-garden';
const defaultGardenPosition = { x: -2, z: 14, rotation: 0 };
const landscapeKindNames: Record<LandscapeKind, string> = {
  tree: 'درخت باغی',
  'spirit-tree': 'درخت روح',
  flower: 'گل تزئینی',
  'flower-clump': 'گروه گل تزئینی',
  'garden-bed': 'باغچهٔ اصلی',
  cottage: 'خانهٔ باغی',
  cabin: 'کلبهٔ روستایی',
  gazebo: 'آلاچیق',
  'wooden-bridge': 'پل چوبی',
  well: 'چاه سنگی',
};

function plantWorldPosition(plant: { col: number; row: number }): T.Vector3 {
  ownGarden.root.updateMatrixWorld(true);
  const point = ownGarden.root.localToWorld(new T.Vector3(plant.col - 3.5, 0, plant.row - 3.5));
  point.y = planetElevation(point.x, point.z);
  return point;
}

function syncGardenTransform() {
  const saved = state.landscapePlacements.find(placement => placement.id === gardenPlacementId);
  const transform = saved ?? defaultGardenPosition;
  const root = ownGarden.root;
  if (Math.abs(root.position.x - transform.x) < 1e-4
    && Math.abs(root.position.z - transform.z) < 1e-4
    && Math.abs(root.rotation.y - transform.rotation) < 1e-4) return;
  ownGarden.setTransform(transform.x, transform.z, transform.rotation);
}

function selectedPlacement(): LandscapePlacement | null {
  if (!selectedLandscapeId) return null;
  const saved = state.landscapePlacements.find(placement => placement.id === selectedLandscapeId);
  if (saved) return saved;
  if (selectedLandscapeId !== gardenPlacementId) return null;
  return {
    id: gardenPlacementId,
    kind: 'garden-bed',
    x: ownGarden.root.position.x,
    z: ownGarden.root.position.z,
    rotation: ownGarden.root.rotation.y,
  };
}

function activePlacementSpec(): LandscapePlacement | null {
  const selected = selectedPlacement();
  if (selected) return { ...selected, rotation: buildRotation };
  if (!buildKind) return null;
  const id = buildKind === 'garden-bed' ? gardenPlacementId : `preview-${buildKind}`;
  return { id, kind: buildKind, x: 0, z: 0, rotation: buildRotation };
}

function setPlacementMessage(message: string, stateName: 'idle' | 'valid' | 'invalid' | 'blocked' = 'idle') {
  placementStatus.textContent = message;
  placementStatus.dataset.placementState = stateName;
  gameRoot.dataset.placementState = stateName;
}

function setBuilding(active: boolean) {
  building = active;
  gameRoot.classList.toggle('building', active);
  buildPalette.hidden = !active;
  $('build-action').setAttribute('aria-pressed', String(active));
  $('build-action').textContent = active ? 'بستن ساخت' : 'ساخت آزاد';
  renderer.domElement.setAttribute('aria-label', active
    ? 'حالت ساخت آزاد. کلیدهای جهت‌دار جای سازه را جابه‌جا می‌کنند، R آن را می‌چرخاند، Enter ثبت می‌کند و Delete آن را برمی‌دارد.'
    : 'برای قدم‌زدن روی زمین کلیک کن؛ حرکت با کلیدهای جهت‌دار هم کار می‌کند.');
  if (!active) {
    buildKind = null;
    selectedLandscapeId = null;
    placementCandidate = null;
    placementMarker.hidden = true;
    delete gameRoot.dataset.placementState;
    districtWorld.setLandscapePreview(null);
    syncBuildControls();
    $('build-action').focus({ preventScroll: true });
  }
}

function syncBuildControls() {
  for (const button of buildPalette.querySelectorAll<HTMLButtonElement>('[data-kind]')) {
    const kind = button.dataset.kind as LandscapeKind;
    button.setAttribute('aria-pressed', String(kind === buildKind || (kind === 'garden-bed' && selectedLandscapeId === gardenPlacementId)));
  }
  const objectSelect = $<HTMLSelectElement>('landscape-object-select');
  const selectedId = selectedLandscapeId;
  const placements = state.landscapePlacements.filter(placement => placement.id !== gardenPlacementId);
  const fragment = document.createDocumentFragment();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'سازه‌ای را انتخاب کن';
  fragment.append(placeholder);
  const gardenOption = document.createElement('option');
  gardenOption.value = gardenPlacementId;
  gardenOption.textContent = 'باغچهٔ اصلی';
  fragment.append(gardenOption);
  const kindCounts = new Map<LandscapeKind, number>();
  for (const placement of placements) {
    const index = (kindCounts.get(placement.kind) ?? 0) + 1;
    kindCounts.set(placement.kind, index);
    const option = document.createElement('option');
    option.value = placement.id;
    option.textContent = `${landscapeKindNames[placement.kind]} ${new Intl.NumberFormat('fa-IR').format(index)}`;
    fragment.append(option);
  }
  objectSelect.replaceChildren(fragment);
  objectSelect.disabled = false; // The movable main garden is always available.
  objectSelect.value = selectedId && (selectedId === gardenPlacementId || placements.some(item => item.id === selectedId))
    ? selectedId
    : '';

  const selected = selectedPlacement();
  const controls = buildPalette.querySelector<HTMLElement>('.object-controls');
  if (controls) controls.hidden = !selected && !buildKind;
  const removeButton = $<HTMLButtonElement>('remove-landscape');
  removeButton.disabled = !selected || selected.id === gardenPlacementId;
}

$<HTMLSelectElement>('landscape-object-select').addEventListener('change', event => {
  const select = event.currentTarget as HTMLSelectElement;
  if (select.value) {
    selectLandscapePlacement(select.value);
    renderer.domElement.focus({ preventScroll: true });
    return;
  }
  selectedLandscapeId = null;
  buildKind = null;
  placementCandidate = null;
  placementMarker.hidden = true;
  districtWorld.setLandscapePreview(null);
  setPlacementMessage('یک سازه را از فهرست یا خود دشت برگزین.', 'idle');
  syncBuildControls();
});

function setBuildKind(kind: LandscapeKind) {
  const existing = kind === 'garden-bed'
    ? state.landscapePlacements.find(placement => placement.id === gardenPlacementId)
    : undefined;
  if (kind === 'garden-bed') {
    if (selectedLandscapeId === gardenPlacementId) {
      selectedLandscapeId = null;
      buildKind = null;
    } else {
      selectedLandscapeId = gardenPlacementId;
      buildKind = null;
      buildRotation = existing?.rotation ?? ownGarden.root.rotation.y;
    }
    setPlacementMessage('باغچهٔ زندهٔ فعلی را جابه‌جا کن؛ گل‌ها و زمان رشدشان می‌مانند. باغچهٔ تازه‌ای ساخته نمی‌شود.', 'idle');
  } else {
    selectedLandscapeId = null;
    buildKind = buildKind === kind ? null : kind;
    buildRotation = 0;
    setPlacementMessage(buildKind ? 'پیش‌نمایش را روی چمن حرکت بده؛ با یک ضربه یا کلید Enter بساز.' : 'روی سازه‌ای از خودت بزن تا جابه‌جایش کنی.', 'idle');
  }
  placementCandidate = null;
  districtWorld.setLandscapePreview(null);
  placementMarker.hidden = true;
  syncBuildControls();
  const selected = selectedPlacement();
  const start = selected ? { x: selected.x, z: selected.z } : { x: angel.position.x, z: angel.position.z };
  if (activePlacementSpec()) updatePlacementPreviewAt(start);
}

for (const button of buildPalette.querySelectorAll<HTMLButtonElement>('[data-kind]')) {
  button.addEventListener('click', event => {
    const kind = button.dataset.kind;
    if (kind && landscapeKinds.includes(kind as LandscapeKind)) {
      setBuildKind(kind as LandscapeKind);
      // Keyboard users move from the chosen tool into the world, where the
      // arrow keys and Enter control the placement preview.
      if (event.detail === 0) renderer.domElement.focus({ preventScroll: true });
    }
  });
}

function openBuild() {
  cancelCompanionMoments();
  markPlayerActive();
  target = null;
  keys.clear();
  if (overlay.hidden === false) closeDialog();
  if (ownGarden.editing) ownGarden.close();
  if (flightState !== 'grounded') toggleFlight(false);
  setBuilding(true);
  syncBuildControls();
  buildPalette.querySelector<HTMLButtonElement>('[data-kind]')?.focus({ preventScroll: true });
  setPlacementMessage('یک چیز را برگزین؛ بعد روی چمن جای دلخواه بگذار.', 'idle');
}

$('finish-building').onclick = () => setBuilding(false);
$('rotate-landscape-left').onclick = () => rotatePlacement(-1);
$('rotate-landscape-right').onclick = () => rotatePlacement(1);
$('remove-landscape').onclick = () => removeSelectedPlacement();

function rotatePlacement(direction: number) {
  if (!activePlacementSpec()) return;
  buildRotation = stepPlacementRotation(buildRotation, direction);
  const selected = selectedPlacement();
  if (selected && selected.id !== gardenPlacementId) {
    state = moveLandscapePlacement(state, selected.id, selected.x, selected.z, buildRotation);
    save();
    setPlacementMessage('سازه چرخید؛ می‌توانی جای تازه‌ای هم برایش انتخاب کنی.');
  } else {
    setPlacementMessage('چرخش پیش‌نمایش آماده است؛ روی چمن بزن تا جایش ثبت شود.');
  }
  syncBuildControls();
  if (placementCandidate) updatePlacementPreviewAt(placementCandidate);
}

function removeSelectedPlacement() {
  if (!selectedLandscapeId || selectedLandscapeId === gardenPlacementId) return;
  state = removeLandscapePlacement(state, selectedLandscapeId);
  selectedLandscapeId = null;
  save();
  districtWorld.setLandscapePreview(null);
  placementMarker.hidden = true;
  setPlacementMessage('سازه از دشت برداشته شد. هر وقت خواستی دوباره بسازش.');
  syncBuildControls();
}

$('build-action').addEventListener('click', () => {
  if (building) {
    setBuilding(false);
    return;
  }
  openBuild();
});

// ============================================================================
// Couple Traversal & Flight Mechanics State
// ============================================================================
let handHoldingActive = false;
let handSideSign = 1; // +1 right side, -1 left side
let walkDistance = 0;
let footstepAccumulator = 0;
let leftFoot = false;

let flightState: FlightState = 'grounded';
let baseAltitude = 0;
let targetAltitude = 0;
let currentHeadingAngle = 0;
let bankAngle = 0;
let lastHeadingAngle = 0;

// Companion Idle Awareness State
let lastPlayerActiveTime = performance.now();
let idleReactionActive = false;
type IdleReactionType = 'reach' | 'glance' | 'sit';
let idleReactionType: IdleReactionType = 'reach';
const IDLE_AWARENESS_THRESHOLD_MS = 4500;
const IDLE_AFFECTION_MAX_DISTANCE = 4.5;

const angelHandPos = new T.Vector3();
const gorHandPos = new T.Vector3();
const characterMidpoint = new T.Vector3();

function markPlayerActive(now: number = performance.now()) {
  lastPlayerActiveTime = now;
  if (idleReactionActive) {
    idleReactionActive = false;
    if (gor.userData.isIdleAffection) {
      gor.userData.isIdleAffection = false;
      gor.userData.emoteUntil = 0;
      gor.userData.emoteKind = 'none';
    }
  }
}

function updateCompanionIdleAwareness(now: number) {
  if (reducedMotion || !overlay.hidden || ownGarden.editing) {
    lastPlayerActiveTime = now;
    return;
  }
  const isPlayerMoving = Boolean(
    target !== null ||
    keys.has('w') || keys.has('a') || keys.has('s') || keys.has('d') ||
    keys.has('ArrowUp') || keys.has('ArrowDown') || keys.has('ArrowLeft') || keys.has('ArrowRight')
  );
  if (isPlayerMoving) {
    markPlayerActive(now);
    return;
  }
  if (isCompanionIdle(lastPlayerActiveTime, now, IDLE_AWARENESS_THRESHOLD_MS) && !idleReactionActive) {
    triggerCompanionIdleReaction(now);
  }
}

function triggerCompanionIdleReaction(now: number) {
  const dist = angel.position.distanceTo(gor.position);
  if (dist > IDLE_AFFECTION_MAX_DISTANCE) return;

  idleReactionActive = true;
  gor.userData.isIdleAffection = true;

  const toAngel = angel.position.clone().sub(gor.position).setY(0);
  if (toAngel.lengthSq() > 0.01) {
    faceDirection(gor, toAngel.normalize());
  }

  const reactions: IdleReactionType[] = ['reach', 'glance', 'sit'];
  idleReactionType = reactions[Math.floor(Math.random() * reactions.length)];

  if (idleReactionType === 'reach') {
    gor.userData.emoteKind = 'wave';
    gor.userData.emoteUntil = now + 4200;
    setStatus('گوراستاخ با لبخندی آرام دستش را به سویت دراز کرد.');
    const mid = angel.position.clone().add(gor.position).multiplyScalar(0.5);
    fx.spawnFootstepGlow(mid);
  } else if (idleReactionType === 'glance') {
    gor.userData.emoteKind = 'wave';
    gor.userData.emoteUntil = now + 3500;
    setStatus('گوراستاخ با نگاهی گرم و پرمهر به تو چشم دوخته است.');
  } else if (idleReactionType === 'sit') {
    gor.userData.emoteKind = 'sit';
    gor.userData.emoteUntil = now + 9000;
    setStatus('گوراستاخ در سکوت کنارت نشست تا با هم استراحت کنید.');
  }
}

function toggleHandHolding(force?: boolean) {
  cancelCompanionMoments();
  markPlayerActive();
  const next = force !== undefined ? force : !handHoldingActive;
  if (next === handHoldingActive) return;
  handHoldingActive = next;
  if (handHoldingActive) {
    audioEngine.playHandholdChime();
    const heading = (angel.userData.direction as T.Vector3).clone().setY(0);
    if (heading.lengthSq() < 1e-4) heading.set(0, 0, 1);
    heading.normalize();
    const rightNormal = new T.Vector3(heading.z, 0, -heading.x).normalize();
    const toGor = gor.position.clone().sub(angel.position).setY(0);
    handSideSign = toGor.dot(rightNormal) >= 0 ? 1 : -1;
    faceDirection(gor, heading);
    const hands = computeHandPositions(angel.position, gor.position);
    angelHandPos.set(hands.angelHand.x, hands.angelHand.y, hands.angelHand.z);
    gorHandPos.set(hands.gorHand.x, hands.gorHand.y, hands.gorHand.z);
    fx.setHandHoldConnection(angelHandPos, gorHandPos, true);
    setStatus('دست‌های یکدیگر را گرفتید؛ گام‌هایتان یکی شد.');
  } else {
    fx.setHandHoldConnection(angel.position, gor.position, false);
    setStatus('دست‌ها با آرامش رها شدند.');
  }
}

function toggleFlight(force?: boolean) {
  if (ownGarden.editing) return;
  cancelCompanionMoments();
  markPlayerActive();
  const isFlying = flightState !== 'grounded';
  const shouldFly = force !== undefined ? force : !isFlying;
  if (shouldFly === isFlying) return;

  const flightBtn = $<HTMLButtonElement>('flight-toggle-btn');
  const ascendBtn = $<HTMLButtonElement>('flight-ascend-btn');
  const descendBtn = $<HTMLButtonElement>('flight-descend-btn');
  if (shouldFly) {
    flightState = 'ascending';
    targetAltitude = 4.0;
    audioEngine.playFlightTakeoff();
    flightBtn?.setAttribute('aria-pressed', 'true');
    if (flightBtn) flightBtn.textContent = 'فرود';
    ascendBtn?.removeAttribute('hidden');
    descendBtn?.removeAttribute('hidden');
    fx.updateRibbonTrails(angel.position, gor.position, true);
    setStatus('پرواز دونفره آغاز شد؛ با کلیدهای Space و C یا دکمه‌های اوج و فرود ارتفاع را تنظیم کنید.');
  } else {
    flightState = 'descending';
    targetAltitude = 0.0;
    flightBtn?.setAttribute('aria-pressed', 'false');
    if (flightBtn) flightBtn.textContent = 'پرواز';
    ascendBtn?.setAttribute('hidden', '');
    descendBtn?.setAttribute('hidden', '');
    setStatus('فرود نرم بر پهنهٔ دشت...');
  }
}

let activeEmbraceStart = 0;
let lastEmbraceParticleTime = 0;
const EMBRACE_DURATION_MS = 3200;
let vignetteState: VignetteState = createVignetteState();
const vignetteEl = $('romance-vignette');

function showRomanceVignette(assetIndex: number = 0) {
  if (reducedMotion) return;
  vignetteState = triggerVignette(vignetteState, assetIndex, performance.now(), 2600);
  if (vignetteEl) {
    vignetteEl.innerHTML = `<div class="romance-vignette-card"><img src="${vignetteState.imageSrc}" alt="خاطره" /></div><div class="romance-vignette-caption">${vignetteState.caption}</div>`;
    vignetteEl.classList.add('active');
  }
}

function triggerEmbraceAction() {
  cancelCompanionMoments();
  closeDialog();
  markPlayerActive();
  const now = performance.now();

  audioEngine.playEmbraceHarmony();
  showRomanceVignette(Math.floor(Math.random() * 3));

  activeEmbraceStart = now;
  lastEmbraceParticleTime = now;
  angel.userData.isEmbracing = true;
  gor.userData.isEmbracing = true;

  const dir = gor.position.clone().sub(angel.position).setY(0);
  if (dir.lengthSq() > 0.001) {
    faceDirection(angel, dir.clone().normalize());
    faceDirection(gor, dir.clone().negate().normalize());
  }

  angel.userData.emoteUntil = now + EMBRACE_DURATION_MS;
  gor.userData.emoteUntil = now + EMBRACE_DURATION_MS;
  angel.userData.emoteKind = 'hug';
  gor.userData.emoteKind = 'hug';

  const midpoint = angel.position.clone().add(gor.position).multiplyScalar(0.5);
  midpoint.y = planetElevation(midpoint.x, midpoint.z);
  fx.spawnFootstepGlow(midpoint);
  fx.spawnEmbraceWarmth?.(midpoint);
  const hands = computeHandPositions(angel.position, gor.position);
  angelHandPos.set(hands.angelHand.x, hands.angelHand.y, hands.angelHand.z);
  gorHandPos.set(hands.gorHand.x, hands.gorHand.y, hands.gorHand.z);
  fx.setHandHoldConnection(angelHandPos, gorHandPos, true);
  setTimeout(() => {
    angel.userData.isEmbracing = false;
    gor.userData.isEmbracing = false;
    if (!handHoldingActive) {
      fx.setHandHoldConnection(angel.position, gor.position, false);
    }
  }, EMBRACE_DURATION_MS);

  setStatus('یکدیگر را با گرمی در آغوش کشیدید؛ نوای آرامش در دشت طنین‌انداز شد.');
}

const socialLines: Record<'wave' | 'sit' | 'walk', string[]> = {
  wave: ['به گوراستاخ سلام کردی.', 'گوراستاخ جواب سلام داد.', 'با هم سلام کردید.'],
  sit: ['کنار هم نشستید.', 'کمی استراحت کردید.', 'با هم مکث کردید.'],
  walk: ['دست در دست و شانه به شانه قدم می‌زنید.', 'گردش آرام و دل‌نشین در دشت.', 'کنار هم در سایه‌روشن دشت راه می‌روید.'],
};
function socialAction(kind: 'wave' | 'sit' | 'walk') {
  cancelCompanionMoments();
  closeDialog();
  markPlayerActive();
  const line = socialLines[kind][socialBeat++ % socialLines[kind].length];
  const until = performance.now() + (kind === 'walk' ? 9000 : 1600);
  angel.userData.emoteUntil = until;
  gor.userData.emoteUntil = until;
  angel.userData.emoteKind = kind;
  gor.userData.emoteKind = kind;
  if (kind === 'walk') {
    gor.userData.walkTogetherUntil = until;
    const heading = (angel.userData.direction as T.Vector3).clone().setY(0);
    if (heading.lengthSq() < 1e-4) heading.set(0, 0, 1);
    heading.normalize();
    const rightNormal = new T.Vector3(heading.z, 0, -heading.x).normalize();
    const toGor = gor.position.clone().sub(angel.position).setY(0);
    handSideSign = toGor.dot(rightNormal) >= 0 ? 1 : -1;
  }
  setStatus(line);
}
function peopleDialog(returnFocus: HTMLElement = $('people-action')) {
  cancelCompanionMoments();
  markPlayerActive();
  const handHoldLabel = handHoldingActive ? 'رها کردن دست' : 'دست هم را بگیریم';
  const flightLabel = flightState !== 'grounded' ? 'فرود آمدن' : 'پرواز دونفره';
  dialog(
    'همراهان',
    '',
    `<div class="companion-actions">
      <button data-social="wave">سلام</button>
      <button data-social="handhold">${handHoldLabel}</button>
      <button data-social="fly">${flightLabel}</button>
      <button data-social="embrace">در آغوش کشیدن</button>
      <button data-social="sit">کمی بنشینیم</button>
      <button data-social="walk">با هم قدم بزنیم</button>
      <button id="appearance-action">تغییر ظاهر</button>
    </div>`,
    returnFocus,
  );
  for (const button of overlay.querySelectorAll<HTMLButtonElement>('[data-social]')) {
    button.onclick = () => {
      const kind = button.dataset.social;
      if (kind === 'wave' || kind === 'sit' || kind === 'walk') {
        socialAction(kind);
      } else if (kind === 'handhold') {
        closeDialog();
        toggleHandHolding();
      } else if (kind === 'fly') {
        closeDialog();
        toggleFlight();
      } else if (kind === 'embrace') {
        triggerEmbraceAction();
      }
    };
  }
  $('appearance-action').onclick = appearanceDialog;
}
function appearanceDialog() {
  const who = overlay.dataset.appearanceWho === 'gor' ? 'gor' : 'angel';
  const currentHair = who === 'gor' ? state.gorHair : state.angelHair;
  const currentOutfit = who === 'gor' ? state.gorOutfit : state.angelOutfit;
  const hairNames: Record<HairColor, string> = { black: 'مشکی', brown: 'قهوه‌ای', white: 'سفید' };
  const outfitNames: Record<Outfit, string> = { classic: 'کلاسیک', traveler: 'رهگذر', celestial: 'ستاره‌ای' };
  const characterOptions = `<label class="appearance-character">شخصیت <select id="appearance-character"><option value="angel" ${who === 'angel' ? 'selected' : ''}>فرشته</option><option value="gor" ${who === 'gor' ? 'selected' : ''}>گوراستاخ</option></select></label>`;
  const hairOptions = `<fieldset><legend>مو</legend>${hairColors.map(hair => `<button data-hair="${hair}" aria-pressed="${hair === currentHair}">${hairNames[hair]}</button>`).join('')}</fieldset>`;
  const outfitOptions = `<fieldset><legend>لباس</legend>${outfits.map(outfit => `<button data-outfit="${outfit}" aria-pressed="${outfit === currentOutfit}">${outfitNames[outfit]}</button>`).join('')}</fieldset>`;
  dialog('ظاهر همراه‌ها', `<div class="appearance-options">${characterOptions}${hairOptions}${outfitOptions}</div>`, '', $('people-action'));
  overlay.dataset.appearanceWho = who;
  $('appearance-character').onchange = event => {
    overlay.dataset.appearanceWho = (event.target as HTMLSelectElement).value;
    appearanceDialog();
  };
  for (const button of overlay.querySelectorAll<HTMLButtonElement>('[data-hair]')) {
    button.onclick = () => {
      state = setAppearance(state, who, button.dataset.hair as HairColor, currentOutfit);
      save();
      appearanceDialog();
    };
  }
  for (const button of overlay.querySelectorAll<HTMLButtonElement>('[data-outfit]')) {
    button.onclick = () => {
      state = setAppearance(state, who, currentHair, button.dataset.outfit as Outfit);
      save();
      appearanceDialog();
    };
  }
}
renderer.domElement.addEventListener('contextmenu', event => {
  event.preventDefault();
});

$('people-action').onclick = () => { if (building) setBuilding(false); peopleDialog($('people-action')); };
$('flight-ascend-btn').onclick = () => {
  if (flightState === 'grounded') return;
  targetAltitude = adjustFlightAltitude(targetAltitude, 1.5);
  setStatus(`ارتفاع پرواز: ${targetAltitude.toFixed(1)} متر`);
};
$('flight-descend-btn').onclick = () => {
  if (flightState === 'grounded') return;
  targetAltitude = adjustFlightAltitude(targetAltitude, -1.5);
  setStatus(`ارتفاع پرواز: ${targetAltitude.toFixed(1)} متر`);
};
$('plant-action').onclick = () => { if (building) setBuilding(false); cancelCompanionMoments(); closeDialog(); if (flightState !== 'grounded') toggleFlight(false); ownGarden.open(); };
$('interact').onclick = () => { if (nearestCompanion) peopleDialog($('interact')); };
$('camera-view').onclick = () => {
  wideView = !wideView;
  $('camera-view').setAttribute('aria-pressed', String(wideView));
  $('camera-view').textContent = wideView ? 'نمای نزدیک' : 'نمای باز';
  document.querySelector('main')!.dataset.camera = wideView ? 'wide' : 'close';
};

const raycaster = new T.Raycaster();
const pointer = new T.Vector2();
let pointerStart = { x: 0, y: 0 };

function placementBlockers(exceptId: string | null, kind: LandscapeKind): ObstacleCircle[] {
  const dynamic = new Set<ObstacleCircle>(districtWorld.landscapeObstacles);
  const waterways = new Set<ObstacleCircle>(districtWorld.waterwayObstacles);
  const fixed = districtWorld.obstacles.filter(obstacle => !dynamic.has(obstacle)
    && !(kind === 'wooden-bridge' && waterways.has(obstacle)));
  const saved = [...state.landscapePlacements];
  if (!saved.some(placement => placement.id === gardenPlacementId)) {
    saved.push({ id: gardenPlacementId, kind: 'garden-bed', ...defaultGardenPosition });
  }
  const footprints = saved
    .filter(placement => placement.id !== exceptId)
    .map(placement => ({
      x: placement.x,
      z: placement.z,
      radius: landscapeFootprintRadii[placement.kind],
    }));
  return [...fixed, ...footprints];
}

function updatePlacementPreviewAt(point: { x: number; z: number }) {
  const spec = activePlacementSpec();
  if (!building || !spec) {
    placementCandidate = null;
    placementMarker.hidden = true;
    districtWorld.setLandscapePreview(null);
    return;
  }

  const bounds = worldBounds();
  const radius = landscapeFootprintRadii[spec.kind];
  const candidate = projectAndSnapToLand(
    point,
    { x: bounds.x, z: bounds.z, radius: bounds.r },
    radius,
    0.25,
  );
  const valid = isPlacementClear(candidate, radius, placementBlockers(spec.id, spec.kind), LANDSCAPE_PLACEMENT_CLEARANCE);
  placementCandidate = { ...candidate, kind: spec.kind, rotation: buildRotation, valid };
  districtWorld.setLandscapePreview({ ...spec, ...candidate, rotation: buildRotation }, valid);
  setPlacementMessage(
    valid ? 'جای این سازه آماده است؛ برای گذاشتنش روی زمین بزن یا Enter را بزن.' : 'این نقطه به آب یا سازه‌ای نزدیک است؛ کمی جابه‌جایش کن.',
    valid ? 'valid' : 'blocked',
  );

  camera.updateMatrixWorld();
  const center = new T.Vector3(candidate.x, planetElevation(candidate.x, candidate.z) + 0.08, candidate.z).project(camera);
  const edge = new T.Vector3(candidate.x + radius, planetElevation(candidate.x + radius, candidate.z) + 0.08, candidate.z).project(camera);
  const rect = renderer.domElement.getBoundingClientRect();
  const screenX = rect.left + (center.x * 0.5 + 0.5) * rect.width;
  const screenY = rect.top + (-center.y * 0.5 + 0.5) * rect.height;
  const edgeX = rect.left + (edge.x * 0.5 + 0.5) * rect.width;
  const edgeY = rect.top + (-edge.y * 0.5 + 0.5) * rect.height;
  const markerSize = Math.max(40, Math.hypot(edgeX - screenX, edgeY - screenY) * 2);
  placementMarker.style.left = `${screenX}px`;
  placementMarker.style.top = `${screenY}px`;
  placementMarker.style.width = `${markerSize}px`;
  placementMarker.style.height = `${markerSize}px`;
  placementMarker.dataset.placementState = valid ? 'valid' : 'invalid';
  placementMarker.hidden = center.z < -1 || center.z > 1;
}

function updatePlacementPreviewFromEvent(event: PointerEvent) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const hit = raycaster.intersectObject(districtWorld.ground, false)[0];
  if (!hit) {
    placementCandidate = null;
    placementMarker.hidden = true;
    districtWorld.setLandscapePreview(null);
    setPlacementMessage('روی چمن پیوسته حرکت کن تا جای سازه را انتخاب کنی.', 'invalid');
    return;
  }
  updatePlacementPreviewAt(hit.point);
}

function makeLandscapeId(): string {
  placementSequence = (placementSequence + 1) % 1_000_000;
  return `land-${Date.now().toString(36)}-${placementSequence.toString(36)}`;
}

function selectLandscapePlacement(id: string) {
  selectedLandscapeId = id;
  buildKind = null;
  const selected = selectedPlacement();
  buildRotation = selected?.rotation ?? 0;
  syncBuildControls();
  setPlacementMessage(selected?.kind === 'garden-bed'
    ? 'باغچهٔ اصلی انتخاب شد؛ با زدن روی چمن جابه‌جایش کن.'
    : 'سازه انتخاب شد؛ جای تازه، چرخش یا برداشتن را انجام بده.');
  if (selected) updatePlacementPreviewAt(selected);
}

function commitLandscapeAtCandidate() {
  const candidate = placementCandidate;
  const spec = activePlacementSpec();
  if (!candidate || !candidate.valid || !spec) {
    setPlacementMessage('این نقطه جا ندارد؛ پیش‌نمایش را به جای سبز دیگری ببر.', 'blocked');
    return;
  }

  let next: State;
  if (selectedLandscapeId) {
    if (selectedLandscapeId === gardenPlacementId) {
      const existing = state.landscapePlacements.some(placement => placement.id === gardenPlacementId);
      next = existing
        ? moveLandscapePlacement(state, gardenPlacementId, candidate.x, candidate.z, candidate.rotation)
        : placeLandscapePlacement(state, {
          id: gardenPlacementId, kind: 'garden-bed', x: candidate.x, z: candidate.z, rotation: candidate.rotation,
        });
    } else {
      next = moveLandscapePlacement(state, selectedLandscapeId, candidate.x, candidate.z, candidate.rotation);
    }
    if (next === state) {
      setPlacementMessage('جای تازه برای این سازه مناسب نیست.', 'blocked');
      return;
    }
    state = next;
    save();
    setPlacementMessage(spec.kind === 'garden-bed'
      ? 'باغچه جابه‌جا شد؛ گل‌ها و رشدشان حفظ شدند.'
      : 'سازه جابه‌جا شد و جای تازه‌اش ذخیره شد.');
  } else if (buildKind) {
    next = placeLandscapePlacement(state, {
      id: makeLandscapeId(), kind: buildKind, x: candidate.x, z: candidate.z, rotation: candidate.rotation,
    });
    if (next === state) {
      setPlacementMessage('سازه در این نقطه ثبت نشد؛ جای دیگری را امتحان کن.', 'blocked');
      return;
    }
    state = next;
    save();
    setPlacementMessage('به دشت اضافه شد؛ می‌توانی مورد بعدی را هم آزادانه بچینی.');
  }
  syncBuildControls();
}

renderer.domElement.addEventListener('pointermove', event => {
  if (building) updatePlacementPreviewFromEvent(event);
});
renderer.domElement.addEventListener('pointerdown', event => {
  markPlayerActive();
  pointerStart = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', event => {
  markPlayerActive();
  if (!overlay.hidden || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 12) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  const groundHit = raycaster.intersectObject(districtWorld.ground)[0];
  if (building) {
    const pickedId = districtWorld.pickLandscape(raycaster);
    if (pickedId && pickedId !== selectedLandscapeId) {
      selectLandscapePlacement(pickedId);
      if (groundHit) updatePlacementPreviewAt(groundHit.point);
      return;
    }
    if (buildKind) {
      if (!groundHit) return;
      updatePlacementPreviewAt(groundHit.point);
      commitLandscapeAtCandidate();
      return;
    }

    if (activePlacementSpec() && groundHit) {
      updatePlacementPreviewAt(groundHit.point);
      commitLandscapeAtCandidate();
      return;
    }
    setPlacementMessage('یک سازه را از فهرست انتخاب کن یا روی یکی از سازه‌های خودت بزن.', 'idle');
    return;
  }
  if (ownGarden.editing) { ownGarden.hit(raycaster); return; }
  if (ownGarden.owns(raycaster)) { ownGarden.open(); ownGarden.hit(raycaster); return; }
  if (raycaster.intersectObject(gor, true).length) {
    cancelCompanionMoments();
    markPlayerActive();
    if (nearestCompanion) peopleDialog($('interact'));
    else setStatus('گوراستاخ کمی دورتر است؛ با حرکت به او نزدیک شو.');
    return;
  }
  const hit = groundHit;
  if (!hit) return;
  cancelCompanionMoments();
  markPlayerActive();
  target = hit.point.clone();
  target.y = planetElevation(target.x, target.z);
  const bounds = worldBounds();
  const dx = target.x - bounds.x, dz = target.z - bounds.z, distance = Math.hypot(dx, dz);
  if (distance > bounds.r) { target.x = bounds.x + dx * bounds.r / distance; target.z = bounds.z + dz * bounds.r / distance; }
});

window.addEventListener('keydown', event => {
  if (!overlay.hidden) {
    if (event.key === 'Escape') closeDialog();
    if (event.key === 'Tab') {
      const buttons = [...overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    return;
  }
  const key = event.key.toLowerCase();
  if (building) {
    if (event.key === 'Escape') {
      event.preventDefault();
      setBuilding(false);
      return;
    }
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('input, select, textarea, [contenteditable="true"]')) return;
    // Enter on any palette button must remain the browser's native activation
    // key; Enter commits only while the world or page itself has focus.
    if (event.key === 'Enter' && target?.closest('button')) return;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(event.key)) {
      const base = placementCandidate ?? selectedPlacement() ?? { x: angel.position.x, z: angel.position.z };
      const step = event.shiftKey ? 2 : 0.5;
      const next = { x: base.x, z: base.z };
      if (event.key === 'ArrowUp' || key === 'w') next.z -= step;
      if (event.key === 'ArrowDown' || key === 's') next.z += step;
      if (event.key === 'ArrowLeft' || key === 'a') next.x -= step;
      if (event.key === 'ArrowRight' || key === 'd') next.x += step;
      event.preventDefault();
      if (activePlacementSpec()) updatePlacementPreviewAt(next);
      return;
    }
    if (event.code === 'KeyR' || key === 'r') {
      event.preventDefault();
      rotatePlacement(1);
      return;
    }
    if ((event.key === 'Backspace' || event.key === 'Delete') && selectedLandscapeId) {
      event.preventDefault();
      removeSelectedPlacement();
      return;
    }
    if (event.key === 'Enter' && activePlacementSpec() && placementCandidate) {
      event.preventDefault();
      commitLandscapeAtCandidate();
      return;
    }
    return;
  }
  if (key === 'f') {
    event.preventDefault();
    toggleFlight();
    return;
  }
  if ((key === ' ' || key === 'r') && flightState !== 'grounded') {
    event.preventDefault();
    targetAltitude = adjustFlightAltitude(targetAltitude, 1.2);
    setStatus(`ارتفاع پرواز: ${targetAltitude.toFixed(1)} متر`);
    return;
  }
  if ((key === 'c' || key === 'q' || event.shiftKey) && flightState !== 'grounded') {
    event.preventDefault();
    targetAltitude = adjustFlightAltitude(targetAltitude, -1.2);
    setStatus(`ارتفاع پرواز: ${targetAltitude.toFixed(1)} متر`);
    return;
  }
  if (key === 'h' && nearestCompanion) {
    event.preventDefault();
    toggleHandHolding();
    return;
  }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(event.key)) {
    event.preventDefault();
    cancelCompanionMoments();
    markPlayerActive();
    keys.add(event.key);
    target = null;
  }
  if (key === 'e' && nearestCompanion) $('interact').click();
  if (event.key === 'Escape' && ownGarden.editing) ownGarden.close();
});
window.addEventListener('keyup', event => keys.delete(event.key));
window.addEventListener('blur', () => keys.clear());

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
renderer.domElement.addEventListener('wheel', event => {
  event.preventDefault();
  zoom = T.MathUtils.clamp(zoom + event.deltaY * .0008, .68, 1.4);
}, { passive: false });

const clock = new T.Clock();
let lastFrame = 0;
let viewScale = 1;
function animate() {
  const now = performance.now();
  const frameInterval = overlay.hidden ? 1000 / 30 : 200;
  if (now - lastFrame < frameInterval) return;
  lastFrame = now;
  const dt = T.MathUtils.clamp(clock.getDelta(), 0, .75);
  elapsed += dt;
  const atmosphere = sampleAmbience(elapsed);
  fx.setNightIntensity(computeNightIntensity(atmosphere.phase, atmosphere.phaseProgress));
  if (gameRoot.dataset.phase !== atmosphere.phase) gameRoot.dataset.phase = atmosphere.phase;
  if (gameRoot.dataset.weather !== atmosphere.weather) gameRoot.dataset.weather = atmosphere.weather;
  // Keep the key-light direction stable: the cached shadow map then stays in
  // step with every surface while sky and light colour carry the time-of-day.
  const isFlying = flightState !== 'grounded';
  const moveSpeed = isFlying ? 5.4 : 4.2;
  const movement = new T.Vector3();

  if (overlay.hidden && !ownGarden.editing) {
    if (target) {
      movement.copy(target).sub(angel.position).setY(0);
      if (movement.length() < .2) { target = null; movement.set(0, 0, 0); }
      else movement.normalize();
    } else {
      const x = Number(keys.has('d') || keys.has('ArrowRight')) - Number(keys.has('a') || keys.has('ArrowLeft'));
      const z = Number(keys.has('s') || keys.has('ArrowDown')) - Number(keys.has('w') || keys.has('ArrowUp'));
      movement.set(x * .84 + z * .54, 0, z * .84 - x * .54).normalize();
    }
    if (movement.lengthSq()) {
      if (now < activeEmbraceStart + EMBRACE_DURATION_MS) {
        // Player steps out of embrace smoothly
        activeEmbraceStart = 0;
        angel.userData.isEmbracing = false;
        gor.userData.isEmbracing = false;
        angel.userData.emoteUntil = 0;
        gor.userData.emoteUntil = 0;
        if (!handHoldingActive) {
          fx.setHandHoldConnection(angel.position, gor.position, false);
        }
      }
      markPlayerActive(now);
      const stepDist = target
        ? Math.min(dt * moveSpeed, target.clone().setY(angel.position.y).distanceTo(angel.position))
        : dt * moveSpeed;
      angel.position.addScaledVector(movement, stepDist);
      walkDistance += stepDist;
      footstepAccumulator += stepDist;
      const bounds = worldBounds();
      const dx = angel.position.x - bounds.x, dz = angel.position.z - bounds.z, distance = Math.hypot(dx, dz);
      if (distance > bounds.r) { angel.position.x = bounds.x + dx * bounds.r / distance; angel.position.z = bounds.z + dz * bounds.r / distance; }

      // Physical obstacles (trees, central pond, structures) block ground movement
      if (!isFlying || baseAltitude < 1.2) {
        const resolved = resolveObstacleCollision(
          { x: angel.position.x, z: angel.position.z },
          0.38,
          districtWorld.obstacles
        );
        angel.position.x = resolved.x;
        angel.position.z = resolved.z;
      }
      faceDirection(angel, movement);

      // Banking physics computation
      currentHeadingAngle = Math.atan2(movement.x, movement.z);
      let dAngle = currentHeadingAngle - lastHeadingAngle;
      while (dAngle > Math.PI) dAngle -= Math.PI * 2;
      while (dAngle < -Math.PI) dAngle += Math.PI * 2;
      const turnRate = dAngle / Math.max(0.001, dt);
      lastHeadingAngle = currentHeadingAngle;
      bankAngle = calculateBankingRoll(bankAngle, isFlying ? turnRate : 0, dt);
    } else {
      bankAngle = calculateBankingRoll(bankAngle, 0, dt);
    }

    if (isFlying) {
      if (keys.has(' ') || keys.has('r') || keys.has('KeyR')) {
        targetAltitude = adjustFlightAltitude(targetAltitude, dt * 4.5);
      }
      if (keys.has('c') || keys.has('q') || keys.has('KeyC') || keys.has('ShiftLeft') || keys.has('ShiftRight')) {
        targetAltitude = adjustFlightAltitude(targetAltitude, -dt * 4.5);
      }
    }

    const companionOnMoment = updateAutonomousCompanion(now, dt);
    const follow = angel.position.clone().sub(gor.position).setY(0);
    if (!companionOnMoment) {
      if (handHoldingActive) {
        // Synchronized side-by-side positioning
        const heading = (angel.userData.direction as T.Vector3).clone().setY(0);
        if (heading.lengthSq() < 1e-4) heading.set(0, 0, 1);
        heading.normalize();
        const lateral = calculateSideBySideOffset(heading, 0.82);
        const desiredGorPos = angel.position.clone()
          .add(new T.Vector3(lateral.x * handSideSign, 0, lateral.z * handSideSign));
        desiredGorPos.y = planetElevation(desiredGorPos.x, desiredGorPos.z) + Math.max(0, isFlying ? baseAltitude : 0);

        const blend = reducedMotion ? 1 : Math.min(1, dt * (isFlying ? 14 : 12));
        gor.position.lerp(desiredGorPos, blend);

        const isMoving = movement.lengthSq() > 0;
        if (isMoving) {
          faceDirection(gor, heading);
        } else if (now - lastPlayerActiveTime > 1200) {
          // Standing still hand-in-hand: Gorastakh turns to gaze affectionately at Angel
          const toAngel = angel.position.clone().sub(gor.position).setY(0);
          if (toAngel.lengthSq() > 0.01) {
            faceDirection(gor, toAngel.normalize());
          }
        } else {
          faceDirection(gor, heading);
        }

        // Break handholding if separated beyond 4.2m
        if (isHandHoldDetached(angel.position.distanceTo(gor.position), 4.2)) {
          toggleHandHolding(false);
        }
      } else if (now < (gor.userData.walkTogetherUntil ?? 0)) {
        // Side-by-side stroll together (walk action)
        const heading = (angel.userData.direction as T.Vector3).clone().setY(0);
        if (heading.lengthSq() < 1e-4) heading.set(0, 0, 1);
        heading.normalize();
        const isMoving = movement.lengthSq() > 0;
        if (isMoving) {
          const lateral = calculateSideBySideOffset(heading, 0.86);
          const desiredPos = angel.position.clone()
            .add(new T.Vector3(lateral.x * handSideSign, 0, lateral.z * handSideSign))
            .addScaledVector(heading, -0.08);
          desiredPos.y = planetElevation(desiredPos.x, desiredPos.z);
          gor.position.lerp(desiredPos, Math.min(1, dt * 8.5));
          faceDirection(gor, heading);
        } else {
          const toAngel = angel.position.clone().sub(gor.position).setY(0);
          if (toAngel.length() > 1.05) {
            gor.position.addScaledVector(toAngel.normalize(), Math.min(toAngel.length() - 0.95, dt * 2.5));
          }
          if (toAngel.lengthSq() > 0.01) {
            faceDirection(gor, toAngel.normalize());
          }
        }
      } else if (follow.length() > 1.45) {
        const step = Math.min(dt * 3.4, follow.length() - 1.25);
        gor.position.addScaledVector(follow.normalize(), step);
        if (follow.lengthSq() > .02) faceDirection(gor, follow.normalize());
      }

      if (!isFlying || baseAltitude < 1.2) {
        const resolvedGor = resolveObstacleCollision(
          { x: gor.position.x, z: gor.position.z },
          0.38,
          districtWorld.obstacles
        );
        gor.position.x = resolvedGor.x;
        gor.position.z = resolvedGor.z;
      }
    }
  }

  // Idle awareness timer
  updateCompanionIdleAwareness(now);

  // Flight Altitude Dynamics
  baseAltitude = calculateFlightAltitude(baseAltitude, targetAltitude, dt, 3.5, 3.5);
  if (flightState === 'ascending' && Math.abs(baseAltitude - targetAltitude) < 0.15) {
    flightState = 'cruising';
  } else if (flightState === 'descending' && baseAltitude <= 0.04) {
    flightState = 'grounded';
    baseAltitude = 0;
    audioEngine.playFlightLanding();
    const flightBtn = $<HTMLButtonElement>('flight-toggle-btn');
    flightBtn?.setAttribute('aria-pressed', 'false');
    if (flightBtn) flightBtn.textContent = 'پرواز';
    $<HTMLButtonElement>('flight-ascend-btn')?.setAttribute('hidden', '');
    $<HTMLButtonElement>('flight-descend-btn')?.setAttribute('hidden', '');
    setStatus('به آرامی روی سبزه فرود آمدید.');
  }

  // Buoyant hovering oscillation
  const hoverAmp = isFlying && !reducedMotion ? 0.12 * Math.min(1, baseAltitude / 2) : 0;
  const angelY = baseAltitude + Math.sin(elapsed * 1.8) * hoverAmp;
  const gorY = baseAltitude + Math.sin(elapsed * 1.8 + 0.45) * hoverAmp;
  const angelGroundY = planetElevation(angel.position.x, angel.position.z);
  const gorGroundY = planetElevation(gor.position.x, gor.position.z);
  angel.position.y = angelGroundY + Math.max(0, angelY);
  gor.position.y = gorGroundY + Math.max(0, gorY);

  // Dynamic Camera Focus Y-Tracking & Horizon Expansion
  characterMidpoint.copy(angel.position).add(gor.position).multiplyScalar(0.5);
  const focus = ownGarden.editing
    ? ownGarden.focus.clone().setY(0)
    : new T.Vector3(characterMidpoint.x, calculateCameraFocusY(characterMidpoint.y, 0.82), characterMidpoint.z);

  cameraFocus.lerp(focus, reducedMotion ? 1 : 1 - Math.exp(-dt * 2.5));
  if (ownGarden.editing && innerWidth < 700) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * .18, innerWidth, innerHeight);
  else if (camera.view?.enabled) camera.clearViewOffset();

  const horizonScale = 1.0 + 0.14 * (characterMidpoint.y / 4.0);
  const offset = ownGarden.editing
    ? new T.Vector3(11, 16, 15).multiplyScalar(Math.max(1, state.plotLevel / 2))
    : innerWidth < 700 ? new T.Vector3(14, 20, 23) : new T.Vector3(16, 21, 25);
  viewScale = T.MathUtils.lerp(viewScale, wideView && !ownGarden.editing ? 1.62 : 1, reducedMotion ? 1 : Math.min(1, dt * 4));
  camera.position.copy(cameraFocus).add(offset.multiplyScalar(zoom * viewScale * horizonScale));
  camera.lookAt(cameraFocus);
  camera.updateMatrixWorld();

  const isEmbracing = now < activeEmbraceStart + EMBRACE_DURATION_MS;
  if (isEmbracing) {
    const embraceProgress = (now - activeEmbraceStart) / EMBRACE_DURATION_MS;
    const { approachFactor } = calculateEmbraceTransform(embraceProgress);
    const toGor = gor.position.clone().sub(angel.position).setY(0);
    const dist = toGor.length();
    if (dist > 0.001) {
      const dir = toGor.clone().normalize();
      faceDirection(angel, dir);
      faceDirection(gor, dir.clone().negate());

      const targetDistance = 0.52;
      if (dist > targetDistance) {
        const step = Math.min(dist - targetDistance, dt * 3.2 * approachFactor);
        angel.position.addScaledVector(dir, step * 0.45);
        gor.position.addScaledVector(dir, -step * 0.55);
      }
    }

    const embraceMidpoint = angel.position.clone().add(gor.position).multiplyScalar(0.5);
    embraceMidpoint.y = planetElevation(embraceMidpoint.x, embraceMidpoint.z);
    if (now - lastEmbraceParticleTime > 150) {
      lastEmbraceParticleTime = now;
      fx.spawnEmbraceWarmth?.(embraceMidpoint);
    }
  }

  for (const [actor, index] of [[angel, 0], [gor, 1]] as const) {
    const sprite = actor.userData.sprite as T.Sprite;
    const ghost = actor.userData.ghost as T.Sprite;
    actor.userData.fade = Math.min(1, actor.userData.fade + dt / .16);
    sprite.material.opacity = actor.userData.fade;
    ghost.material.opacity = 1 - actor.userData.fade;
    ghost.visible = actor.userData.fade < 1;
    ghost.material.rotation = sprite.material.rotation;
    const emote = now < actor.userData.emoteUntil;
    const kind = actor.userData.emoteKind as string;
    const sitting = emote && kind === 'sit';
    const pulse = emote && !reducedMotion ? Math.sin(now * .018) : 0;
    sprite.scale.y = sitting ? 2.48 : 2.8;
    ghost.scale.copy(sprite.scale);

    // Synchronized bobbing
    const isWalkingTogether = handHoldingActive || (now < (gor.userData.walkTogetherUntil ?? 0));
    const bob = isFlying
      ? Math.sin(elapsed * 2.5 + index * 0.3) * 0.03
      : isWalkingTogether
      ? Math.abs(Math.sin(walkDistance * 9.5)) * 0.035
      : Math.sin(elapsed * 5 + index) * 0.025;

    sprite.position.y = (sitting ? 1.28 : 1.45) + (emote ? Math.max(0, pulse) * (kind === 'sit' ? .025 : .2) : bob);

    if (reducedMotion) {
      sprite.material.rotation = 0;
    } else if (isEmbracing) {
      const embraceProgress = (now - activeEmbraceStart) / EMBRACE_DURATION_MS;
      const { tiltAngle } = calculateEmbraceTransform(embraceProgress);
      const angelScreenX = angel.position.clone().project(camera).x;
      const gorScreenX = gor.position.clone().project(camera).x;
      const gorIsOnRight = gorScreenX >= angelScreenX;
      const tiltDirection = (index === 0 ? (gorIsOnRight ? -1 : 1) : (gorIsOnRight ? 1 : -1));
      sprite.material.rotation = tiltDirection * tiltAngle;
    } else if (isFlying) {
      sprite.material.rotation = bankAngle;
    } else if (kind === 'wave' && emote) {
      sprite.material.rotation = pulse * .08;
    } else {
      sprite.material.rotation = Math.sin(elapsed * 2 + index) * .018;
    }

    const shadow = actor.children[1] as T.Mesh;
    const actorAltitude = actor.position.y - planetElevation(actor.position.x, actor.position.z);
    const shadowParams = calculateShadowParams(actorAltitude);
    shadow.position.y = -actor.position.y + planetElevation(actor.position.x, actor.position.z) + shadowParams.y;
    shadow.scale.setScalar(shadowParams.scale * (1 + Math.max(0, pulse) * .15));
    (shadow.material as T.MeshBasicMaterial).opacity = shadowParams.opacity;
  }

  // Update adult romance vignette
  if (vignetteState.active) {
    vignetteState = updateVignetteState(vignetteState, now);
    if (!vignetteState.active && vignetteEl) {
      vignetteEl.classList.remove('active');
    }
  }

  nearestCompanion = angel.position.distanceTo(gor.position) < 2.35;
  const interaction = $<HTMLButtonElement>('interact');
  interaction.disabled = !nearestCompanion;
  interaction.textContent = nearestCompanion ? 'سلام' : 'نزدیک شو';
  interaction.setAttribute('aria-label', nearestCompanion ? 'صحبت با گوراستاخ' : 'برای صحبت، به گوراستاخ نزدیک شو');
  districtWorld.tick(elapsed, reducedMotion, atmosphere.windStrength);
  fauna.update(elapsed, dt, reducedMotion);
  fx.update(dt, now);
  fx.updateRibbonTrails(angel.position, gor.position, isFlying);

  // Compute hand anchors for luminous beam
  const hands = computeHandPositions(angel.position, gor.position);
  angelHandPos.set(hands.angelHand.x, hands.angelHand.y, hands.angelHand.z);
  gorHandPos.set(hands.gorHand.x, hands.gorHand.y, hands.gorHand.z);
  fx.setHandHoldConnection(angelHandPos, gorHandPos, handHoldingActive || (now < activeEmbraceStart + EMBRACE_DURATION_MS));

  // Footstep decals
  if (!isFlying && (movement.lengthSq() > 0 || now < (gor.userData.walkTogetherUntil ?? 0))) {
    if (footstepAccumulator >= 0.65) {
      footstepAccumulator -= 0.65;
      leftFoot = !leftFoot;
      const heading = (angel.userData.direction as T.Vector3).clone().setY(0);
      if (heading.lengthSq() < 1e-4) heading.set(0, 0, 1);
      heading.normalize();
      const footSide = new T.Vector3(heading.z, 0, -heading.x).multiplyScalar(leftFoot ? 0.12 : -0.12);
      fx.spawnFootstepGlow(angel.position.clone().add(footSide));
      if (handHoldingActive || now < (gor.userData.walkTogetherUntil ?? 0)) {
        fx.spawnFootstepGlow(gor.position.clone().add(footSide));
      }
    }
  }
  noticeFreshBlooms(Date.now());
  ownGarden.tick(Date.now());
  if (scene.background instanceof T.Color) {
    const blend = reducedMotion ? 1 : 1 - Math.exp(-dt * .3);
    skyColorTarget.set(atmosphere.skyColor).lerp(ambienceTarget, .14);
    fogColorTarget.set(atmosphere.fogColor);
    hemisphereColorTarget.set(atmosphere.hemisphereColor);
    groundHemisphereColorTarget.copy(hemisphereColorTarget).lerp(groundHemisphereBase, .42);
    sunColorTarget.set(atmosphere.sunColor);
    scene.background.lerp(skyColorTarget, blend);
    if (scene.fog instanceof T.Fog) scene.fog.color.lerp(fogColorTarget, blend);
    skyLight.color.lerp(hemisphereColorTarget, blend);
    skyLight.groundColor.lerp(groundHemisphereColorTarget, blend);
    sun.color.lerp(sunColorTarget, blend);
    sun.intensity = T.MathUtils.lerp(sun.intensity, 2 + atmosphere.sunIntensity * .32, blend);
    skyLight.intensity = T.MathUtils.lerp(skyLight.intensity, 1.48 + atmosphere.sunIntensity * .16, blend);
    softFill.intensity = T.MathUtils.lerp(softFill.intensity, .46 + atmosphere.sunIntensity * .09, blend);
  }
  if (!reducedMotion && atmosphere.rainStrength > .015) {
    rainStreaks.visible = true;
    rainMaterial.opacity = atmosphere.rainStrength * .58;
    rainStreaks.position.set(angel.position.x, 0, angel.position.z);
    const positions = rainGeometry.getAttribute('position') as T.BufferAttribute;
    for (let i = 0; i < rainDropCount; i++) {
      const at = i * 2;
      let y = positions.getY(at) - rainSpeeds[i] * dt;
      if (y < .4) y += 17.5;
      const x = positions.getX(at) + atmosphere.windStrength * dt * .18;
      const z = positions.getZ(at);
      positions.setXYZ(at, x, y, z);
      positions.setXYZ(at + 1, x + .035, y - .24, z);
    }
    positions.needsUpdate = true;
  } else {
    rainStreaks.visible = false;
    rainMaterial.opacity = 0;
  }
  const waterDistance = Math.hypot(angel.position.x, angel.position.z);
  audioEngine.updateAmbience(atmosphere.windStrength, atmosphere.rainStrength, waterDistance);
  renderer.render(scene, camera);
}

function applyAppearance() {
  for (const actor of visualActors) {
    const texture = actor.userData.texture as T.Texture;
    const atlas = selectedAtlas(actor.userData.angel, actor.userData.sector % 2 === 1);
    actor.userData.fade = 1;
    (actor.userData.ghost as T.Sprite).material.opacity = 0;
    // Every save (planting, building, closing a dialog) runs this, but a source
    // swap re-uploads the whole sheet, so only pay for it on a real change and
    // release the old GPU texture first.
    if (texture.source !== atlas.source) {
      texture.dispose();
      texture.source = atlas.source;
      texture.needsUpdate = true;
    }
    selectedAtlas(actor.userData.angel, actor.userData.sector % 2 !== 1);
  }
}

function updateWorld() {
  renderer.shadowMap.needsUpdate = true;
  syncGardenTransform();
  districtWorld.sync(state);
  applyAppearance();
}

// The same save key and decoder keep earlier gardens, profiles, and characters intact.
districtWorld.activate('garden');
updateWorld();
renderer.setAnimationLoop(animate);

// Offline shell. This is the only place this file touches the service worker
// lifecycle; the manifest link in index.html is the gate, so the single-file
// `play.html` build (which has no manifest and must make zero requests) never
// registers a worker, and `file:` is skipped outright. Every failure is
// swallowed: a browser that refuses service workers must not break the garden.
if (
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  (location.protocol === 'http:' || location.protocol === 'https:') &&
  document.querySelector('link[rel="manifest"]')
) {
  window.addEventListener('load', () => {
    try {
      navigator.serviceWorker.register('/sw.js').catch(() => { /* offline shell is optional */ });
    } catch { /* offline shell is optional */ }
  });
}
