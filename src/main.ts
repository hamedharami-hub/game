import * as T from 'three';
import './style.css';
import { directionFrame } from './directions';
import { createGarden } from './garden';
import { sampleAmbience } from './ambience';
import { initialState, decodeSave, storageKey, placeDecoration, decorationPosition, growthStage, regionSlots, furnishings, species, setAppearance, hairColors, outfits, type Furnishing, type HairColor, type Outfit, type District } from './state';
import type { State } from './state';
import { lookAssets, diagonalAssets } from './appearance';
import { createWorld, districts } from './world';
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
    <nav class="action-bar" aria-label="کارهای باغ">
      <button id="plant-action" class="glass" aria-label="کاشت گل">کاشت</button>
      <button id="build-action" class="glass" aria-label="چیدمان باغ">چیدمان</button>
      <button id="people-action" class="glass" aria-label="دیدار با همراهان">همراه‌ها</button>
      <button id="flight-toggle-btn" class="glass" aria-pressed="false" aria-label="پرواز دونفره">پرواز</button>
      <button id="flight-ascend-btn" class="glass flight-altitude-btn" aria-label="افزایش ارتفاع پرواز" hidden>▲ اوج</button>
      <button id="flight-descend-btn" class="glass flight-altitude-btn" aria-label="کاهش ارتفاع پرواز" hidden>▼ فرود</button>
      <button id="world-map-action" class="glass" aria-label="نقشهٔ سیاره">سیاره 🧭</button>
      <button id="camera-view" class="glass" aria-pressed="false" aria-label="تغییر نمای دوربین">نمای باز</button>
    </nav>
  </header>
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
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
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
      const flower = new T.Vector3(-2 + plant.col - 3.5, 0, 14 + plant.row - 3.5);
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

const atlasCache = new Map<string, T.Texture>();
const visualActors: T.Group[] = [];
function selectedAtlas(isAngel: boolean, diagonal = false) {
  const hair = isAngel ? state.angelHair : state.gorHair;
  const outfit = isAngel ? state.angelOutfit : state.gorOutfit;
  const url = (diagonal ? diagonalAssets : lookAssets)[outfit][hair];
  let atlas = atlasCache.get(url);
  if (!atlas) {
    atlas = new T.TextureLoader().load(url, loaded => {
      for (const actor of visualActors) for (const texture of [actor.userData.texture, actor.userData.ghostTexture] as T.Texture[]) {
        if (texture?.source === loaded.source) texture.needsUpdate = true;
      }
    });
    atlas.colorSpace = T.SRGBColorSpace;
    atlas.wrapS = T.ClampToEdgeWrapping;
    atlas.wrapT = T.ClampToEdgeWrapping;
    atlasCache.set(url, atlas);
  }
  return atlas;
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
  ghostTexture.source = texture.source;
  ghostTexture.offset.copy(texture.offset);
  ghostTexture.needsUpdate = true;
  texture.source = selectedAtlas(actor.userData.angel, frame.diagonal).source;
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
      const flower = new T.Vector3(-2 + newPlant.col - 3.5, 0, 14 + newPlant.row - 3.5);
      queueCompanionMoment('flower', flower, 'wave', 'گوراستاخ کنار گل تازه مکث کرد.', 1.2);
    } else if (next.essence > previous.essence) setStatus('گل برداشت شد.');
  },
  () => { target = null; keys.clear(); cancelCompanionMoments(); },
  () => { keys.clear(); },
  () => { ownGarden.close(); openBuild(); },
);
function buildDialog() {
  const kinds = Object.keys(furnishings) as Furnishing[];
  const choices = kinds.map(kind => `<button data-furnishing="${kind}" aria-label="ساخت ${furnishings[kind].name}">${furnishings[kind].name}</button>`).join('');
  dialog('چیدمان باغ', '', choices, $('build-action'));
  for (const button of overlay.querySelectorAll<HTMLButtonElement>('[data-furnishing]')) {
    button.onclick = () => {
      const kind = button.dataset.furnishing as Furnishing;
      const occupied = new Set(state.decorations.filter(item => item.district === 'garden').map(item => item.slot));
      const slot = Array.from({ length: regionSlots(state.regionLevels.garden) }, (_, index) => index).find(index => !occupied.has(index));
      if (slot === undefined) { setStatus('باغ جا برای سازهٔ تازه ندارد.'); return; }
      const next = placeDecoration(state, 'garden', slot, kind);
      if (next === state) { setStatus('سازه هنوز آمادهٔ ساخت نیست.'); return; }
      state = next;
      save();
      setStatus(`${furnishings[kind].name} به باغ اضافه شد.`);
      const local = decorationPosition('garden', slot, state.worldSeed);
      const focus = new T.Vector3(-2 + local.x * .43, 0, 14 + local.z * .43);
      const standOff = kind === 'pavilion' ? 3 : kind === 'arbor' ? 2 : 1.7;
      queueCompanionMoment(
        'decoration',
        focus,
        kind === 'pavilion' || kind === 'arbor' ? 'sit' : 'wave',
        kind === 'pavilion' || kind === 'arbor' ? 'گوراستاخ کنار سازه کمی استراحت کرد.' : 'گوراستاخ برای دیدن سازه نزدیک شد.',
        standOff,
      );
      buildDialog();
    };
  }
}
function openBuild() {
  cancelCompanionMoments();
  activeDialogReturn = $('build-action');
  buildDialog();
}
$('build-action').onclick = openBuild;

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
function openPlanetaryMap(returnFocus: HTMLElement = $('world-map-action')) {
  cancelCompanionMoments();
  markPlayerActive();
  const districtList = (Object.entries(districts) as [District, typeof districts[District]][]).map(([id, d]) => {
    return `<button class="district-btn" data-district="${id}" style="border-right: 4px solid ${d.color}; display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; margin: 8px 0; width: 100%; border-radius: 8px; background: rgba(255,255,255,0.85); cursor: pointer; text-align: right; border: 1px solid rgba(0,0,0,0.08); font-family: inherit;">
      <div>
        <div style="font-weight: 700; font-size: 1.05rem; color: #1e3328;">${d.icon} ${d.name}</div>
        <div style="font-size: 0.82rem; color: #4a6358;">${d.subtitle}</div>
      </div>
      <span style="font-size: 0.85rem; color: #2e6b52; font-weight: 600;">پرواز به اینجا ✦</span>
    </button>`;
  }).join('');

  dialog(
    'سفر در سیارهٔ دوشاخ‌ها',
    `<p style="margin-bottom: 12px; font-size: 0.9rem; opacity: 0.9;">مکان مورد نظر برای پرواز و گردش دونفره را انتخاب کنید:</p><div class="districts-grid">${districtList}</div>`,
    '',
    returnFocus,
  );

  for (const btn of overlay.querySelectorAll<HTMLButtonElement>('[data-district]')) {
    btn.onclick = () => {
      const id = btn.dataset.district as District;
      closeDialog();
      fastTravelToDistrict(id);
    };
  }
}

