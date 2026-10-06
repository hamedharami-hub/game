import * as T from 'three';
import './style.css';
import { directionFrame } from './directions';
import { createGarden } from './garden';
import { initialState, decodeSave, storageKey, placeDecoration, regionSlots, furnishings, species, setAppearance, hairColors, outfits, type Furnishing, type HairColor, type Outfit } from './state';
import type { State } from './state';
import { lookAssets, diagonalAssets } from './appearance';
import { createWorld } from './world';

const gameSaveKey = storageKey(new URLSearchParams(location.search).get('profile'));
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main>
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
scene.add(new T.HemisphereLight(0xfff3d7, 0x52785d, 1.65));
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
    } else if (next.essence > previous.essence) setStatus('گل برداشت شد.');
  },
  () => { target = null; keys.clear(); },
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
      buildDialog();
    };
  }
}
function openBuild() {
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
$('plant-action').onclick = () => { closeDialog(); ownGarden.open(); };
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
    if (nearestCompanion) peopleDialog($('interact'));
    else setStatus('گوراستاخ کمی دورتر است؛ با حرکت به او نزدیک شو.');
    return;
  }
  const hit = raycaster.intersectObject(districtWorld.ground)[0];
  if (!hit) return;
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
    event.preventDefault(); keys.add(event.key); target = null;
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
    const follow = angel.position.clone().sub(gor.position).setY(0);
    if (now < (gor.userData.walkTogetherUntil ?? 0)) {
      const side = new T.Vector3(-follow.z, 0, follow.x).normalize();
      gor.position.addScaledVector(side, Math.sin(now * .004) * dt * 1.5);
    } else if (follow.length() > 1.55) {
      const step = Math.min(dt * 3.2, follow.length() - 1.45);
      gor.position.addScaledVector(follow.normalize(), step);
    }
    if (follow.lengthSq() > .02) faceDirection(gor, follow.normalize());
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
    const pulse = emote && !reducedMotion ? Math.sin(now * .018) : 0;
    sprite.position.y = 1.45 + (emote ? Math.max(0, pulse) * (kind === 'sit' ? .04 : .2) : Math.sin(elapsed * 5 + index) * .025);
    sprite.material.rotation = reducedMotion ? 0 : (kind === 'wave' && emote ? pulse * .08 : Math.sin(elapsed * 2 + index) * .018);
    const shadow = actor.children[1] as T.Mesh;
    shadow.scale.setScalar(1 + Math.max(0, pulse) * .15);
  }
  nearestCompanion = angel.position.distanceTo(gor.position) < 2.35;
  const interaction = $<HTMLButtonElement>('interact');
  interaction.disabled = !nearestCompanion;
  interaction.textContent = nearestCompanion ? 'سلام' : 'نزدیک شو';
  interaction.setAttribute('aria-label', nearestCompanion ? 'صحبت با گوراستاخ' : 'برای صحبت، به گوراستاخ نزدیک شو');
  districtWorld.tick(elapsed, reducedMotion);
  ownGarden.tick(Date.now());
  if (scene.background instanceof T.Color) {
    scene.background.lerp(ambienceTarget, reducedMotion ? 1 : 1 - Math.exp(-dt * .18));
    if (scene.fog instanceof T.Fog) scene.fog.color.copy(scene.background);
  }
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
