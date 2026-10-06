/**
 * Dream Caravan (کاروان رؤیاها) - Visual & Particle Systems
 *
 * Implements VisualFXSystem:
 * - Dual camera-facing soaring flight ribbons with 32-segment ring buffers
 * - Pre-allocated 64-star falling glittering particle pool
 * - Luminous catenary hand-holding connection arc
 * - Floating ambient meadow light dust motes (160 points)
 * - Celestial starry night dome (384 stars, Y >= 40, fog: false)
 * - 32-mesh footstep decal ring buffer pool (Y = 0.028)
 * - Pure mathematical helpers for shadows, footsteps, and night intensity
 * - Zero runtime GC with pre-allocated TypedArrays and reusable math vectors
 */

import * as T from 'three';

export type AmbiencePhase = 'morning' | 'day' | 'evening' | 'night';

export interface VisualFXSystem {
  update(dt: number, now: number): void;
  updateRibbonTrails(angelPos: T.Vector3, gorPos: T.Vector3, flying: boolean): void;
  spawnFootstepGlow(position: T.Vector3): void;
  spawnEmbraceWarmth?(midpoint: T.Vector3): void;
  setHandHoldConnection(angelHand: T.Vector3, gorHand: T.Vector3, active: boolean): void;
  setNightIntensity(nightFactor: number): void;
  setReducedMotion?(reduced: boolean): void;
  dispose?(): void;
  readonly ribbonGeometry?: T.BufferGeometry;
  readonly starGeometry?: T.BufferGeometry;
  readonly dustGeometry?: T.BufferGeometry;
  readonly dustMesh?: T.Points;
  readonly starDomeMesh?: T.Points;
  readonly connectionMesh?: T.Mesh;
  readonly footstepPool?: readonly T.Mesh[];
  readonly activeStarCount?: number;
  readonly ribbonHead?: number;
  readonly ribbonActiveCount?: number;
}

export interface VisualFXOptions {
  camera?: T.Camera;
  reducedMotion?: boolean;
}

export interface ShadowParams {
  y: number;
  scale: number;
  opacity: number;
}

export interface FootstepParams {
  y: number;
  scale: number;
  opacity: number;
  active: boolean;
}

/**
 * Pure mathematical helper calculating diurnal night intensity factor from ambience phase.
 */
export function computeNightIntensity(phase: AmbiencePhase | string, phaseProgress: number): number {
  const p = Math.max(0.0, Math.min(1.0, Number.isFinite(phaseProgress) ? phaseProgress : 0.0));
  let val = 0.0;
  switch (phase) {
    case 'day':
      val = 0.0;
      break;
    case 'evening':
      // Smooth dusk rise starting after 30% of evening
      val = Math.max(0.0, Math.min(1.0, (p - 0.3) / 0.7));
      break;
    case 'night':
      // Full night brilliance; gentle ease towards dawn in final 15%
      val = p < 0.85 ? 1.0 : Math.max(0.0, 1.0 - ((p - 0.85) / 0.15) * 0.3);
      break;
    case 'morning':
      // Fades from 0.7 down to 0.0 over first 40% of morning
      val = Math.max(0.0, 0.7 * (1.0 - p / 0.4));
      break;
    default:
      val = 0.0;
  }
  return Math.round(val * 1e6) / 1e6;
}

/**
 * Pure mathematical helper for ground-pinned diffused shadow projection.
 */
export function calculateShadowParams(altitude: number, baseOpacity = 0.19): ShadowParams {
  const h = Number.isFinite(altitude) ? Math.max(0.0, altitude) : 0.0;
  return {
    y: 0.025,
    scale: Math.round((1.0 + 0.14 * h) * 1e6) / 1e6,
    opacity: Math.round((baseOpacity / (1.0 + 0.24 * h)) * 1e6) / 1e6,
  };
}

/**
 * Pure mathematical helper calculating footstep decal expansion and non-linear opacity falloff.
 */
export function calculateFootstepParams(
  age: number,
  lifetime = 2.4,
  baseOpacity = 0.68,
  startScale = 0.60,
  endScale = 1.20,
): FootstepParams {
  const validAge = Number.isFinite(age) ? Math.max(0.0, age) : 0.0;
  const safeLifetime = Math.max(0.001, Number.isFinite(lifetime) ? lifetime : 2.4);
  const u = Math.min(1.0, validAge / safeLifetime);
  if (u >= 1.0) {
    return { y: 0.028, scale: endScale, opacity: 0.0, active: false };
  }
  const scale = startScale + (endScale - startScale) * (1.0 - (1.0 - u) * (1.0 - u));
  const opacity = baseOpacity * Math.pow(1.0 - u, 1.8);
  return {
    y: 0.028,
    scale,
    opacity,
    active: true,
  };
}

/**
 * Procedural star glint texture generator (guarded for Node SSR environments).
 */
function createGlintTexture(): T.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 28);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.65, 'rgba(255,255,255,0.25)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(32, 6); ctx.lineTo(32, 58);
    ctx.moveTo(6, 32); ctx.lineTo(58, 32);
    ctx.stroke();

    return new T.CanvasTexture(canvas);
  } catch {
    return null;
  }
}