function fastTravelToDistrict(id: District) {
  const d = districts[id];
  if (!d) return;
  cancelCompanionMoments();
  markPlayerActive();

  audioEngine.playBloomChime();

  const flash = document.createElement('div');
  flash.style.position = 'fixed';
  flash.style.inset = '0';
  flash.style.background = 'radial-gradient(circle, rgba(255,255,255,0.88) 0%, rgba(200,240,230,0.65) 60%, transparent 100%)';
  flash.style.opacity = '0';
  flash.style.transition = 'opacity 0.35s ease';
  flash.style.pointerEvents = 'none';
  flash.style.zIndex = '999';
  document.body.appendChild(flash);

  requestAnimationFrame(() => {
    flash.style.opacity = '1';
    setTimeout(() => {
      const elev = planetElevation(d.x, d.z);
      angel.position.set(d.x, elev, d.z);
      gor.position.set(d.x + 1.2, elev, d.z + 0.3);
      target = null;
      cameraFocus.set(d.x, elev, d.z);
      districtWorld.activate(id);
      setStatus(`دست در دست هم با نوری آرام به «${d.name}» رسیدید.`);

      flash.style.opacity = '0';
      setTimeout(() => flash.remove(), 400);
    }, 350);
  });
}

$('world-map-action').onclick = () => openPlanetaryMap($('world-map-action'));
renderer.domElement.addEventListener('contextmenu', event => {
  event.preventDefault();
  openPlanetaryMap();
});

$('people-action').onclick = () => peopleDialog($('people-action'));
$('flight-toggle-btn').onclick = () => toggleFlight();
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
$('plant-action').onclick = () => { cancelCompanionMoments(); closeDialog(); if (flightState !== 'grounded') toggleFlight(false); ownGarden.open(); };
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
  if (ownGarden.editing) { ownGarden.hit(raycaster); return; }
  if (ownGarden.owns(raycaster)) { ownGarden.open(); ownGarden.hit(raycaster); return; }
  if (raycaster.intersectObject(gor, true).length) {
    cancelCompanionMoments();
    markPlayerActive();
    if (nearestCompanion) peopleDialog($('interact'));
    else setStatus('گوراستاخ کمی دورتر است؛ با حرکت به او نزدیک شو.');
    return;
  }
  const hit = raycaster.intersectObject(districtWorld.ground)[0];
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
  const solarAngle = (elapsed / (18 * 60)) * Math.PI * 2;
  sun.position.set(Math.cos(solarAngle) * 16, 22 + Math.max(0, Math.sin(solarAngle)) * 4, Math.sin(solarAngle) * 10);
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
    texture.source = selectedAtlas(actor.userData.angel, actor.userData.sector % 2 === 1).source;
    texture.needsUpdate = true;
    actor.userData.fade = 1;
    (actor.userData.ghost as T.Sprite).material.opacity = 0;
    selectedAtlas(actor.userData.angel, actor.userData.sector % 2 !== 1);
  }
}

function updateWorld() {
  renderer.shadowMap.needsUpdate = true;
  districtWorld.sync(state);
  applyAppearance();
}

// The same save key and decoder keep earlier gardens, profiles, and characters intact.
districtWorld.activate('garden');
districtWorld.sync(state);
renderer.setAnimationLoop(animate);
