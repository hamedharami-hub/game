import * as T from 'three';
import { cellUnlocked, gridSize, growthStage, harvest, plantAt, species, type Plant, type Species, type State } from './state';
import { planetElevation } from './interactions';
import { gardenTangentEuler } from './garden-transform';

type Cell = { col: number; row: number; sx: number; sz: number; color: string };
type BloomParticle = { mesh: T.Mesh; velocity: T.Vector3; bornAt: number };
type Part = { owner: Owner; set: PartSet; local: T.Matrix4; color: T.Color; slot: number };
type PartSet = { geometry: T.BufferGeometry; material: T.Material; parts: Part[]; mesh: T.InstancedMesh | null };
type Owner = {
  kind: 'plant' | 'reaction' | 'pollinator';
  matrix: T.Matrix4;
  parts: Part[];
  live: boolean;
  apply: (now: number) => void;
};

const SOIL_COLORS = ['#809d69', '#86a36e', '#789562', '#8aa873'];
const LEAF_COLORS = ['#639c70', '#75a96e', '#80ad73'];

export function createGarden(
  scene: T.Scene,
  getState: () => State,
  change: (s: State) => void,
  onOpen: () => void,
  onClose: () => void,
  onProjects: () => void,
) {
  const root = new T.Group();
  root.position.set(-2, planetElevation(-2, 14) + .02, 14);
  const initialOrientation = gardenTangentEuler(-2, 14, 0);
  root.rotation.set(initialOrientation.x, initialOrientation.y, initialOrientation.z, initialOrientation.order);
  root.name = 'planting-garden';
  scene.add(root);

  const cells: Cell[] = [];
  const visibleCells: Cell[] = [];
  const particles: BloomParticle[] = [];
  const plantPositions = new Map<string, T.Vector3>();
  let editing = false;
  let kind: Species = 'moonflower';
  let selected: string | null = null;
  let lastTick = 0;
  let stageSignature = '';
  let reactionSignature = '';
  let cellSignature = '';
  const baseBedColor = new T.Color('#76915e');
  const targetBedColor = baseBedColor.clone();
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const geometries = {
    seed: new T.SphereGeometry(.12, 12, 8),
    stem: new T.CylinderGeometry(.025, .045, 1, 7),
    leaf: new T.SphereGeometry(1, 10, 8),
    petal: new T.SphereGeometry(1, 12, 8),
    core: new T.SphereGeometry(1, 12, 8),
    soil: new T.CircleGeometry(.48, 14),
    ring: new T.TorusGeometry(.34, .022, 5, 24),
    sparkle: new T.SphereGeometry(.045, 7, 5),
    glow: new T.CircleGeometry(.52, 24),
    glowRing: new T.TorusGeometry(.43, .018, 4, 24),
    butterflyWing: new T.SphereGeometry(1, 9, 7),
    butterflyBody: new T.CylinderGeometry(.012, .018, .15, 5),
    plot: new T.CircleGeometry(8.25, 64),
    plotRim: new T.TorusGeometry(8.22, .14, 7, 64),
  };
  const materials = new Map<string, T.MeshStandardMaterial>();
  const material = (color: string) => {
    let value = materials.get(color);
    if (!value) {
      value = new T.MeshStandardMaterial({ color, roughness: .74, metalness: 0, flatShading: true });
      materials.set(color, value);
    }
    return value;
  };
  const make = (geometry: T.BufferGeometry, color: string, parent: T.Object3D) => {
    const mesh = new T.Mesh(geometry, material(color));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
  };

  // Every repeated garden element (soil cells, plant parts, ground glows,
  // pollinators) is one InstancedMesh per geometry with per-instance colour, so
  // the planting bed costs a fixed handful of draw calls instead of one per cell
  // or per petal.
  const partMaterial = new T.MeshStandardMaterial({ color: '#ffffff', roughness: .74, metalness: 0, flatShading: true });
  const glowMaterial = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .12, depthWrite: false, toneMapped: false });
  const ringMaterial = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .44, depthWrite: false, toneMapped: false });
  const wingMaterial = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: .92, depthWrite: false, toneMapped: false });
  const pollinatorBodyMaterial = new T.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 1, depthWrite: false, toneMapped: false });

  const sets: PartSet[] = [];
  const owners: Owner[] = [];
  const dummy = new T.Object3D();
  const scratch = new T.Matrix4();
  const unitScale = new T.Vector3();
  const setFor = (geometry: T.BufferGeometry, materialOfSet: T.Material) => {
    let set = sets.find(s => s.geometry === geometry && s.material === materialOfSet);
    if (!set) {
      set = { geometry, material: materialOfSet, parts: [], mesh: null };
      sets.push(set);
    }
    return set;
  };
  const newOwner = (kindOfOwner: Owner['kind'], live: boolean, apply: (now: number) => void) => {
    const owner: Owner = { kind: kindOfOwner, matrix: new T.Matrix4(), parts: [], live, apply };
    owners.push(owner);
    return owner;
  };
  const hang = (owner: Owner, set: PartSet, color: string, place: (d: T.Object3D) => void) => {
    dummy.position.set(0, 0, 0);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(1, 1, 1);
    place(dummy);
    dummy.updateMatrix();
    owner.parts.push({ owner, set, local: dummy.matrix.clone(), color: new T.Color(color), slot: -1 });
  };

  const panel = document.createElement('section');
  panel.className = 'garden-panel glass';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'باغ');
  document.querySelector('main')!.append(panel);
  const notice = document.createElement('div');
  notice.className = 'garden-notice';
  notice.setAttribute('role', 'status');
  notice.setAttribute('aria-live', 'polite');

  const flowerColor = (p: Plant) => species[p.species].color;
  const leafColor = (p: Plant, index: number) => LEAF_COLORS[(p.col * 3 + p.row + index) % LEAF_COLORS.length];

  const gardenBed = make(geometries.plot, '#76915e', root);
  gardenBed.rotation.x = -Math.PI / 2;
  gardenBed.position.y = .035;
  gardenBed.scale.set(1, .84, 1);
  const gardenRim = make(geometries.plotRim, '#b78c54', root);
  gardenRim.rotation.x = Math.PI / 2;
  gardenRim.position.y = .067;
  gardenRim.scale.set(1, .84, 1);

  // Subtle ground cells keep planting targets easy to find without reading as a checkerboard.
  for (let row = -2; row < 10; row++) for (let col = -2; col < 10; col++) {
    cells.push({
      col, row,
      sx: 1 + ((col * 3 + row + 40) % 4) * .012,
      sz: 1 + ((col + row * 5 + 40) % 4) * .012,
      color: SOIL_COLORS[Math.abs(col * 7 + row * 11) % SOIL_COLORS.length],
    });
  }
  const cellMesh = new T.InstancedMesh(geometries.soil, partMaterial, cells.length);
  cellMesh.name = 'garden-cells';
  cellMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  cellMesh.castShadow = false;
  cellMesh.receiveShadow = false;
  root.add(cellMesh);
  const cellDummy = new T.Object3D();
  const syncCells = (state: State) => {
    const unlocked = cells.filter(cell => cellUnlocked(state.plotLevel, cell.col, cell.row));
    const signature = `${state.plotLevel}:${unlocked.length}`;
    if (signature === cellSignature) return;
    cellSignature = signature;
    visibleCells.length = 0;
    visibleCells.push(...unlocked);
    unlocked.forEach((cell, i) => {
      cellDummy.position.set(cell.col - 3.5, .072, cell.row - 3.5);
      cellDummy.rotation.set(-Math.PI / 2, 0, 0);
      cellDummy.scale.set(cell.sx, cell.sz, 1);
      cellDummy.updateMatrix();
      cellMesh.setMatrixAt(i, cellDummy.matrix);
      cellMesh.setColorAt(i, new T.Color(cell.color));
    });
    cellMesh.count = unlocked.length;
    cellMesh.visible = unlocked.length > 0;
    cellMesh.instanceMatrix.needsUpdate = true;
    if (cellMesh.instanceColor) cellMesh.instanceColor.needsUpdate = true;
    cellMesh.computeBoundingSphere();
  };

  const selection = new T.Mesh(geometries.ring, material('#f4d585'));
  selection.rotation.x = -Math.PI / 2;
  selection.position.y = .13;
  selection.visible = false;
  selection.renderOrder = 2;
  root.add(selection);

  function removePlants() {
    for (let i = owners.length - 1; i >= 0; i--) if (owners[i].kind === 'plant') owners.splice(i, 1);
    plantPositions.clear();
  }

  function clearReactions() {
    for (let i = owners.length - 1; i >= 0; i--) {
      if (owners[i].kind === 'reaction' || owners[i].kind === 'pollinator') owners.splice(i, 1);
    }
  }

  function addButterfly(x: number, z: number, phase: number, radius: number) {
    const owner = newOwner('pollinator', !reducedMotion, now => {
      if (reducedMotion) {
        owner.matrix.identity().setPosition(x, .68, z);
        return;
      }
      const angle = now * .00048 + phase;
      owner.matrix.makeRotationY(-angle);
      owner.matrix.setPosition(
        x + Math.cos(angle) * radius,
        .68 + Math.sin(angle * 1.7) * .045,
        z + Math.sin(angle) * radius * .72,
      );
    });
    for (const [side, color] of [[-1, '#f8d477'], [1, '#eaa6c6']] as const) {
      hang(owner, setFor(geometries.butterflyWing, wingMaterial), color, d => {
        d.position.set(side * .065, 0, 0);
        d.scale.set(.073, .105, .028);
        d.rotation.z = side * -.34;
      });
    }
    hang(owner, setFor(geometries.butterflyBody, pollinatorBodyMaterial), '#655b59', d => { d.position.y = -.005; });
  }

  function updateGardenReactions(state: State, now: number, force = false) {
    // Seedlings do not trigger reactions; only visibly flowering plants count.
    const flowers = state.plants
      .filter(p => growthStage(p, now) >= 2)
      .slice()
      .sort((a, b) => a.row - b.row || a.col - b.col || a.species.localeCompare(b.species));
    const signature = flowers.map(p => `${p.species}:${p.col}:${p.row}`).join('|');
    if (!force && signature === reactionSignature) return;
    reactionSignature = signature;
    clearReactions();

    const flowerTypes = new Set(flowers.map(p => p.species));
    const richness = Math.max(0, Math.min(1, (flowerTypes.size - 1) / 3));
    const richerBed = new T.Color('#b0a46b');
    targetBedColor.copy(baseBedColor).lerp(richerBed, richness * .38);
    if (reducedMotion) gardenBed.material.color.copy(targetBedColor);

    // Moonflower and starlily blooms cast a quiet pool and ring of color on the soil.
    for (const p of flowers) {
      if (p.species !== 'moonflower' && p.species !== 'starlily') continue;
      const x = p.col - 3.5;
      const z = p.row - 3.5;
      const color = p.species === 'moonflower' ? '#bda9ff' : '#f5a8c8';
      const glow = newOwner('reaction', false, () => {});
      hang(glow, setFor(geometries.glow, glowMaterial), color, d => {
        d.rotation.x = -Math.PI / 2;
        d.position.set(x, .081, z);
        d.scale.set(.86, .86, 1);
      });
      const ring = newOwner('reaction', false, () => {});
      hang(ring, setFor(geometries.glowRing, ringMaterial), color, d => {
        d.rotation.x = -Math.PI / 2;
        d.position.set(x, .09, z);
      });
    }

    // Mixed-species pockets attract butterflies. Centers and phases come only from
    // plant coordinates and species, so a layout always produces the same response.
    const centers: Array<{ x: number; z: number; phase: number }> = [];
    for (const flower of flowers) {
      const nearby = flowers.filter(other => Math.hypot(other.col - flower.col, other.row - flower.row) <= 2.35);
      if (new Set(nearby.map(p => p.species)).size < 2) continue;
      const x = nearby.reduce((sum, p) => sum + p.col - 3.5, 0) / nearby.length;
      const z = nearby.reduce((sum, p) => sum + p.row - 3.5, 0) / nearby.length;
      if (centers.some(center => Math.hypot(center.x - x, center.z - z) < 1.65)) continue;
      const phase = ((flower.col + 12) * 17 + (flower.row + 12) * 31) % 100 / 100 * Math.PI * 2;
      centers.push({ x, z, phase });
    }
    centers.slice(0, 6).forEach((center, index) => {
      addButterfly(center.x, center.z, center.phase, .28 + (index % 2) * .08);
      if (centers.length < 3) addButterfly(center.x + .24, center.z + .12, center.phase + Math.PI, .22);
    });
  }

  function renderPlant(p: Plant, now: number) {
    const stage = growthStage(p, now);
    const color = flowerColor(p);
    const x = p.col - 3.5;
    const z = p.row - 3.5;
    const sway = ((p.col * 7 + p.row * 11) % 9) * .18;
    const owner = newOwner('plant', !reducedMotion, time => {
      if (reducedMotion) {
        owner.matrix.identity().setPosition(x, .11, z);
        return;
      }
      owner.matrix.makeRotationZ(Math.sin(time * .0011 + sway) * .026);
      const age = Math.max(0, Math.min(1, (time - p.plantedAt) / 550));
      const pop = .72 + .28 * (1 - Math.pow(1 - age, 3));
      const scale = pop * (1 + Math.sin(time * .0018 + sway) * .018);
      owner.matrix.scale(unitScale.set(scale, scale, scale));
      owner.matrix.setPosition(x, .11, z);
    });
    plantPositions.set(p.id, new T.Vector3(x, .11, z));
    const part = (geometry: T.BufferGeometry, partColor: string, place: (d: T.Object3D) => void) =>
      hang(owner, setFor(geometry, partMaterial), partColor, place);

    if (stage === 0) {
      part(geometries.seed, '#ead3a0', d => { d.position.y = .08; d.scale.set(.82, .52, .72); });
      return;
    }

    const height = stage === 1 ? .27 : stage === 2 ? .49 : .66;
    part(geometries.stem, '#588f66', d => { d.scale.y = height; d.position.y = height / 2; });
    const leafScale = stage === 1 ? .8 : 1;
    for (const side of [-1, 1]) {
      part(geometries.leaf, leafColor(p, side + 1), d => {
        d.position.set(side * .13 * leafScale, stage === 1 ? .12 : .17, 0);
        d.scale.set(.22 * leafScale, .075 * leafScale, .12 * leafScale);
        d.rotation.z = side * -.38;
      });
    }

    if (stage === 1) {
      part(geometries.core, color, d => { d.position.y = height + .03; d.scale.set(.105, .13, .105); });
      return;
    }

    if (p.species === 'spiritfern') {
      const fronds = stage === 2 ? 4 : 6;
      for (let i = 0; i < fronds; i++) {
        const angle = i / fronds * Math.PI * 2 + .2;
        part(geometries.leaf, color, d => {
          d.position.set(Math.cos(angle) * .12, height * (.55 + (i % 3) * .1), Math.sin(angle) * .12);
          d.scale.set(.075, .3 + (i % 2) * .06, .09);
          d.rotation.z = Math.cos(angle) * .45;
          d.rotation.x = Math.sin(angle) * .38;
        });
      }
    } else {
      const count = stage === 2 ? 4 : p.species === 'sunblossom' ? 7 : 6;
      const radius = stage === 2 ? .13 : p.species === 'sunblossom' ? .22 : .19;
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        part(geometries.petal, color, d => {
          d.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
          d.scale.set(stage === 2 ? .075 : .105, stage === 2 ? .1 : .17, .08);
          d.rotation.y = -angle;
          d.rotation.z = Math.cos(angle) * .15;
        });
      }
      const centerColor = p.species === 'sunblossom' ? '#f8e09a' : '#fff0c4';
      part(geometries.core, centerColor, d => {
        d.position.y = height + .015;
        d.scale.set(stage === 2 ? .08 : .105, .085, stage === 2 ? .08 : .105);
      });
    }
  }

  /** Rebuilds every instanced batch from the owners that currently exist. */
  function rebuildInstances(now: number) {
    for (const set of sets) {
      if (set.mesh) {
        root.remove(set.mesh);
        set.mesh.dispose();
        set.mesh = null;
      }
      set.parts.length = 0;
    }
    for (const owner of owners) {
      owner.apply(now);
      for (const part of owner.parts) {
        part.slot = part.set.parts.length;
        part.set.parts.push(part);
      }
    }
    for (const set of sets) {
      const count = set.parts.length;
      if (!count) continue;
      const mesh = new T.InstancedMesh(set.geometry, set.material, count);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      for (let i = 0; i < count; i++) {
        const part = set.parts[i];
        mesh.setMatrixAt(i, scratch.multiplyMatrices(part.owner.matrix, part.local));
        mesh.setColorAt(i, part.color);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      set.mesh = mesh;
      root.add(mesh);
    }
  }

  /** Refreshes the matrices of every animated batch (plants sway, pollinators drift). */
  function refreshAnimatedInstances(now: number) {
    for (const owner of owners) if (owner.live) owner.apply(now);
    const dirty = new Set<PartSet>();
    for (const owner of owners) {
      if (!owner.live) continue;
      for (const part of owner.parts) {
        if (!part.set.mesh) continue;
        part.set.mesh.setMatrixAt(part.slot, scratch.multiplyMatrices(owner.matrix, part.local));
        dirty.add(part.set);
      }
    }
    for (const set of dirty) if (set.mesh) set.mesh.instanceMatrix.needsUpdate = true;
  }

  function statusFor(p: Plant | undefined, now: number) {
    if (!p) return `${species[kind].name} · روی خاک خالی بزن`;
    const stage = growthStage(p, now);
    const shortStages = ['تازه کاشته شد', 'در حال رشد', 'نزدیک شکفتن', 'آمادهٔ چیدن'];
    return `${species[p.species].name} · ${shortStages[stage]}`;
  }

  function redraw(now = Date.now()) {
    const state = getState();
    syncCells(state);
    removePlants();
    for (const p of state.plants) renderPlant(p, now);
    updateGardenReactions(state, now, true);
    rebuildInstances(now);
    const selectedPlant = state.plants.find(p => p.id === selected);
    selection.visible = !!selectedPlant;
    if (selectedPlant) selection.position.set(selectedPlant.col - 3.5, .13, selectedPlant.row - 3.5);
    stageSignature = state.plants.map(p => `${p.id}:${growthStage(p, now)}:${p.col}:${p.row}`).join('|');
    if (editing) updatePanel(now);
  }

  function burstAt(p: Plant, now: number) {
    if (reducedMotion) return;
    const origin = plantPositions.get(p.id);
    if (!origin) return;
    const color = flowerColor(p);
    const count = 9;
    for (let i = 0; i < count; i++) {
      const angle = i / count * Math.PI * 2 + .15;
      const mesh = make(geometries.sparkle, color, root);
      mesh.position.set(origin.x, .3 + (i % 3) * .04, origin.z);
      particles.push({ mesh, velocity: new T.Vector3(Math.cos(angle) * (.35 + (i % 3) * .08), .55 + (i % 4) * .09, Math.sin(angle) * (.35 + (i % 2) * .1)), bornAt: now });
    }
  }

  function collect(p: Plant, now = Date.now()) {
    if (growthStage(p, now) < 3) return false;
    burstAt(p, now);
    const next = harvest(getState(), p.id, now);
    if (next === getState()) return false;
    change(next);
    notice.textContent = `${species[p.species].name} چیده شد`;
    redraw(now);
    return true;
  }

  function selectCell(col: number, row: number) {
    const state = getState();
    if (!cellUnlocked(state.plotLevel, col, row)) {
      notice.textContent = 'این خاک هنوز آماده نیست';
      return;
    }
    const existing = state.plants.find(p => p.col === col && p.row === row);
    if (existing) {
      selected = existing.id;
      const now = Date.now();
      if (growthStage(existing, now) === 3 && collect(existing, now)) {
        renderPanel();
        return;
      }
      notice.textContent = statusFor(existing, now);
    } else {
      const id = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `plant-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const next = plantAt(state, kind, col, row, Date.now(), id);
      if (next === state) return;
      selected = id;
      change(next);
      notice.textContent = `${species[kind].name} کاشته شد`;
    }
    redraw();
    renderPanel();
  }

  function renderPanel() {
    if (!editing) return;
    const state = getState();
    const now = Date.now();
    const p = state.plants.find(p => p.id === selected);
    const detailsOpen = !!panel.querySelector('details[open]');
    const focus = panel.contains(document.activeElement) ? (document.activeElement as HTMLElement).id : '';
    const size = gridSize(state.plotLevel);
    const speciesButtons = Object.entries(species).map(([id, spec]) => `
      <button id="species-${id}" data-species="${id}" aria-pressed="${kind === id}" aria-label="کاشت ${spec.name}" title="${spec.name}">
        <span class="garden-seed" aria-hidden="true" style="--seed-color:${spec.color}"></span>${spec.name}
      </button>`).join('');
    const gridSignature = state.plants.map(plant => `${plant.id}:${growthStage(plant, now)}:${plant.col}:${plant.row}`).join('|');
    const cellsMarkup = cells.filter(cell => cellUnlocked(state.plotLevel, cell.col, cell.row)).map(cell => {
      const { col, row } = cell;
      const plant = state.plants.find(item => item.col === col && item.row === row);
      const label = plant ? `${species[plant.species].name} · ${['بذر', 'جوانه', 'بوته', 'شکوفه'][growthStage(plant, now)]}` : `خاک خالی ${row + 1}، ${col + 1}`;
      return `<button id="cell-${col}-${row}" data-col="${col}" data-row="${row}" aria-label="${label}" aria-pressed="${plant?.id === selected}">${plant ? '<span aria-hidden="true">✿</span>' : '<span aria-hidden="true">·</span>'}</button>`;
    }).join('');

    panel.innerHTML = `
      <div class="garden-heading"><strong>باغ</strong><button id="garden-close" aria-label="بازگشت به دشت">بازگشت</button></div>
      <div class="garden-tools" role="group" aria-label="انتخاب گل">${speciesButtons}</div>
      <div class="plant-info" aria-live="polite">${statusFor(p, now)}</div>
      <div class="garden-actions"><button id="garden-harvest" ${p && growthStage(p, now) === 3 ? '' : 'disabled'}>چیدن</button><button id="garden-design">ساخت</button></div>
      <details ${detailsOpen ? 'open' : ''}><summary>کاشت با فهرست</summary><div class="garden-grid" data-signature="${gridSignature}" role="group" aria-label="خانه‌های باغ" style="grid-template-columns:repeat(${size},1fr)">${cellsMarkup}</div></details>`;
    panel.append(notice);

    panel.querySelector<HTMLButtonElement>('#garden-close')!.onclick = close;
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-species]')) {
      button.onclick = () => {
        kind = button.dataset.species as Species;
        selected = null;
        notice.textContent = '';
        renderPanel();
      };
    }
    panel.querySelector<HTMLButtonElement>('#garden-harvest')!.onclick = () => {
      const current = getState().plants.find(item => item.id === selected);
      if (current) collect(current);
      renderPanel();
    };
    panel.querySelector<HTMLButtonElement>('#garden-design')!.onclick = onProjects;
    bindCells();
    if (focus) panel.querySelector<HTMLButtonElement>(`#${focus}`)?.focus({ preventScroll: true });
  }

  function bindCells() {
    for (const button of panel.querySelectorAll<HTMLButtonElement>('[data-col]')) {
      button.onclick = () => selectCell(Number(button.dataset.col), Number(button.dataset.row));
    }
  }

  function updatePanel(now = Date.now()) {
    if (!editing) return;
    const state = getState();
    const p = state.plants.find(item => item.id === selected);
    const info = panel.querySelector<HTMLElement>('.plant-info');
    const message = statusFor(p, now);
    if (info && info.textContent !== message) info.textContent = message;
    const harvestButton = panel.querySelector<HTMLButtonElement>('#garden-harvest');
    if (harvestButton) harvestButton.disabled = !p || growthStage(p, now) < 3;
    const details = panel.querySelector('details');
    const wasOpen = !!details?.open;
    const grid = panel.querySelector<HTMLElement>('.garden-grid');
    if (grid) {
      const next = state.plants.map(plant => `${plant.id}:${growthStage(plant, now)}:${plant.col}:${plant.row}`).join('|');
      if (grid.dataset.signature !== next) {
        grid.dataset.signature = next;
        grid.innerHTML = cells.filter(cell => cellUnlocked(state.plotLevel, cell.col, cell.row)).map(cell => {
          const { col, row } = cell;
          const plant = state.plants.find(item => item.col === col && item.row === row);
          const label = plant ? `${species[plant.species].name} · ${['بذر', 'جوانه', 'بوته', 'شکوفه'][growthStage(plant, now)]}` : `خاک خالی ${row + 1}، ${col + 1}`;
          return `<button id="cell-${col}-${row}" data-col="${col}" data-row="${row}" aria-label="${label}" aria-pressed="${plant?.id === selected}">${plant ? '<span aria-hidden="true">✿</span>' : '<span aria-hidden="true">·</span>'}</button>`;
        }).join('');
        bindCells();
      }
    }
    if (details && wasOpen) details.open = true;
  }

  function open() {
    editing = true;
    document.querySelector('main')!.classList.add('gardening');
    panel.hidden = false;
    selected = null;
    notice.textContent = '';
    onOpen();
    redraw();
    renderPanel();
  }

  function close() {
    editing = false;
    document.querySelector('main')!.classList.remove('gardening');
    panel.hidden = true;
    onClose();
    redraw();
  }

  function setTransform(x: number, z: number, rotation = 0) {
    if (![x, z, rotation].every(Number.isFinite)) return false;
    root.position.set(x, planetElevation(x, z) + .02, z);
    const orientation = gardenTangentEuler(x, z, rotation);
    root.rotation.set(orientation.x, orientation.y, orientation.z, orientation.order);
    root.updateMatrixWorld(true);
    redraw();
    return true;
  }

  function tick(now: number) {
    if (now >= lastTick && now - lastTick < 160) return;
    const delta = Math.min(.2, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    const state = getState();
    const signature = state.plants.map(p => `${p.id}:${growthStage(p, now)}:${p.col}:${p.row}`).join('|');
    if (signature !== stageSignature) redraw(now);

    if (!reducedMotion) {
      refreshAnimatedInstances(now);
      gardenBed.material.color.lerp(targetBedColor, 1 - Math.exp(-delta * 2.2));
    } else {
      gardenBed.material.color.copy(targetBedColor);
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const particle = particles[i];
      const age = (now - particle.bornAt) / 1000;
      if (age >= .9) {
        root.remove(particle.mesh);
        particles.splice(i, 1);
        continue;
      }
      particle.velocity.y -= .9 * delta;
      particle.mesh.position.addScaledVector(particle.velocity, delta);
      particle.mesh.scale.setScalar(Math.max(.08, 1 - age));
    }
    if (editing) updatePanel(now);
  }

  redraw();
  return {
    open,
    close,
    redraw,
    tick,
    setTransform,
    get editing() { return editing; },
    owns: (raycaster: T.Raycaster) => cellMesh.visible && raycaster.intersectObject(cellMesh, false).length > 0,
    root,
    get focus() {
      root.updateMatrixWorld(true);
      return root.localToWorld(new T.Vector3(0, 0, -5));
    },
    hit(raycaster: T.Raycaster) {
      if (!editing) return false;
      const hit = raycaster.intersectObject(cellMesh, false)[0];
      const cell = hit?.instanceId === undefined ? undefined : visibleCells[hit.instanceId];
      if (!cell) return false;
      selectCell(cell.col, cell.row);
      return true;
    },
  };
}
