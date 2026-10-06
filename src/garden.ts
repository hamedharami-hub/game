import * as T from 'three';
import { cellUnlocked, gridSize, growthStage, harvest, plantAt, species, type Plant, type Species, type State } from './state';

type GardenCell = T.Mesh<T.CircleGeometry, T.MeshStandardMaterial> & { userData: { cell: { col: number; row: number } } };
type BloomParticle = { mesh: T.Mesh; velocity: T.Vector3; bornAt: number };
type Pollinator = { group: T.Group; x: number; z: number; phase: number; radius: number };

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
  root.position.set(-2, .02, 14);
  root.name = 'planting-garden';
  scene.add(root);

  const plantRoot = new T.Group();
  root.add(plantRoot);
  const reactionRoot = new T.Group();
  reactionRoot.name = 'garden-reactions';
  root.add(reactionRoot);
  const cells: GardenCell[] = [];
  const plantsById = new Map<string, T.Group>();
  const particles: BloomParticle[] = [];
  const pollinators: Pollinator[] = [];
  let editing = false;
  let kind: Species = 'moonflower';
  let selected: string | null = null;
  let lastTick = 0;
  let stageSignature = '';
  let reactionSignature = '';
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
  const reactionMaterials = new Map<string, T.MeshBasicMaterial>();
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
  const reactionMaterial = (color: string, opacity: number) => {
    const key = `${color}:${opacity}`;
    let value = reactionMaterials.get(key);
    if (!value) {
      value = new T.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false });
      reactionMaterials.set(key, value);
    }
    return value;
  };
  const makeReaction = (geometry: T.BufferGeometry, color: string, opacity: number, parent: T.Object3D) => {
    const mesh = new T.Mesh(geometry, reactionMaterial(color, opacity));
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    parent.add(mesh);
    return mesh;
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
    const cell = make(geometries.soil, SOIL_COLORS[Math.abs(col * 7 + row * 11) % SOIL_COLORS.length], root) as GardenCell;
    cell.rotation.x = -Math.PI / 2;
    cell.position.set(col - 3.5, .072, row - 3.5);
    cell.scale.set(1 + ((col * 3 + row + 40) % 4) * .012, 1 + ((col + row * 5 + 40) % 4) * .012, 1);
    cell.userData.cell = { col, row };
    cells.push(cell);
  }

  const selection = new T.Mesh(geometries.ring, material('#f4d585'));
  selection.rotation.x = -Math.PI / 2;
  selection.position.y = .13;
  selection.visible = false;
  selection.renderOrder = 2;
  root.add(selection);

  function removePlants() {
    for (const child of [...plantRoot.children]) plantRoot.remove(child);
    plantsById.clear();
  }

  function clearReactions() {
    for (const child of [...reactionRoot.children]) reactionRoot.remove(child);
    pollinators.length = 0;
  }

  function addButterfly(x: number, z: number, phase: number, radius: number) {
    const group = new T.Group();
    group.name = 'garden-butterfly';
    for (const [side, color] of [[-1, '#f8d477'], [1, '#eaa6c6']] as const) {
      const wing = makeReaction(geometries.butterflyWing, color, .92, group);
      wing.position.set(side * .065, 0, 0);
      wing.scale.set(.073, .105, .028);
      wing.rotation.z = side * -.34;
    }
    const body = makeReaction(geometries.butterflyBody, '#655b59', 1, group);
    body.position.y = -.005;
    group.position.set(x, .68, z);
    reactionRoot.add(group);
    pollinators.push({ group, x, z, phase, radius });
  }

  function updateGardenReactions(state: State, now: number) {
    // Seedlings do not trigger reactions; only visibly flowering plants count.
    const flowers = state.plants
      .filter(p => growthStage(p, now) >= 2)
      .slice()
      .sort((a, b) => a.row - b.row || a.col - b.col || a.species.localeCompare(b.species));
    const signature = flowers.map(p => `${p.species}:${p.col}:${p.row}`).join('|');
    if (signature === reactionSignature) return;
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
      const glow = makeReaction(geometries.glow, color, .12, reactionRoot);
      glow.rotation.x = -Math.PI / 2;
      glow.position.set(x, .081, z);
      glow.scale.set(.86, .86, 1);
      const ring = makeReaction(geometries.glowRing, color, .44, reactionRoot);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, .09, z);
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

  function addLeaves(group: T.Group, p: Plant, y: number, scale = 1) {
    for (const side of [-1, 1]) {
      const leaf = make(geometries.leaf, leafColor(p, side + 1), group);
      leaf.position.set(side * .13 * scale, y, 0);
      leaf.scale.set(.22 * scale, .075 * scale, .12 * scale);
      leaf.rotation.z = side * -.38;
    }
  }

  function addStem(group: T.Group, height: number, color = '#588f66') {
    const stem = make(geometries.stem, color, group);
    stem.scale.y = height;
    stem.position.y = height / 2;
  }

  function renderPlant(p: Plant, now: number) {
    const g = new T.Group();
    g.name = `plant-${p.id}`;
    g.position.set(p.col - 3.5, .11, p.row - 3.5);
    g.userData = { id: p.id, sway: ((p.col * 7 + p.row * 11) % 9) * .18, bornAt: p.plantedAt };
    plantRoot.add(g);
    plantsById.set(p.id, g);

    const stage = growthStage(p, now);
    const color = flowerColor(p);
    if (stage === 0) {
      const seed = make(geometries.seed, '#ead3a0', g);
      seed.position.y = .08;
      seed.scale.set(.82, .52, .72);
      return;
    }

    const height = stage === 1 ? .27 : stage === 2 ? .49 : .66;
    addStem(g, height);
    addLeaves(g, p, stage === 1 ? .12 : .17, stage === 1 ? .8 : 1);

    if (stage === 1) {
      const bud = make(geometries.core, color, g);
      bud.position.y = height + .03;
      bud.scale.set(.105, .13, .105);
      return;
    }

    if (p.species === 'spiritfern') {
      const fronds = stage === 2 ? 4 : 6;
      for (let i = 0; i < fronds; i++) {
        const angle = i / fronds * Math.PI * 2 + .2;
        const frond = make(geometries.leaf, color, g);
        frond.position.set(Math.cos(angle) * .12, height * (.55 + (i % 3) * .1), Math.sin(angle) * .12);
        frond.scale.set(.075, .3 + (i % 2) * .06, .09);
        frond.rotation.z = Math.cos(angle) * .45;
        frond.rotation.x = Math.sin(angle) * .38;
      }
    } else {
      const count = stage === 2 ? 4 : p.species === 'sunblossom' ? 7 : 6;
      const radius = stage === 2 ? .13 : p.species === 'sunblossom' ? .22 : .19;
      for (let i = 0; i < count; i++) {
        const angle = i / count * Math.PI * 2;
        const petal = make(geometries.petal, color, g);
        petal.position.set(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
        petal.scale.set(stage === 2 ? .075 : .105, stage === 2 ? .1 : .17, .08);
        petal.rotation.y = -angle;
        petal.rotation.z = Math.cos(angle) * .15;
      }
      const centerColor = p.species === 'sunblossom' ? '#f8e09a' : '#fff0c4';
      const center = make(geometries.core, centerColor, g);
      center.position.y = height + .015;
      center.scale.set(stage === 2 ? .08 : .105, .085, stage === 2 ? .08 : .105);
    }
  }

  function statusFor(p: Plant | undefined, now: number) {
    if (!p) return `${species[kind].name} · روی خاک خالی بزن`;
    const stage = growthStage(p, now);
    const shortStages = ['تازه کاشته شد', 'در حال رشد', 'نزدیک شکفتن', 'آمادهٔ چیدن'];
    return `${species[p.species].name} · ${shortStages[stage]}`;
  }

  function redraw(now = Date.now()) {
    const state = getState();
    for (const cell of cells) {
      const { col, row } = cell.userData.cell;
      const unlocked = cellUnlocked(state.plotLevel, col, row);
      cell.visible = unlocked;
    }
    removePlants();
    for (const p of state.plants) renderPlant(p, now);
    updateGardenReactions(state, now);
    const selectedPlant = state.plants.find(p => p.id === selected);
    selection.visible = !!selectedPlant;
    if (selectedPlant) selection.position.set(selectedPlant.col - 3.5, .13, selectedPlant.row - 3.5);
    stageSignature = state.plants.map(p => `${p.id}:${growthStage(p, now)}:${p.col}:${p.row}`).join('|');
    if (editing) updatePanel(now);
  }

  function burstAt(p: Plant, now: number) {
    if (reducedMotion) return;
    const group = plantsById.get(p.id);
    if (!group) return;
    const origin = group.position.clone();
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
    const cellsMarkup = cells.filter(cell => cellUnlocked(state.plotLevel, cell.userData.cell.col, cell.userData.cell.row)).map(cell => {
      const { col, row } = cell.userData.cell;
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
        grid.innerHTML = cells.filter(cell => cellUnlocked(state.plotLevel, cell.userData.cell.col, cell.userData.cell.row)).map(cell => {
          const { col, row } = cell.userData.cell;
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

  function tick(now: number) {
    if (now >= lastTick && now - lastTick < 160) return;
    const delta = Math.min(.2, Math.max(0, (now - lastTick) / 1000));
    lastTick = now;
    const state = getState();
    const signature = state.plants.map(p => `${p.id}:${growthStage(p, now)}:${p.col}:${p.row}`).join('|');
    if (signature !== stageSignature) redraw(now);

    if (!reducedMotion) {
      for (const plant of plantsById.values()) {
        const sway = plant.userData.sway as number;
        const bornAt = plant.userData.bornAt as number;
        plant.rotation.z = Math.sin(now * .0011 + sway) * .026;
        const age = Math.max(0, Math.min(1, (now - bornAt) / 550));
        const pop = .72 + .28 * (1 - Math.pow(1 - age, 3));
        plant.scale.setScalar(pop * (1 + Math.sin(now * .0018 + sway) * .018));
      }
      for (const pollinator of pollinators) {
        const angle = now * .00048 + pollinator.phase;
        pollinator.group.position.set(
          pollinator.x + Math.cos(angle) * pollinator.radius,
          .68 + Math.sin(angle * 1.7) * .045,
          pollinator.z + Math.sin(angle) * pollinator.radius * .72,
        );
        pollinator.group.rotation.y = -angle;
      }
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
    get editing() { return editing; },
    owns: (raycaster: T.Raycaster) => raycaster.intersectObjects(cells.filter(cell => cell.visible), false).length > 0,
    root,
    focus: new T.Vector3(-2, 0, 9),
    hit(raycaster: T.Raycaster) {
      if (!editing) return false;
      const hit = raycaster.intersectObjects(cells.filter(cell => cell.visible), false)[0];
      if (!hit) return false;
      selectCell(hit.object.userData.cell.col, hit.object.userData.cell.row);
      return true;
    },
  };
}