interface RibbonState {
  x: Float32Array;
  y: Float32Array;
  z: Float32Array;
  head: number;
  activeCount: number;
  fadeAlpha: number;
  lastX: number;
  lastY: number;
  lastZ: number;
  timer: number;
  mesh: T.Mesh;
}

export function createVisualFXSystem(scene: T.Scene, options?: VisualFXOptions): VisualFXSystem {
  let reducedMotion = options?.reducedMotion ?? false;
  const cameraRef = options?.camera;

  const rootGroup = new T.Group();
  rootGroup.name = 'visual-fx-system';
  scene.add(rootGroup);

  // Pre-allocated math scratch variables (Zero GC)
  const tempCam = new T.Vector3(0, 20, 25);
  const handAngel = new T.Vector3();
  const handGor = new T.Vector3();

  // ==========================================
  // 1. DUAL FLIGHT LIGHT RIBBONS (32 segments)
  // ==========================================
  const RIBBON_SEGMENTS = 32;
  const RIBBON_VERTICES = (RIBBON_SEGMENTS + 1) * 2; // 66
  const RIBBON_INDICES = RIBBON_SEGMENTS * 6; // 192

  const ribbonIndices = new Uint16Array(RIBBON_INDICES);
  for (let s = 0; s < RIBBON_SEGMENTS; s++) {
    const at = s * 6;
    const base = s * 2;
    ribbonIndices[at]     = base;
    ribbonIndices[at + 1] = base + 1;
    ribbonIndices[at + 2] = base + 2;
    ribbonIndices[at + 3] = base + 2;
    ribbonIndices[at + 4] = base + 1;
    ribbonIndices[at + 5] = base + 3;
  }

  function createRibbonGeometry(): T.BufferGeometry {
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(new Float32Array(RIBBON_VERTICES * 3), 3).setUsage(T.DynamicDrawUsage));
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(RIBBON_VERTICES * 4), 4).setUsage(T.DynamicDrawUsage));
    geo.setIndex(new T.BufferAttribute(ribbonIndices, 1));
    return geo;
  }

  const angelRibbonGeom = createRibbonGeometry();
  const gorRibbonGeom = createRibbonGeometry();

  const ribbonMaterial = new T.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: T.DoubleSide,
    toneMapped: false,
  });
  const angelRibbonMat = ribbonMaterial;
  const gorRibbonMat = ribbonMaterial.clone();

  const angelRibbonMesh = new T.Mesh(angelRibbonGeom, angelRibbonMat);
  const gorRibbonMesh = new T.Mesh(gorRibbonGeom, gorRibbonMat);
  angelRibbonMesh.visible = false;
  gorRibbonMesh.visible = false;
  rootGroup.add(angelRibbonMesh);
  rootGroup.add(gorRibbonMesh);

  function createRibbonState(mesh: T.Mesh): RibbonState {
    return {
      x: new Float32Array(RIBBON_SEGMENTS + 1),
      y: new Float32Array(RIBBON_SEGMENTS + 1),
      z: new Float32Array(RIBBON_SEGMENTS + 1),
      head: 0,
      activeCount: 0,
      fadeAlpha: 0.0,
      lastX: -9999,
      lastY: -9999,
      lastZ: -9999,
      timer: 0,
      mesh,
    };
  }

  const angelRibbonState = createRibbonState(angelRibbonMesh);
  const gorRibbonState = createRibbonState(gorRibbonMesh);

  function updateRibbonMesh(
    geom: T.BufferGeometry,
    state: RibbonState,
    isAngel: boolean,
    camPos: T.Vector3,
    flying: boolean,
    dt: number,
  ) {
    const posAttr = geom.getAttribute('position') as T.BufferAttribute;
    const colAttr = geom.getAttribute('color') as T.BufferAttribute;
    const posArr = posAttr.array as Float32Array;
    const colArr = colAttr.array as Float32Array;

    if (flying) {
      state.fadeAlpha = Math.min(1.0, state.fadeAlpha + dt * 4.0);
    } else {
      state.fadeAlpha = Math.max(0.0, state.fadeAlpha - dt * 3.0);
    }

    if (state.fadeAlpha <= 0.0001 && !flying) {
      state.fadeAlpha = 0.0;
      state.mesh.visible = false;
      for (let s = 0; s <= RIBBON_SEGMENTS; s++) {
        colArr[2 * s * 4 + 3] = 0.0;
        colArr[(2 * s + 1) * 4 + 3] = 0.0;
      }
      colAttr.needsUpdate = true;
      return;
    }
    state.mesh.visible = true;

    const baseW = isAngel ? 0.30 : 0.35;
    const head = state.head;
    const activeCount = state.activeCount;

    for (let s = 0; s <= RIBBON_SEGMENTS; s++) {
      const t = s / RIBBON_SEGMENTS;
      const idx = (head - s + 33) % 33;
      const px = state.x[idx];
      const py = state.y[idx];
      const pz = state.z[idx];

      let tx = 0, ty = 0, tz = 1;
      if (activeCount > 1) {
        if (s === 0) {
          const nextIdx = (head - 1 + 33) % 33;
          tx = px - state.x[nextIdx];
          ty = py - state.y[nextIdx];
          tz = pz - state.z[nextIdx];
        } else if (s === RIBBON_SEGMENTS) {
          const prevIdx = (head - 31 + 33) % 33;
          tx = state.x[prevIdx] - px;
          ty = state.y[prevIdx] - py;
          tz = state.z[prevIdx] - pz;
        } else {
          const prevIdx = (head - (s - 1) + 33) % 33;
          const nextIdx = (head - (s + 1) + 33) % 33;
          tx = state.x[prevIdx] - state.x[nextIdx];
          ty = state.y[prevIdx] - state.y[nextIdx];
          tz = state.z[prevIdx] - state.z[nextIdx];
        }
      }
      const tLen = Math.hypot(tx, ty, tz);
      if (tLen > 1e-4) {
        tx /= tLen; ty /= tLen; tz /= tLen;
      } else {
        tx = 0; ty = 0; tz = 1;
      }

      let dx = camPos.x - px;
      let dy = camPos.y - py;
      let dz = camPos.z - pz;
      const dLen = Math.hypot(dx, dy, dz);
      if (dLen > 1e-4) {
        dx /= dLen; dy /= dLen; dz /= dLen;
      } else {
        dx = 0; dy = 1; dz = 0;
      }

      let sx = ty * dz - tz * dy;
      let sy = tz * dx - tx * dz;
      let sz = tx * dy - ty * dx;
      let sLen = Math.hypot(sx, sy, sz);
      if (sLen > 1e-4) {
        sx /= sLen; sy /= sLen; sz /= sLen;
      } else {
        sx = -tz; sy = 0; sz = tx;
        sLen = Math.hypot(sx, sz);
        if (sLen > 1e-4) {
          sx /= sLen; sz /= sLen;
        } else {
          sx = 1; sy = 0; sz = 0;
        }
      }

      const w = baseW * (1.0 - 0.60 * t);
      const hw = w * 0.5;

      const leftAt = 2 * s * 3;
      posArr[leftAt]     = px + sx * hw;
      posArr[leftAt + 1] = py + sy * hw;
      posArr[leftAt + 2] = pz + sz * hw;

      const rightAt = (2 * s + 1) * 3;
      posArr[rightAt]     = px - sx * hw;
      posArr[rightAt + 1] = py - sy * hw;
      posArr[rightAt + 2] = pz - sz * hw;

      let alpha = 0.0;
      if (s < activeCount && state.fadeAlpha > 0) {
        alpha = Math.pow(1.0 - t, 1.3) * 0.85 * state.fadeAlpha;
      }

      let r = 1.0, g = 1.0, b = 1.0;
      if (isAngel) {
        r = 1.0;
        g = Math.max(0.0, Math.min(1.0, 0.90 - 0.08 * t));
        b = Math.max(0.0, Math.min(1.0, 0.74 - 0.18 * t));
      } else {
        r = Math.max(0.0, Math.min(1.0, 0.50 + 0.10 * t));
        g = Math.max(0.0, Math.min(1.0, 0.95 - 0.05 * t));
        b = Math.max(0.0, Math.min(1.0, 0.85 - 0.10 * t));
      }

      const colLeftAt = 2 * s * 4;
      colArr[colLeftAt]     = r;
      colArr[colLeftAt + 1] = g;
      colArr[colLeftAt + 2] = b;
      colArr[colLeftAt + 3] = alpha;

      const colRightAt = (2 * s + 1) * 4;
      colArr[colRightAt]     = r;
      colArr[colRightAt + 1] = g;
      colArr[colRightAt + 2] = b;
      colArr[colRightAt + 3] = alpha;
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }

  // ==========================================
  // 2. FALLING GLITTERING STAR PARTICLES (64)
  // ==========================================
  const STAR_COUNT = 64;
  const starPositions = new Float32Array(STAR_COUNT * 3);
  const starColors = new Float32Array(STAR_COUNT * 4);

  const starX = new Float32Array(STAR_COUNT);
  const starY = new Float32Array(STAR_COUNT);
  const starZ = new Float32Array(STAR_COUNT);
  const starVx = new Float32Array(STAR_COUNT);
  const starVy = new Float32Array(STAR_COUNT);
  const starVz = new Float32Array(STAR_COUNT);
  const starAge = new Float32Array(STAR_COUNT);
  const starLifespan = new Float32Array(STAR_COUNT);
  const starTwinkleFreq = new Float32Array(STAR_COUNT);
  const starTwinklePhase = new Float32Array(STAR_COUNT);
  const starR = new Float32Array(STAR_COUNT);
  const starG = new Float32Array(STAR_COUNT);
  const starB = new Float32Array(STAR_COUNT);
  const starActive = new Uint8Array(STAR_COUNT);
  let starCursor = 0;
  let lastFlightStarSpawn = 0;

  for (let i = 0; i < STAR_COUNT; i++) {
    starPositions[i * 3 + 1] = -9999;
  }

  const glintTexture = createGlintTexture();
  const starGeom = new T.BufferGeometry();
  starGeom.setAttribute('position', new T.BufferAttribute(starPositions, 3).setUsage(T.DynamicDrawUsage));
  starGeom.setAttribute('color', new T.BufferAttribute(starColors, 4).setUsage(T.DynamicDrawUsage));

  const starMat = new T.PointsMaterial({
    size: 0.42,
    ...(glintTexture ? { map: glintTexture } : {}),
    vertexColors: true,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
  });

  const starMesh = new T.Points(starGeom, starMat);
  starMesh.name = 'visual-fx-stars';
  rootGroup.add(starMesh);

  function spawnStar(
    x: number, y: number, z: number,
    vx: number, vy: number, vz: number,
    r: number, g: number, b: number,
    lifespan: number,
  ) {
    const idx = starCursor;
    starCursor = (starCursor + 1) % STAR_COUNT;
    starX[idx] = x;
    starY[idx] = y;
    starZ[idx] = z;
    starVx[idx] = vx;
    starVy[idx] = vy;
    starVz[idx] = vz;
    starR[idx] = r;
    starG[idx] = g;
    starB[idx] = b;
    starAge[idx] = 0;
    starLifespan[idx] = Math.max(0.1, lifespan);
    starActive[idx] = 1;
    starTwinkleFreq[idx] = 8.0 + Math.random() * 10.0;
    starTwinklePhase[idx] = Math.random() * Math.PI * 2;
  }

  // ==========================================
  // 3. LUMINOUS HAND-HOLDING CONNECTION ARC (16 segs)
  // ==========================================
  const BEAM_SEGMENTS = 16;
  const BEAM_VERTICES = (BEAM_SEGMENTS + 1) * 2; // 34
  const BEAM_INDICES = BEAM_SEGMENTS * 6; // 96

  const beamIndices = new Uint16Array(BEAM_INDICES);
  for (let s = 0; s < BEAM_SEGMENTS; s++) {
    const at = s * 6;
    const base = s * 2;
    beamIndices[at]     = base;
    beamIndices[at + 1] = base + 1;
    beamIndices[at + 2] = base + 2;
    beamIndices[at + 3] = base + 2;
    beamIndices[at + 4] = base + 1;
    beamIndices[at + 5] = base + 3;
  }

  const connGeom = new T.BufferGeometry();
  connGeom.setAttribute('position', new T.BufferAttribute(new Float32Array(BEAM_VERTICES * 3), 3).setUsage(T.DynamicDrawUsage));
  connGeom.setAttribute('color', new T.BufferAttribute(new Float32Array(BEAM_VERTICES * 4), 4).setUsage(T.DynamicDrawUsage));
  connGeom.setIndex(new T.BufferAttribute(beamIndices, 1));

  const connMat = new T.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: T.AdditiveBlending,
    depthWrite: false,
    depthTest: true,
    side: T.DoubleSide,
    toneMapped: false,
  });

  const connMesh = new T.Mesh(connGeom, connMat);
  connMesh.visible = false;
  rootGroup.add(connMesh);

  let connAlpha = 0.0;
  let connActive = false;
  let lastConnStarSpawn = 0;

  // ==========================================
  // 4. FLOATING AMBIENT LIGHT DUST MOTES (160)
  // ==========================================
  const DUST_COUNT = 160;
  const dustPositions = new Float32Array(DUST_COUNT * 3);
  const dustX0 = new Float32Array(DUST_COUNT);
  const dustY0 = new Float32Array(DUST_COUNT);
  const dustZ0 = new Float32Array(DUST_COUNT);
  const dustOmegaX = new Float32Array(DUST_COUNT);
  const dustOmegaY = new Float32Array(DUST_COUNT);
  const dustOmegaZ = new Float32Array(DUST_COUNT);
  const dustPhi = new Float32Array(DUST_COUNT);

  for (let i = 0; i < DUST_COUNT; i++) {
    const angle = (i / DUST_COUNT) * Math.PI * 2 + ((i * 13) % 17) * 0.2;
    const radius = 4.0 + (72.0 * ((i * 17) % DUST_COUNT)) / DUST_COUNT;
    dustX0[i] = Math.cos(angle) * radius;
    dustY0[i] = 0.4 + (((i * 23) % 100) / 100) * 3.8;
    dustZ0[i] = Math.sin(angle) * radius;
    dustOmegaX[i] = 0.5 + ((i * 13) % 10) * 0.15;
    dustOmegaY[i] = 0.6 + ((i * 19) % 10) * 0.12;
    dustOmegaZ[i] = 0.5 + ((i * 29) % 10) * 0.15;
    dustPhi[i] = (i * 1.618) % (Math.PI * 2);

    dustPositions[i * 3 + 0] = dustX0[i];
    dustPositions[i * 3 + 1] = dustY0[i];
    dustPositions[i * 3 + 2] = dustZ0[i];
  }

  const dustGeom = new T.BufferGeometry();
  dustGeom.setAttribute('position', new T.BufferAttribute(dustPositions, 3).setUsage(T.DynamicDrawUsage));

  const dustDayColor = new T.Color('#fff1be');
  const dustNightColor = new T.Color('#bfe3ff');
  const dustMat = new T.PointsMaterial({
    size: 0.22,
    transparent: true,
    opacity: 0.50,
    blending: T.AdditiveBlending,
    depthWrite: false,
    fog: true,
    color: dustDayColor.clone(),
  });

  const dustMesh = new T.Points(dustGeom, dustMat);
  dustMesh.name = 'visual-fx-dust';
  rootGroup.add(dustMesh);

  // ==========================================
  // 5. CELESTIAL STARRY NIGHT DOME (384, Y >= 40)
  // ==========================================
  const DOME_STAR_COUNT = 384;
  const starDomePositions = new Float32Array(DOME_STAR_COUNT * 3);
  const starDomeColors = new Float32Array(DOME_STAR_COUNT * 3);

  const minPhi = Math.asin(40.0 / 195.0); // ~0.2073
  const starPalette = [
    new T.Color('#ffffff'), // Vega
    new T.Color('#cbe3fb'), // Sapphire
    new T.Color('#fff0c4'), // Topaz
    new T.Color('#e2d6ff'), // Amethyst
    new T.Color('#ffd9e8'), // Rose Quartz
  ];

  for (let i = 0; i < DOME_STAR_COUNT; i++) {
    const u = (i + 0.5) / DOME_STAR_COUNT;
    const phi = minPhi + (Math.PI * 0.5 - minPhi) * Math.sqrt(u);
    const theta = i * 2.399963229728653; // golden angle
    const x = 195.0 * Math.cos(theta) * Math.cos(phi);
    const y = 195.0 * Math.sin(phi); // strictly >= 40
    const z = 195.0 * Math.sin(theta) * Math.cos(phi);

    starDomePositions[i * 3 + 0] = x;
    starDomePositions[i * 3 + 1] = y;
    starDomePositions[i * 3 + 2] = z;

    const col = starPalette[i % starPalette.length];
    starDomeColors[i * 3 + 0] = col.r;
    starDomeColors[i * 3 + 1] = col.g;
    starDomeColors[i * 3 + 2] = col.b;
  }

  const starDomeGeom = new T.BufferGeometry();
  starDomeGeom.setAttribute('position', new T.BufferAttribute(starDomePositions, 3));
  starDomeGeom.setAttribute('color', new T.BufferAttribute(starDomeColors, 3));

  const starDomeMat = new T.PointsMaterial({
    size: 0.48,
    vertexColors: true,
    transparent: true,
    opacity: 0.0,
    depthWrite: false,
    fog: false, // Strictly false to bypass meadow ground fog
    blending: T.AdditiveBlending,
  });

  const starDomeMesh = new T.Points(starDomeGeom, starDomeMat);
  starDomeMesh.name = 'visual-fx-star-dome';
  starDomeMesh.visible = false;
  rootGroup.add(starDomeMesh);

  // ==========================================
  // 6. FOOTSTEP DECAL RING BUFFER POOL (32, Y = 0.028)
  // ==========================================
  const FOOTSTEP_POOL_SIZE = 32;
  const footstepGeom = new T.CircleGeometry(0.34, 18);
  const footstepMeshes: T.Mesh[] = [];
  const footstepBornAt = new Float64Array(FOOTSTEP_POOL_SIZE);
  const footstepActive = new Uint8Array(FOOTSTEP_POOL_SIZE);
  let footstepCursor = 0;

  for (let i = 0; i < FOOTSTEP_POOL_SIZE; i++) {
    const mat = new T.MeshBasicMaterial({
      color: '#fff3c4',
      transparent: true,
      opacity: 0.0,
      depthWrite: false,
      blending: T.AdditiveBlending,
    });
    const mesh = new T.Mesh(footstepGeom, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(0, 0.028, 0);
    mesh.renderOrder = 3;
    mesh.visible = false;
    rootGroup.add(mesh);
    footstepMeshes.push(mesh);
  }

  // Internal state
  let currentNightIntensity = 0.0;
  let internalNow = 0;

  // ==========================================
  // API IMPLEMENTATION
  // ==========================================
  const system: VisualFXSystem = {
    update(dt: number, now: number): void {
      const safeDt = Number.isFinite(dt) ? Math.max(0.0, Math.min(10.0, dt)) : 0.0;
      const safeNow = Number.isFinite(now) ? Math.max(0.0, now) : 0.0;
      internalNow = safeNow;

      // Update camera position scratch vector
      if (cameraRef) {
        tempCam.setFromMatrixPosition(cameraRef.matrixWorld);
      } else {
        tempCam.set(0, 20, 25);
      }

      const tSec = safeNow * 0.001;

      // 1. Update Falling Stars Physics
      const starPosAttr = starGeom.getAttribute('position') as T.BufferAttribute;
      const starColAttr = starGeom.getAttribute('color') as T.BufferAttribute;
      const starPosArr = starPosAttr.array as Float32Array;
      const starColArr = starColAttr.array as Float32Array;

      for (let i = 0; i < STAR_COUNT; i++) {
        if (!starActive[i]) {
          starPosArr[i * 3 + 1] = -9999;
          starColArr[i * 4 + 3] = 0;
          continue;
        }

        starAge[i] += safeDt;
        if (starAge[i] >= starLifespan[i]) {
          starActive[i] = 0;
          starPosArr[i * 3 + 1] = -9999;
          starColArr[i * 4 + 3] = 0;
          continue;
        }

        starVy[i] -= 0.22 * safeDt; // soft gravity
        starVx[i] *= Math.max(0.0, 1.0 - 0.75 * safeDt); // air drag
        starVz[i] *= Math.max(0.0, 1.0 - 0.75 * safeDt);

        starX[i] += starVx[i] * safeDt;
        starY[i] += starVy[i] * safeDt;
        starZ[i] += starVz[i] * safeDt;

        if (starY[i] < 0.05) {
          starY[i] = 0.05;
          starVy[i] = 0;
          starVx[i] *= 0.5;
          starVz[i] *= 0.5;
        }

        const u = Math.min(1.0, starAge[i] / starLifespan[i]);
        const envelope = Math.sin(u * Math.PI);
        const sparkle = reducedMotion
          ? 0.70
          : 0.35 + 0.65 * Math.pow(Math.sin(safeNow * 0.001 * starTwinkleFreq[i] + starTwinklePhase[i]), 2);
        const alpha = envelope * sparkle * 0.88;

        starPosArr[i * 3 + 0] = starX[i];
        starPosArr[i * 3 + 1] = starY[i];
        starPosArr[i * 3 + 2] = starZ[i];

        starColArr[i * 4 + 0] = Math.min(1.0, starR[i] * (0.8 + 0.5 * sparkle));
        starColArr[i * 4 + 1] = Math.min(1.0, starG[i] * (0.8 + 0.5 * sparkle));
        starColArr[i * 4 + 2] = Math.min(1.0, starB[i] * (0.8 + 0.5 * sparkle));
        starColArr[i * 4 + 3] = alpha;
      }
      starPosAttr.needsUpdate = true;
      starColAttr.needsUpdate = true;

      // 2. Update Connection Arc
      if (connActive) {
        connAlpha = Math.min(1.0, connAlpha + (1.0 - connAlpha) * Math.min(1.0, safeDt * 6.0));
      } else {
        connAlpha = Math.max(0.0, connAlpha - connAlpha * Math.min(1.0, safeDt * 5.0));
      }

      if (connAlpha <= 0.001) {
        connMesh.visible = false;
      } else {
        connMesh.visible = true;
        const beamPosArr = connGeom.getAttribute('position').array as Float32Array;
        const beamColArr = connGeom.getAttribute('color').array as Float32Array;

        for (let s = 0; s <= BEAM_SEGMENTS; s++) {
          const u = s / BEAM_SEGMENTS;
          const bx = (1.0 - u) * handAngel.x + u * handGor.x;
          const by = (1.0 - u) * handAngel.y + u * handGor.y;
          const bz = (1.0 - u) * handAngel.z + u * handGor.z;

          const sag = 4.0 * u * (1.0 - u) * (0.12 + 0.03 * Math.sin(tSec * 3.5));
          const dy = 0.02 * Math.sin(tSec * 5.0 + u * 6.28);
          const dx = 0.015 * Math.cos(tSec * 4.0 + u * 3.14);

          const cx = bx + dx;
          const cy = by + sag + dy;
          const cz = bz;

          let tx = handGor.x - handAngel.x;
          let ty = handGor.y - handAngel.y;
          let tz = handGor.z - handAngel.z;
          const tLen = Math.hypot(tx, ty, tz);
          if (tLen > 1e-4) { tx /= tLen; ty /= tLen; tz /= tLen; } else { tx = 1; ty = 0; tz = 0; }

          let dcx = tempCam.x - cx;
          let dcy = tempCam.y - cy;
          let dcz = tempCam.z - cz;
          const dcLen = Math.hypot(dcx, dcy, dcz);
          if (dcLen > 1e-4) { dcx /= dcLen; dcy /= dcLen; dcz /= dcLen; } else { dcx = 0; dcy = 1; dcz = 0; }

          let sx = ty * dcz - tz * dcy;
          let sy = tz * dcx - tx * dcz;
          let sz = tx * dcy - ty * dcx;
          let sLen = Math.hypot(sx, sy, sz);
          if (sLen > 1e-4) { sx /= sLen; sy /= sLen; sz /= sLen; } else { sx = 0; sy = 1; sz = 0; }

          const wPulse = reducedMotion ? 1.0 : 1.0 + 0.15 * Math.sin(tSec * 6.0);
          const w = (0.06 + 0.10 * Math.sin(u * Math.PI)) * wPulse;
          const hw = w * 0.5;

          const leftAt = 2 * s * 3;
          beamPosArr[leftAt]     = cx + sx * hw;
          beamPosArr[leftAt + 1] = cy + sy * hw;
          beamPosArr[leftAt + 2] = cz + sz * hw;

          const rightAt = (2 * s + 1) * 3;
          beamPosArr[rightAt]     = cx - sx * hw;
          beamPosArr[rightAt + 1] = cy - sy * hw;
          beamPosArr[rightAt + 2] = cz - sz * hw;

          const r = 1.0;
          const g = reducedMotion ? 0.90 : Math.max(0.0, Math.min(1.0, 0.88 + 0.08 * Math.sin(tSec * 4.0)));
          const b = reducedMotion ? 0.65 : Math.max(0.0, Math.min(1.0, 0.60 + 0.15 * Math.cos(tSec * 3.0)));
          const alphaPulse = reducedMotion ? 0.85 : 0.75 + 0.25 * Math.sin(tSec * 7.0 + u * 4.0);
          const alpha = connAlpha * Math.pow(Math.max(0.0, Math.sin(u * Math.PI)), 0.35) * alphaPulse;

          const colLeftAt = 2 * s * 4;
          beamColArr[colLeftAt]     = r;
          beamColArr[colLeftAt + 1] = g;
          beamColArr[colLeftAt + 2] = b;
          beamColArr[colLeftAt + 3] = alpha;

          const colRightAt = (2 * s + 1) * 4;
          beamColArr[colRightAt]     = r;
          beamColArr[colRightAt + 1] = g;
          beamColArr[colRightAt + 2] = b;
          beamColArr[colRightAt + 3] = alpha;
        }
        connGeom.attributes.position.needsUpdate = true;
        connGeom.attributes.color.needsUpdate = true;

        if (connActive && safeNow - lastConnStarSpawn >= 140) {
          lastConnStarSpawn = safeNow;
          const midU = 0.2 + Math.random() * 0.6;
          spawnStar(
            (1 - midU) * handAngel.x + midU * handGor.x + (Math.random() - 0.5) * 0.15,
            (1 - midU) * handAngel.y + midU * handGor.y + 0.1 + (Math.random() - 0.5) * 0.1,
            (1 - midU) * handAngel.z + midU * handGor.z + (Math.random() - 0.5) * 0.15,
            (Math.random() - 0.5) * 0.18,
            -0.12 - Math.random() * 0.18,
            (Math.random() - 0.5) * 0.18,
            1.0, 0.92, 0.72,
            0.9 + Math.random() * 0.6,
          );
        }
      }

      // 3. Update Dust Motes Drift
      if (!reducedMotion) {
        const dustPosArr = dustGeom.getAttribute('position').array as Float32Array;
        for (let i = 0; i < DUST_COUNT; i++) {
          const x = dustX0[i] + Math.sin(tSec * dustOmegaX[i] + dustPhi[i]) * 0.6;
          const y = dustY0[i] + Math.sin(tSec * dustOmegaY[i] + dustPhi[i] * 1.25) * 0.35;
          const z = dustZ0[i] + Math.cos(tSec * dustOmegaZ[i] + dustPhi[i] * 0.8) * 0.6;
          dustPosArr[i * 3 + 0] = x;
          dustPosArr[i * 3 + 1] = y;
          dustPosArr[i * 3 + 2] = z;
        }
        dustGeom.attributes.position.needsUpdate = true;
      }

      // 4. Update Footstep Decals
      for (let i = 0; i < FOOTSTEP_POOL_SIZE; i++) {
        if (!footstepActive[i]) continue;
        const age = (safeNow - footstepBornAt[i]) / 1000.0;
        const p = calculateFootstepParams(age);
        if (!p.active) {
          footstepActive[i] = 0;
          footstepMeshes[i].visible = false;
        } else {
          footstepMeshes[i].scale.setScalar(p.scale);
          (footstepMeshes[i].material as T.MeshBasicMaterial).opacity = p.opacity;
        }
      }
    },

    updateRibbonTrails(angelPos: T.Vector3, gorPos: T.Vector3, flying: boolean): void {
      const dt = 1 / 30; // standard sample delta

      // Update Angel ring buffer
      const dAngel = Math.hypot(
        angelPos.x - angelRibbonState.lastX,
        angelPos.y - angelRibbonState.lastY,
        angelPos.z - angelRibbonState.lastZ,
      );
      angelRibbonState.timer += dt;
      if (flying && (dAngel >= 0.05 || angelRibbonState.timer >= 0.025 || angelRibbonState.activeCount === 0)) {
        angelRibbonState.head = (angelRibbonState.head + 1) % 33;
        angelRibbonState.x[angelRibbonState.head] = angelPos.x;
        angelRibbonState.y[angelRibbonState.head] = angelPos.y;
        angelRibbonState.z[angelRibbonState.head] = angelPos.z;
        angelRibbonState.lastX = angelPos.x;
        angelRibbonState.lastY = angelPos.y;
        angelRibbonState.lastZ = angelPos.z;
        angelRibbonState.activeCount = Math.min(33, angelRibbonState.activeCount + 1);
        angelRibbonState.timer = 0;
      }

      // Update Gorastakh ring buffer
      const dGor = Math.hypot(
        gorPos.x - gorRibbonState.lastX,
        gorPos.y - gorRibbonState.lastY,
        gorPos.z - gorRibbonState.lastZ,
      );
      gorRibbonState.timer += dt;
      if (flying && (dGor >= 0.05 || gorRibbonState.timer >= 0.025 || gorRibbonState.activeCount === 0)) {
        gorRibbonState.head = (gorRibbonState.head + 1) % 33;
        gorRibbonState.x[gorRibbonState.head] = gorPos.x;
        gorRibbonState.y[gorRibbonState.head] = gorPos.y;
        gorRibbonState.z[gorRibbonState.head] = gorPos.z;
        gorRibbonState.lastX = gorPos.x;
        gorRibbonState.lastY = gorPos.y;
        gorRibbonState.lastZ = gorPos.z;
        gorRibbonState.activeCount = Math.min(33, gorRibbonState.activeCount + 1);
        gorRibbonState.timer = 0;
      }

      // Update geometries
      updateRibbonMesh(angelRibbonGeom, angelRibbonState, true, tempCam, flying, dt);
      updateRibbonMesh(gorRibbonGeom, gorRibbonState, false, tempCam, flying, dt);

      // Spawn trailing stars during flight movement
      if (flying && (dAngel > 0.04 || dGor > 0.04) && internalNow - lastFlightStarSpawn >= 45) {
        lastFlightStarSpawn = internalNow;
        const target = Math.random() < 0.5 ? angelPos : gorPos;
        const isAng = target === angelPos;
        spawnStar(
          target.x + (Math.random() - 0.5) * 0.22,
          target.y + (Math.random() - 0.5) * 0.22,
          target.z + (Math.random() - 0.5) * 0.22,
          (Math.random() - 0.5) * 0.35,
          -0.28 - Math.random() * 0.32,
          (Math.random() - 0.5) * 0.35,
          isAng ? 1.0 : 0.65,
          isAng ? 0.94 : 0.98,
          isAng ? 0.80 : 0.90,
          1.2 + Math.random() * 0.9,
        );
      }
    },

    spawnFootstepGlow(position: T.Vector3): void {
      const idx = footstepCursor;
      footstepCursor = (footstepCursor + 1) % FOOTSTEP_POOL_SIZE;
      const mesh = footstepMeshes[idx];
      mesh.position.set(position.x, 0.028, position.z);
      mesh.scale.setScalar(0.60);
      (mesh.material as T.MeshBasicMaterial).opacity = 0.68;
      mesh.visible = true;
      footstepBornAt[idx] = internalNow;
      footstepActive[idx] = 1;
    },

    spawnEmbraceWarmth(midpoint: T.Vector3): void {
      if (reducedMotion) return;
      for (let i = 0; i < 2; i++) {
        spawnStar(
          midpoint.x + (Math.random() - 0.5) * 0.45,
          midpoint.y + 1.1 + (Math.random() - 0.5) * 0.35,
          midpoint.z + (Math.random() - 0.5) * 0.45,
          (Math.random() - 0.5) * 0.12,
          0.16 + Math.random() * 0.22,
          (Math.random() - 0.5) * 0.12,
          1.0, 0.78, 0.88,
          1.2 + Math.random() * 0.6,
        );
      }
    },

    setHandHoldConnection(angelHand: T.Vector3, gorHand: T.Vector3, active: boolean): void {
      handAngel.copy(angelHand);
      handGor.copy(gorHand);
      const dist = handAngel.distanceTo(handGor);
      connActive = active && dist <= 4.5;
    },

    setNightIntensity(nightFactor: number): void {
      currentNightIntensity = Math.max(0.0, Math.min(1.0, Number.isFinite(nightFactor) ? nightFactor : 0.0));
      starDomeMat.opacity = currentNightIntensity * 0.95;
      starDomeMesh.visible = currentNightIntensity > 0.001;

      // Diurnal dust motes tint interpolation
      dustMat.color.copy(dustDayColor).lerp(dustNightColor, currentNightIntensity);
    },

    setReducedMotion(reduced: boolean): void {
      reducedMotion = reduced;
    },

    dispose(): void {
      scene.remove(rootGroup);
      angelRibbonGeom.dispose();
      angelRibbonMat.dispose();
      gorRibbonGeom.dispose();
      gorRibbonMat.dispose();
      starGeom.dispose();
      starMat.dispose();
      connGeom.dispose();
      connMat.dispose();
      dustGeom.dispose();
      dustMat.dispose();
      starDomeGeom.dispose();
      starDomeMat.dispose();
      footstepGeom.dispose();
      for (const m of footstepMeshes) {
        (m.material as T.Material).dispose();
      }
    },

    // Extended test & reflection getters
    get ribbonGeometry() { return angelRibbonGeom; },
    get starGeometry() { return starGeom; },
    get dustGeometry() { return dustGeom; },
    get dustMesh() { return dustMesh; },
    get starDomeMesh() { return starDomeMesh; },
    get connectionMesh() { return connMesh; },
    get footstepPool() { return footstepMeshes; },
    get activeStarCount() {
      let count = 0;
      for (let i = 0; i < STAR_COUNT; i++) {
        if (starActive[i]) count++;
      }
      return count;
    },
    get ribbonHead() { return angelRibbonState.head; },
    get ribbonActiveCount() { return angelRibbonState.activeCount; },
  };

  return system;
}
