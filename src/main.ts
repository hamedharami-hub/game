import * as T from 'three';
import './style.css';
import { directionFrame } from './directions';
import { createGarden } from './garden';
import { sampleAmbience } from './ambience';
import { initialState, decodeSave, storageKey, placeDecoration, decorationPosition, growthStage, regionSlots, furnishings, species, setAppearance, hairColors, outfits, type Furnishing, type HairColor, type Outfit } from './state';
import type { State } from './state';
import { lookAssets, diagonalAssets } from './appearance';
import { createWorld } from './world';

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
      <button id="camera-view" class="glass" aria-pressed="false" aria-label="تغییر نمای دوربین">نمای باز</button>
    </nav>
  </header>
  <footer class="world-footer">
    <span id="ambient-status" role="status" aria-live="polite">باغ آمادهٔ کاشت و چیدمان است.</span>
    <button id="interact" class="primary" aria-label="صحبت با گوراستاخ" title="صحبت با گوراستاخ" disabled>سلام</button>
  </footer>
  <div id="overlay" hidden></div>
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

type AmbientAudio = { context: AudioContext; wind: GainNode; rain: GainNode };
let ambientAudio: AmbientAudio | null = null;
let lastAudioUpdate = 0;
function enableAmbientAudio() {
  if (ambientAudio || !window.AudioContext) return;
  try {
    const context = new AudioContext();
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const noise = buffer.getChannelData(0);
    let seed = 0x731a4d;
    for (let i = 0; i < noise.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      noise[i] = (seed / 4294967296 - 0.5) * 0.48;
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const master = context.createGain();
    master.gain.value = 0.55;
    master.connect(context.destination);

    const windFilter = context.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 520;
    const wind = context.createGain();
    wind.gain.value = 0;
    source.connect(windFilter).connect(wind).connect(master);

    const rainFilter = context.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 1350;
    const rain = context.createGain();
    rain.gain.value = 0;
    source.connect(rainFilter).connect(rain).connect(master);

    source.start();
    ambientAudio = { context, wind, rain };
    void context.resume().catch(() => {});
  } catch { /* Audio is optional; the visual atmosphere remains complete. */ }
}

function updateAmbientAudio(windStrength: number, rainStrength: number, now: number) {
  if (!ambientAudio || now - lastAudioUpdate < 450) return;
  lastAudioUpdate = now;
  const at = ambientAudio.context.currentTime;
  ambientAudio.wind.gain.setTargetAtTime(.0035 + windStrength * .0045, at, .7);
  ambientAudio.rain.gain.setTargetAtTime(rainStrength * .008, at, .9);
}

document.addEventListener('pointerdown', enableAmbientAudio, { once: true, passive: true });
window.addEventListener('keydown', enableAmbientAudio, { once: true });
document.addEventListener('visibilitychange', () => {
  if (!ambientAudio) return;
  if (document.hidden) void ambientAudio.context.suspend().catch(() => {});
  else void ambientAudio.context.resume().catch(() => {});
});

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
    atlasCache.set(url, atlas);
  }
  return atlas;
}
function character(isAngel: boolean) {
  const group = new T.Group();
  const texture = selectedAtlas(isAngel).clone();
  texture.needsUpdate = true;
  texture.repeat.set(.25, .5);
  texture.offset.set(0, isAngel ? .5 : 0);
  const sprite = new T.Sprite(new T.SpriteMaterial({ map: texture, transparent: true, alphaTest: .03, depthWrite: false }));
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
  const ghost = new T.Sprite(new T.SpriteMaterial({ map: ghostTexture, transparent: true, opacity: 0, alphaTest: .03, depthWrite: false }));
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
  texture.offset.x = frame.column * .25;
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

const socialLines: Record<'wave' | 'sit' | 'walk', string[]> = {
  wave: ['به گوراستاخ سلام کردی.', 'گوراستاخ جواب سلام داد.', 'با هم سلام کردید.'],
  sit: ['کنار هم نشستید.', 'کمی استراحت کردید.', 'با هم مکث کردید.'],
  walk: ['با هم قدم زدید.', 'قدم‌زدن کوتاه.', 'مسیر تازه‌ای دیدید.'],
};
function socialAction(kind: 'wave' | 'sit' | 'walk') {
  cancelCompanionMoments();
  closeDialog();
  const line = socialLines[kind][socialBeat++ % socialLines[kind].length];
  const until = performance.now() + (kind === 'walk' ? 2200 : 1250);
  angel.userData.emoteUntil = until;
  gor.userData.emoteUntil = until;
  angel.userData.emoteKind = kind;
  gor.userData.emoteKind = kind;
  if (kind === 'walk') gor.userData.walkTogetherUntil = until;
  setStatus(line);
}
function peopleDialog(returnFocus: HTMLElement = $('people-action')) {
  cancelCompanionMoments();
  dialog('همراهان', '', `<div class="companion-actions"><button data-social="wave">سلام</button><button data-social="sit">کمی بنشینیم</button><button data-social="walk">با هم قدم بزنیم</button><button id="appearance-action">تغییر ظاهر</button></div>`, returnFocus);
  for (const button of overlay.querySelectorAll<HTMLButtonElement>('[data-social]')) {
    button.onclick = () => socialAction(button.dataset.social as 'wave' | 'sit' | 'walk');
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
$('people-action').onclick = () => peopleDialog($('people-action'));
$('plant-action').onclick = () => { cancelCompanionMoments(); closeDialog(); ownGarden.open(); };
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
renderer.domElement.addEventListener('pointerdown', event => { pointerStart = { x: event.clientX, y: event.clientY }; });
renderer.domElement.addEventListener('pointerup', event => {
  if (!overlay.hidden || Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 12) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (ownGarden.editing) { ownGarden.hit(raycaster); return; }
  if (ownGarden.owns(raycaster)) { ownGarden.open(); ownGarden.hit(raycaster); return; }
  if (raycaster.intersectObject(gor, true).length) {
    cancelCompanionMoments();
    if (nearestCompanion) peopleDialog($('interact'));
    else setStatus('گوراستاخ کمی دورتر است؛ با حرکت به او نزدیک شو.');
    return;
  }
  const hit = raycaster.intersectObject(districtWorld.ground)[0];
  if (!hit) return;
  cancelCompanionMoments();
  target = hit.point.clone();
  target.y = 0;
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
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(event.key)) {
    event.preventDefault(); cancelCompanionMoments(); keys.add(event.key); target = null;
  }
  if (event.key.toLowerCase() === 'e' && nearestCompanion) $('interact').click();
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
  if (gameRoot.dataset.phase !== atmosphere.phase) gameRoot.dataset.phase = atmosphere.phase;
  if (gameRoot.dataset.weather !== atmosphere.weather) gameRoot.dataset.weather = atmosphere.weather;
  const solarAngle = (elapsed / (18 * 60)) * Math.PI * 2;
  sun.position.set(Math.cos(solarAngle) * 16, 22 + Math.max(0, Math.sin(solarAngle)) * 4, Math.sin(solarAngle) * 10);
  if (overlay.hidden && !ownGarden.editing) {
    const movement = new T.Vector3();
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
      angel.position.addScaledVector(movement, target ? Math.min(dt * 4.2, target.clone().setY(angel.position.y).distanceTo(angel.position)) : dt * 4.2);
      const bounds = worldBounds();
      const dx = angel.position.x - bounds.x, dz = angel.position.z - bounds.z, distance = Math.hypot(dx, dz);
      if (distance > bounds.r) { angel.position.x = bounds.x + dx * bounds.r / distance; angel.position.z = bounds.z + dz * bounds.r / distance; }
      faceDirection(angel, movement);
    }
    const companionOnMoment = updateAutonomousCompanion(now, dt);
    const follow = angel.position.clone().sub(gor.position).setY(0);
    if (!companionOnMoment) {
      if (now < (gor.userData.walkTogetherUntil ?? 0)) {
        const side = new T.Vector3(-follow.z, 0, follow.x).normalize();
        gor.position.addScaledVector(side, Math.sin(now * .004) * dt * 1.5);
      } else if (follow.length() > 1.55) {
        const step = Math.min(dt * 3.2, follow.length() - 1.45);
        gor.position.addScaledVector(follow.normalize(), step);
      }
      if (follow.lengthSq() > .02) faceDirection(gor, follow.normalize());
    }
  }
  const focus = ownGarden.editing ? ownGarden.focus.clone() : angel.position.clone();
  focus.y = 0;
  cameraFocus.lerp(focus, reducedMotion ? 1 : 1 - Math.exp(-dt * 2));
  if (ownGarden.editing && innerWidth < 700) camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * .18, innerWidth, innerHeight);
  else if (camera.view?.enabled) camera.clearViewOffset();
  const offset = ownGarden.editing
    ? new T.Vector3(11, 16, 15).multiplyScalar(Math.max(1, state.plotLevel / 2))
    : innerWidth < 700 ? new T.Vector3(14, 20, 23) : new T.Vector3(16, 21, 25);
  viewScale = T.MathUtils.lerp(viewScale, wideView && !ownGarden.editing ? 1.62 : 1, reducedMotion ? 1 : Math.min(1, dt * 4));
  camera.position.copy(cameraFocus).add(offset.multiplyScalar(zoom * viewScale));
  camera.lookAt(cameraFocus);
  camera.updateMatrixWorld();

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
    sprite.position.y = (sitting ? 1.28 : 1.45) + (emote ? Math.max(0, pulse) * (kind === 'sit' ? .025 : .2) : Math.sin(elapsed * 5 + index) * .025);
    sprite.material.rotation = reducedMotion ? 0 : (kind === 'wave' && emote ? pulse * .08 : Math.sin(elapsed * 2 + index) * .018);
    const shadow = actor.children[1] as T.Mesh;
    shadow.scale.setScalar(1 + Math.max(0, pulse) * .15);
  }
  nearestCompanion = angel.position.distanceTo(gor.position) < 2.35;
  const interaction = $<HTMLButtonElement>('interact');
  interaction.disabled = !nearestCompanion;
  interaction.textContent = nearestCompanion ? 'سلام' : 'نزدیک شو';
  interaction.setAttribute('aria-label', nearestCompanion ? 'صحبت با گوراستاخ' : 'برای صحبت، به گوراستاخ نزدیک شو');
  districtWorld.tick(elapsed, reducedMotion, atmosphere.windStrength);
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
  updateAmbientAudio(atmosphere.windStrength, atmosphere.rainStrength, now);
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
