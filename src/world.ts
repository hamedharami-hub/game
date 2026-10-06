import * as T from 'three';
import {
  decorationPosition,
  type Decoration,
  type District,
  type Furnishing,
  type State,
} from './state';
import type { ObstacleCircle } from './interactions';

/** Calculates spherical planet elevation drop to produce rolling planetary horizon. */
export function planetElevation(x: number, z: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
  const d2 = x * x + z * z;
  return -0.00032 * d2;
}

/** Places on one shared stretch of the Two-Horn planet. */
export const districts: Record<District, {
  name: string;
  subtitle: string;
  description: string;
  x: number;
  z: number;
  color: string;
  icon: string;
}> = {
  garden: { name: 'باغ مشترک', subtitle: 'کاشت و چیدمان آزاد', description: 'باغی برای کاشتن و وقت‌گذراندن کنار هم.', x: -2, z: 14, color: '#e6a9c2', icon: '❋' },
  greenhouse: { name: 'گلخانهٔ پیوند', subtitle: 'گوشه‌ای سبز و روشن', description: 'پناهگاهی پر از برگ، گل و نور صبح.', x: 20, z: 14, color: '#91cdb3', icon: '✿' },
  home: { name: 'خانهٔ ما', subtitle: 'خانه‌ای میان باغ‌ها', description: 'خانهٔ گرم و روشن دوشاخ‌ها.', x: -22, z: -10, color: '#e5bd91', icon: '⌂' },
  village: { name: 'میدان دوشاخ‌ها', subtitle: 'دیدار و گپ‌وگفت', description: 'میدانی کوچک برای دیدار همسایه‌ها.', x: 24, z: -13, color: '#f0cf84', icon: '♧' },
  grove: { name: 'بیشهٔ جویبار', subtitle: 'سایه و آب روان', description: 'راهی آرام میان درخت‌ها و آب.', x: -21, z: 19, color: '#8dc9bd', icon: '♤' },
  sanctuary: { name: 'چمنزار آرام', subtitle: 'نشستن زیر آسمان', description: 'فضایی باز برای نفس‌کشیدن و تماشای آسمان.', x: 0, z: -29, color: '#c2b0dd', icon: '✧' },
};

/**
 * Builds one continuous, walkable home for the whole game. The named places
 * are landmarks inside the landscape; activating one never hides the others.
 */
export function createWorld(scene: T.Scene) {
  const materials = new Map<string, T.MeshStandardMaterial>();
  const material = (color: string, emissive = false) => {
    const key = `${color}:${emissive}`;
    let value = materials.get(key);
    if (!value) {
      value = new T.MeshStandardMaterial({
        color,
        roughness: color === '#8bd5cd' ? 0.3 : 0.86,
        ...(emissive ? { emissive: color, emissiveIntensity: 0.48 } : {}),
      });
      materials.set(key, value);
    }
    return value;
  };

  const geometries = {
    box: new T.BoxGeometry(1, 1, 1),
    sphere: new T.SphereGeometry(1, 12, 9),
    cylinder: new T.CylinderGeometry(1, 1, 1, 12),
    cone: new T.ConeGeometry(1, 1, 8),
    torus: new T.TorusGeometry(1, 0.055, 6, 40),
    flowerHead: new T.IcosahedronGeometry(0.19, 0),
    flowerStem: new T.CylinderGeometry(0.025, 0.04, 0.55, 5),
  };
  const shape = (
    geometry: T.BufferGeometry,
    color: string,
    x: number,
    y: number,
    z: number,
    sx = 1,
    sy = 1,
    sz = 1,
    parent: T.Object3D = scene,
    glow = false,
  ) => {
    const mesh = new T.Mesh(geometry, material(color, glow));
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent?: T.Object3D) =>
    shape(geometries.box, color, x, y, z, sx, sy, sz, parent);
  const orb = (color: string, x: number, y: number, z: number, r: number, parent?: T.Object3D, glow = false) =>
    shape(geometries.sphere, color, x, y, z, r, r, r, parent, glow);
  const pillar = (color: string, x: number, y: number, z: number, r: number, h: number, parent?: T.Object3D) =>
    shape(geometries.cylinder, color, x, y, z, r, h, r, parent);

  const roots = {} as Record<District, T.Group>;
  for (const [id, place] of Object.entries(districts) as [District, typeof districts[District]][]) {
    const root = new T.Group();
    root.name = `place-${id}`;
    root.position.set(place.x, planetElevation(place.x, place.z), place.z);
    root.userData.district = id;
    roots[id] = root;
    scene.add(root);
  }

  // A wide green common, with a low coast so the world reads as one large place.
  const ocean = new T.Mesh(
    new T.CircleGeometry(450, 64),
    new T.MeshStandardMaterial({ color: '#55aeb5', roughness: 0.42, metalness: 0.02 }),
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -2.2;
  ocean.receiveShadow = true;
  scene.add(ocean);
  const groundMaterial = material('#779761');
  const groundGeom = new T.CylinderGeometry(87, 88, 0.92, 144, 16);
  const posAttr = groundGeom.getAttribute('position') as T.BufferAttribute;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    if (vy > 0) {
      posAttr.setY(i, vy + planetElevation(vx, vz));
    }
  }
  posAttr.needsUpdate = true;
  groundGeom.computeVertexNormals();

  const ground = new T.Mesh(groundGeom, groundMaterial);
  ground.name = 'two-horn-meadow';
  ground.position.y = -0.48;
  ground.receiveShadow = true;
  scene.add(ground);
  const shore = shape(new T.TorusGeometry(85.6, 1.75, 8, 144), '#d7b16f', 0, 0.025, 0, 1, 1, 1, scene);
  shore.rotation.x = Math.PI / 2;

  const pathMaterial = material('#ead39a');
  const pathPoints: T.Vector3[][] = [];
  const ribbonGeometry = (points: T.Vector3[], width: number, y: number) => {
    const positions = new Float32Array(points.length * 6);
    const indices: number[] = [];
    for (let i = 0; i < points.length; i++) {
      const before = points[Math.max(0, i - 1)];
      const after = points[Math.min(points.length - 1, i + 1)];
      const tangent = after.clone().sub(before).setY(0).normalize();
      const sideX = -tangent.z * width * 0.5;
      const sideZ = tangent.x * width * 0.5;
      const point = points[i];
      const at = i * 6;
      positions[at] = point.x + sideX;
      positions[at + 1] = y;
      positions[at + 2] = point.z + sideZ;
      positions[at + 3] = point.x - sideX;
      positions[at + 4] = y;
      positions[at + 5] = point.z - sideZ;
      if (i < points.length - 1) {
        const left = i * 2;
        indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3);
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  };
  const mainRoutes: [District, District][] = [
    ['garden', 'greenhouse'], ['garden', 'home'], ['garden', 'village'],
    ['garden', 'grove'], ['garden', 'sanctuary'],
  ];
  for (let i = 0; i < mainRoutes.length; i++) {
    const [from, to] = mainRoutes[i];
    const b = new T.Vector3(districts[to].x, 0.035, districts[to].z);
    const gardenCenter = new T.Vector3(districts[from].x, 0.035, districts[from].z);
    const delta = b.clone().sub(gardenCenter);
    const a = gardenCenter.clone().add(delta.clone().setY(0).normalize().multiplyScalar(9.2));
    const routeDelta = b.clone().sub(a);
    const side = new T.Vector3(-routeDelta.z, 0, routeDelta.x).normalize().multiplyScalar((i % 2 ? 1 : -1) * (2.5 + i % 3));
    const control = a.clone().lerp(b, 0.5).add(side);
    const curve = new T.QuadraticBezierCurve3(a, control, b);
    const points = curve.getPoints(36);
    pathPoints.push(points);
    const edging = new T.Mesh(ribbonGeometry(points, 3.2, 0.015), material('#b8ad8f'));
    edging.receiveShadow = true;
    scene.add(edging);
    const path = new T.Mesh(ribbonGeometry(points, 2.45, 0.03), pathMaterial);
    path.receiveShadow = true;
    scene.add(path);
  }

  // Soft clearings mark places without walls or teleport pads.
  for (const [id, place] of Object.entries(districts) as [District, typeof districts[District]][]) {
    const clearing = new T.Mesh(new T.CircleGeometry(8.6, 48), material(id === 'grove' ? '#82ad76' : '#86aa70'));
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.set(place.x, 0.009, place.z);
    clearing.scale.set(1.05, 0.84, 1);
    clearing.receiveShadow = true;
    scene.add(clearing);
  }

  // Flower meadows and tree belts are batched so the larger landscape stays light.
  let seed = 731;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const nearRoute = (x: number, z: number, margin: number) => pathPoints.some(points => {
    for (let i = 0; i < points.length; i += 3) {
      if (Math.hypot(points[i].x - x, points[i].z - z) < margin) return true;
    }
    return false;
  });
  const nearPlace = (x: number, z: number, margin: number) =>
    (Object.values(districts) as typeof districts[District][]).some(place => Math.hypot(place.x - x, place.z - z) < margin);

  const treePositions: { x: number; z: number; size: number; tone: string; lean: number }[] = [];
  for (let tries = 0; treePositions.length < 150 && tries < 1200; tries++) {
    const angle = random() * Math.PI * 2;
    const radius = 30 + random() * 49;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.hypot(x, z) > 79 || nearPlace(x, z, 10) || nearRoute(x, z, 4.8)) continue;
    treePositions.push({
      x, z, size: 0.68 + random() * 0.72,
      tone: ['#4c8557', '#61985b', '#80a85f', '#4f927f'][Math.floor(random() * 4)],
      lean: (random() - 0.5) * 0.16,
    });
  }
  const trunkGeometry = new T.CylinderGeometry(0.16, 0.34, 3.2, 7);
  const crownGeometry = new T.SphereGeometry(1, 9, 7);
  const trunks = new T.InstancedMesh(trunkGeometry, material('#79583f'), treePositions.length);
  const crowns = new T.InstancedMesh(crownGeometry, material('#ffffff'), treePositions.length);
  trunks.receiveShadow = true;
  crowns.castShadow = true;
  crowns.receiveShadow = true;
  const dummy = new T.Object3D();
  treePositions.forEach((tree, i) => {
    dummy.position.set(tree.x, 1.52 * tree.size, tree.z);
    dummy.scale.setScalar(tree.size);
    dummy.rotation.set(0, tree.lean, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.set(tree.x, 3.55 * tree.size, tree.z);
    dummy.scale.set(1.9 * tree.size, 1.75 * tree.size, 1.8 * tree.size);
    dummy.updateMatrix();
    crowns.setMatrixAt(i, dummy.matrix);
    crowns.setColorAt(i, new T.Color(tree.tone));
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  scene.add(trunks, crowns);

  const flowerLocations: { x: number; z: number; size: number }[] = [];
  for (let tries = 0; flowerLocations.length < 620 && tries < 5000; tries++) {
    const angle = random() * Math.PI * 2;
    const radius = 17 + random() * 60;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.hypot(x, z) > 81 || nearPlace(x, z, 7.2) || nearRoute(x, z, 2.2)) continue;
    flowerLocations.push({ x, z, size: 0.68 + random() * 0.75 });
  }
  const stems = new T.InstancedMesh(geometries.flowerStem, material('#658f71'), flowerLocations.length);
  const petals = new T.InstancedMesh(geometries.flowerHead, material('#ffffff'), flowerLocations.length);
  stems.castShadow = false;
  petals.castShadow = false;
  const petalColors = ['#f3c45e', '#e89aba', '#c9b5f5', '#f1e77b', '#76c8ae'];
  flowerLocations.forEach((flower, i) => {
    dummy.position.set(flower.x, 0.29 * flower.size, flower.z);
    dummy.scale.set(flower.size, flower.size, flower.size);
    dummy.rotation.set(0, random() * Math.PI * 2, (random() - 0.5) * 0.18);
    dummy.updateMatrix();
    stems.setMatrixAt(i, dummy.matrix);
    dummy.position.y = 0.62 * flower.size;
    dummy.scale.setScalar(flower.size);
    dummy.updateMatrix();
    petals.setMatrixAt(i, dummy.matrix);
    petals.setColorAt(i, new T.Color(petalColors[Math.floor(random() * petalColors.length)]));
  });
  stems.instanceMatrix.needsUpdate = true;
  petals.instanceMatrix.needsUpdate = true;
  scene.add(stems, petals);

  // A low pond, a round shared table and benches give the landscape a social heart.
  const commons = new T.Group();
  commons.position.set(0, 0, 0);
  scene.add(commons);
  const pond = new T.Mesh(new T.CylinderGeometry(5.7, 6.2, 0.22, 48), material('#d1c29c'));
  pond.position.set(0, 0.1, 0);
  commons.add(pond);
  const water = new T.Mesh(new T.CircleGeometry(5.25, 48), material('#8bd5cd'));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.23;
  commons.add(water);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    orb('#e9d3a0', Math.cos(angle) * 7.4, 0.32, Math.sin(angle) * 7.4, 0.44, commons);
    const seat = box('#b28c69', Math.cos(angle) * 9.2, 0.64, Math.sin(angle) * 9.2, 2.2, 0.22, 0.75, commons);
    seat.rotation.y = -angle;
    for (const side of [-0.72, 0.72]) pillar('#8f755d', Math.cos(angle) * 9.2 + Math.cos(angle + Math.PI / 2) * side, 0.29, Math.sin(angle) * 9.2 + Math.sin(angle + Math.PI / 2) * side, 0.08, 0.58, commons);
  }
  const communityTree = new T.Group();
  communityTree.position.set(0, 0, -13);
  commons.add(communityTree);
  pillar('#8b7259', 0, 3.2, 0, 0.75, 6.4, communityTree);
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 0.4;
    const limb = pillar('#8b7259', Math.cos(angle) * 1.5, 5.5, Math.sin(angle) * 1.5, 0.22, 3.4, communityTree);
    limb.rotation.z = Math.cos(angle) * -0.48;
    limb.rotation.x = Math.sin(angle) * 0.48;
    orb(['#92b781', '#a6c08c', '#95b6a4'][i % 3], Math.cos(angle) * 2.2, 7.2, Math.sin(angle) * 2.2, 2.5, communityTree);
  }

  // A small flowering entry arch frames the garden without hanging over the planting bed.
  const garden = roots.garden;
  for (const x of [-1.85, 1.85]) {
    pillar('#a88667', x, 1.28, -6.25, 0.14, 2.55, garden);
    orb('#e5bb87', x, 2.66, -6.25, 0.19, garden, true);
  }
  box('#b28e6d', 0, 2.5, -6.25, 4.05, 0.18, 0.2, garden);
  for (let i = 0; i < 5; i++) {
    const vine = orb(['#6c9c64', '#7bac6c', '#e58fa9'][i % 3], -1.55 + i * 0.78, 2.75, -6.25, 0.36, garden);
    vine.scale.set(0.38, 0.27, 0.32);
  }
  for (const x of [-7, 7]) {
    const bench = box('#b18b68', x, 0.54, 0, 2.8, 0.2, 0.75, garden);
    box('#b18b68', x, 0.93, 0.37, 2.8, 0.62, 0.16, garden);
    for (const dx of [-0.95, 0.95]) pillar('#93775c', x + dx, 0.29, 0, 0.07, 0.55, garden);
    bench.castShadow = false;
  }

  // Glassy, open-sided greenhouse: a calm landmark, not a gated activity.
  const greenhouse = roots.greenhouse;
  for (const x of [-3.5, 3.5]) for (const z of [-2.8, 2.8]) {
    pillar('#eee5cf', x, 1.65, z, 0.1, 3.3, greenhouse);
    orb('#f5d68f', x, 3.35, z, 0.2, greenhouse, true);
  }
  for (const x of [-3.5, 3.5]) for (const z of [-1.4, 1.4]) {
    const pane = box('#c9e8d9', x, 1.75, z, 0.08, 2.65, 2.55, greenhouse);
    pane.material = new T.MeshStandardMaterial({ color: '#c9e8d9', transparent: true, opacity: 0.25, roughness: 0.35, depthWrite: false, side: T.DoubleSide });
    pane.castShadow = false;
  }
  const greenhouseRoof = shape(geometries.cone, '#aec8aa', 0, 3.75, 0, 5.4, 1.6, 4.8, greenhouse);
  greenhouseRoof.rotation.y = Math.PI / 4;
  for (const x of [-2.2, 2.2]) {
    box('#9f7b5d', x, 0.62, 0, 1.55, 0.18, 4.2, greenhouse);
    for (let i = 0; i < 4; i++) {
      const stem = pillar('#668f72', x + (i % 2 ? 0.28 : -0.28), 1, -1.35 + i * 0.9, 0.035, 0.9, greenhouse);
      stem.rotation.z = (i % 2 ? -1 : 1) * 0.16;
      orb(i % 2 ? '#edb6ce' : '#e7d38f', x + (i % 2 ? 0.28 : -0.28), 1.47, -1.35 + i * 0.9, 0.22, greenhouse);
    }
  }

  // A cozy home with a porch, flower boxes and a low chimney.
  const home = roots.home;
  const windowGlowMaterial = new T.MeshStandardMaterial({
    color: '#edd5a0', emissive: '#d99b4e', emissiveIntensity: 0.2,
    roughness: 0.45, metalness: 0.02,
  });
  box('#eadcc2', 0, 1.5, 0, 5.4, 3, 4.2, home);
  const roof = shape(geometries.cone, '#ad8177', 0, 3.4, 0, 4.5, 2.1, 4.2, home);
  roof.rotation.y = Math.PI / 4;
  box('#8c715a', 0, 0.95, 2.12, 1.05, 1.9, 0.12, home);
  for (const x of [-1.65, 1.65]) {
    const window = box('#edd5a0', x, 1.85, 2.15, 0.9, 0.82, 0.12, home);
    window.material = windowGlowMaterial;
    box('#d8b56f', x, 1.34, 2.22, 1.18, 0.16, 0.35, home);
  }
  for (const x of [-2, 2]) pillar('#e8d4b5', x, 1.5, 3.4, 0.12, 3, home);
  box('#a37c5f', 0, 3.02, 3.4, 4.6, 0.16, 1.9, home);
  box('#a37c5f', 0, 0.17, 3.65, 5.4, 0.2, 2.4, home);
  pillar('#9c7861', 1.9, 4.12, -1.35, 0.28, 1.55, home);
  box('#ede2c9', 0, 0.82, 4.8, 2.8, 0.15, 0.72, home);

  // A small village square around a water bowl; friendly residents wander slowly.
  const village = roots.village;
  const residentRoots: T.Group[] = [];
  const residentColors = ['#c99383', '#829e95', '#a891bc', '#d1aa6e', '#7f9cac', '#c491a8'];
  for (const [i, [x, z]] of [[-5, -4], [5, -4], [-5, 4], [5, 4]].entries()) {
    const house = new T.Group();
    house.position.set(x, 0, z);
    village.add(house);
    box('#eee1c8', 0, 1, 0, 3.2, 2, 2.8, house);
    const rooflet = shape(geometries.cone, residentColors[i], 0, 2.45, 0, 2.55, 1.2, 2.35, house);
    rooflet.rotation.y = Math.PI / 4;
    box('#967657', 0, 0.72, 1.43, 0.65, 1.42, 0.08, house);
    box('#c6d6bd', -0.95, 1.27, 1.46, 0.57, 0.62, 0.08, house);
  }
  const fountainBase = pillar('#dfd2b7', 0, 0.2, 0, 2.1, 0.4, village);
  fountainBase.scale.z = 0.84;
  pillar('#9bdbd1', 0, 0.44, 0, 1.72, 0.08, village);
  pillar('#dfd2b7', 0, 0.96, 0, 0.34, 1.1, village);
  orb('#b5e6da', 0, 1.63, 0, 0.44, village, true);
  for (const x of [-7, 7]) {
    pillar('#977960', x, 1.35, 0, 0.1, 2.7, village);
    orb('#ffe8ae', x, 2.76, 0, 0.31, village, true);
  }
  const makeResident = (color: string, x: number, z: number) => {
    const resident = new T.Group();
    resident.position.set(x, 0, z);
    village.add(resident);
    shape(geometries.cone, color, 0, 0.7, 0, 0.36, 1.4, 0.32, resident);
    orb(color, 0, 1.24, 0, 0.31, resident);
    orb('#eee5d6', 0, 1.75, 0, 0.29, resident);
    orb('#c8b99d', 0, 1.86, -0.04, 0.25, resident);
    for (const dx of [-0.15, 0.15]) {
      const horn = shape(geometries.cone, '#f5ead7', dx, 2.18, 0, 0.06, 0.48, 0.06, resident);
      horn.rotation.z = -dx * 0.8;
    }
    for (const side of [-1, 1]) {
      const arm = pillar('#eee5d6', side * 0.29, 1.05, 0, 0.065, 0.62, resident);
      arm.rotation.z = side * 0.2;
    }
    resident.userData.origin = new T.Vector3(x, 0, z);
    resident.userData.phase = random() * Math.PI * 2;
    residentRoots.push(resident);
  };
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7;
    makeResident(residentColors[i % residentColors.length], Math.cos(angle) * 9.6, Math.sin(angle) * 8.2);
  }

  // A shallow, winding stream and its timber footbridge.
  const grove = roots.grove;
  const streamCurve = new T.CatmullRomCurve3([
    new T.Vector3(-7, 0.035, -8), new T.Vector3(-4, 0.035, -5),
    new T.Vector3(2, 0.035, -2), new T.Vector3(3, 0.035, 2),
    new T.Vector3(-1, 0.035, 6), new T.Vector3(-4, 0.035, 9),
  ]);
  const banks = new T.Mesh(new T.TubeGeometry(streamCurve, 42, 1.06, 8, false), material('#c6b891'));
  const stream = new T.Mesh(new T.TubeGeometry(streamCurve, 42, 0.78, 8, false), material('#8bd5cd'));
  grove.add(banks, stream);
  const streamRipples: T.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const point = streamCurve.getPoint(0.17 + i * 0.2);
    const ripple = new T.Mesh(
      new T.TorusGeometry(0.34, 0.022, 5, 24),
      new T.MeshBasicMaterial({ color: '#e4faf0', transparent: true, opacity: 0.38, depthWrite: false }),
    );
    ripple.rotation.x = Math.PI / 2;
    ripple.position.copy(point);
    ripple.position.y = 0.09;
    grove.add(ripple);
    streamRipples.push(ripple);
  }
  for (let i = 0; i < 7; i++) {
    const plank = box('#a57f60', -1.95 + i * 0.64, 0.32, 1.45, 0.56, 0.16, 3.2, grove);
    plank.rotation.y = -0.28;
  }
  for (const x of [-4, 4]) {
    pillar('#8c7159', x, 2.7, -3, 0.34, 5.4, grove);
    for (const y of [4.8, 5.45, 6.1]) {
      const branch = pillar('#8c7159', x * 0.62, y, -3, 0.11, 3.5, grove);
      branch.rotation.z = x > 0 ? 0.42 : -0.42;
    }
    orb('#91b78a', x * 0.7, 6.35, -3, 2.3, grove);
    orb('#a7c394', x * 1.1, 5.75, -3.1, 1.45, grove);
  }
  for (let i = 0; i < 9; i++) {
    const t = (i + 0.5) / 9;
    const point = streamCurve.getPoint(t);
    const stone = orb('#d8c9a8', point.x + Math.sin(i * 3) * 1.2, 0.14, point.z, 0.34, grove);
    stone.scale.set(1.55, 0.38, 1);
    stone.castShadow = false;
  }

  // Two quiet discoveries sit just beyond the usual grove walk: an elder-tree
  // seat and a small stream-fed viewpoint. They are scenery only, with no map
  // pins, gates, rewards, or interaction prompt; the ground stays continuous.
  const discoveryMotes: { mesh: T.Mesh; center: T.Vector3; phase: number; radius: number }[] = [];
  const addDiscoveryMote = (
    parent: T.Object3D,
    color: string,
    x: number,
    y: number,
    z: number,
    phase: number,
    radius: number,
  ) => {
    const mesh = orb(color, x, y, z, 0.075, parent, true);
    mesh.material = (mesh.material as T.MeshStandardMaterial).clone();
    mesh.castShadow = false;
    discoveryMotes.push({ mesh, center: new T.Vector3(x, y, z), phase, radius });
  };

  const elderNook = new T.Group();
  elderNook.name = 'elder-tree-resting-nook';
  elderNook.position.set(-10.8, 0, -9.8);
  grove.add(elderNook);
  const elderTrunk = pillar('#796047', 0, 3.6, 0, 0.94, 7.2, elderNook);
  elderTrunk.rotation.z = -0.08;
  for (const [x, z, leanX, leanZ] of [
    [-1.2, 0.1, -0.32, -0.12], [1.15, 0.2, 0.34, 0.12],
    [-0.2, -1.25, -0.08, -0.3], [0.15, 1.2, 0.08, 0.32],
  ]) {
    const branch = pillar('#80684e', x, 5.55, z, 0.24, 3.6, elderNook);
    branch.rotation.z = leanX;
    branch.rotation.x = leanZ;
  }
  for (const [x, y, z, r, color] of [
    [-1.9, 7.5, 0, 2.5, '#688f62'], [0, 8.1, 0.4, 3.1, '#789c68'],
    [1.9, 7.45, -0.15, 2.45, '#6d9667'], [-0.15, 7.3, -1.8, 2.3, '#82a673'],
  ] as [number, number, number, number, string][]) {
    const crown = orb(color, x, y, z, r, elderNook);
    crown.scale.set(1.12, 0.74, 1);
  }
  // Exposed roots and a low, weathered seat make the spot feel restful.
  for (const angle of [-1.3, -0.55, 0.3, 1.05, 2.35]) {
    const root = pillar('#80684e', Math.cos(angle) * 1.55, 0.22, Math.sin(angle) * 1.25, 0.18, 0.44, elderNook);
    root.rotation.z = Math.cos(angle) * 0.22;
    root.rotation.x = Math.sin(angle) * 0.22;
  }
  box('#ae8968', 0, 0.52, 3.15, 2.8, 0.2, 0.72, elderNook);
  box('#ae8968', 0, 0.92, 3.47, 2.8, 0.62, 0.16, elderNook);
  for (const x of [-1, 1]) pillar('#8d7157', x, 0.28, 3.15, 0.075, 0.52, elderNook);
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 0.4;
    addDiscoveryMote(elderNook, '#ffe4a2', Math.cos(angle) * 2.25, 1.5 + (i % 2) * 0.36, Math.sin(angle) * 1.75, i * 1.27, 0.45);
  }

  const inletCurve = new T.CatmullRomCurve3([
    new T.Vector3(2.8, 0.035, -1.4), new T.Vector3(4.6, 0.035, -2.7),
    new T.Vector3(5.8, 0.035, -4.5), new T.Vector3(7.15, 0.035, -6.15),
  ]);
  grove.add(
    new T.Mesh(new T.TubeGeometry(inletCurve, 24, 0.72, 8, false), material('#bdb18e')),
    new T.Mesh(new T.TubeGeometry(inletCurve, 24, 0.48, 8, false), material('#8bd5cd')),
  );
  const poolView = new T.Group();
  poolView.name = 'hidden-stream-viewpoint';
  poolView.position.set(7.55, 0, -6.55);
  grove.add(poolView);
  const poolBank = new T.Mesh(new T.CylinderGeometry(2.35, 2.75, 0.28, 36), material('#c8ba99'));
  poolBank.position.y = 0.08;
  poolView.add(poolBank);
  const stillWater = new T.Mesh(new T.CircleGeometry(2.2, 36), material('#83d0c8'));
  stillWater.rotation.x = -Math.PI / 2;
  stillWater.position.y = 0.23;
  poolView.add(stillWater);
  const poolShimmer = shape(geometries.torus, '#d9f5dd', 0, 0.28, 0, 1, 1, 1, poolView, true);
  poolShimmer.rotation.x = Math.PI / 2;
  poolShimmer.scale.set(1.85, 1.85, 1.85);
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2 + 0.35;
    const lily = orb(i % 2 ? '#8cbb91' : '#aacb91', Math.cos(angle) * 1.22, 0.29, Math.sin(angle) * 1.22, 0.34, poolView);
    lily.scale.set(1.15, 0.16, 0.88);
    const flower = orb(i % 2 ? '#f0c8d2' : '#f3dfa0', Math.cos(angle) * 1.22, 0.39, Math.sin(angle) * 1.22, 0.11, poolView, true);
    flower.scale.y = 0.58;
  }
  // A short scatter of flat stones gives a natural approach from the stream.
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 6;
    const point = inletCurve.getPoint(t);
    const stone = orb('#d6c8a8', point.x - 0.68, 0.15, point.z + 0.68, 0.38, grove);
    stone.scale.set(1.45, 0.34, 1);
    stone.castShadow = false;
  }
  const viewpointSeat = box('#ad8968', 10.55, 0.47, -6.45, 2.45, 0.18, 0.72, grove);
  viewpointSeat.rotation.y = Math.PI / 2;
  const viewpointBack = box('#ad8968', 10.55, 0.85, -6.45, 2.45, 0.6, 0.16, grove);
  viewpointBack.rotation.y = Math.PI / 2;
  for (const z of [-7.35, -5.55]) pillar('#8d7157', 10.55, 0.24, z, 0.07, 0.46, grove);
  for (let i = 0; i < 4; i++) {
    addDiscoveryMote(poolView, '#e5f4c4', Math.cos(i * Math.PI / 2) * 1.55, 0.58, Math.sin(i * Math.PI / 2) * 1.55, 1.4 + i * 1.4, 0.25);
  }

  // The open meadow has a ring of soft seats and a low shared fire bowl.
  const sanctuary = roots.sanctuary;
  const circle = new T.Mesh(new T.CircleGeometry(5.6, 48), material('#a9b493'));
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.02;
  sanctuary.add(circle);
  const ring = shape(geometries.torus, '#dfc78e', 0, 0.18, 0, 5.2, 0.78, 5.2, sanctuary);
  ring.rotation.x = Math.PI / 2;
  pillar('#d3c29f', 0, 0.3, 0, 1.35, 0.48, sanctuary);
  orb('#f1d58d', 0, 0.82, 0, 0.48, sanctuary, true);
  for (let i = 0; i < 8; i++) {
    const angle = i * Math.PI / 4;
    const seat = box('#b08a67', Math.cos(angle) * 7.6, 0.48, Math.sin(angle) * 7.6, 2.3, 0.19, 0.74, sanctuary);
    seat.rotation.y = -angle;
  }
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 2.2;
    const stalk = pillar('#6d9875', x, 0.68, -5.8, 0.045, 1.35, sanctuary);
    stalk.rotation.z = (i - 2) * -0.12;
    orb(['#eed089', '#e9b7ce', '#d8d3ed'][i % 3], x, 1.4, -5.8, 0.2, sanctuary);
  }

  // Local decorations persist in their chosen clearing and are rebuilt only on edits.
  const furnishings: Record<Furnishing, string> = {
    crystal: '#b9d7d1', arbor: '#d7bd89', pool: '#8bd5cd', pavilion: '#c4afd6',
  };
  const additions = {} as Record<District, T.Group>;
  for (const id of Object.keys(districts) as District[]) {
    additions[id] = new T.Group();
    additions[id].name = 'personal-decorations';
    roots[id].add(additions[id]);
  }
  let signature = '';
  const furnishing = (decoration: Decoration, parent: T.Group, seedValue: number) => {
    const pos = decorationPosition(decoration.district, decoration.slot, seedValue);
    const x = pos.x * 0.43;
    const z = pos.z * 0.43;
    const color = furnishings[decoration.kind];
    if (decoration.kind === 'crystal') {
      const gem = shape(geometries.cone, color, x, 1.25, z, 0.8, 2.2, 0.8, parent, true);
      gem.rotation.y = decoration.slot * 0.4;
      const glint = shape(geometries.torus, '#f6dfaa', x, 0.88, z, 1, 1, 1, parent, true);
      glint.rotation.x = Math.PI / 2;
    } else if (decoration.kind === 'pool') {
      pillar('#d8ccb2', x, 0.15, z, 1.05, 0.28, parent);
      const pool = new T.Mesh(new T.CircleGeometry(0.88, 24), material('#8bd5cd'));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(x, 0.31, z);
      parent.add(pool);
      for (let i = 0; i < 4; i++) orb('#f3dfa7', x + Math.sin(i * 1.6) * 0.55, 0.4, z + Math.cos(i * 1.6) * 0.55, 0.11, parent);
    } else if (decoration.kind === 'arbor') {
      for (const side of [-1, 1]) pillar('#eee1c8', x + side * 1.1, 1.35, z, 0.1, 2.7, parent);
      const arch = shape(geometries.torus, color, x, 2.7, z, 1.15, 1.15, 1.15, parent);
      arch.rotation.x = Math.PI / 2;
      for (let i = 0; i < 5; i++) orb(i % 2 ? '#e8b4cc' : '#edcf8b', x - 1.2 + i * 0.6, 2.9, z, 0.16, parent);
    } else {
      for (const dx of [-1, 1]) for (const dz of [-1, 1]) pillar('#eee1c8', x + dx, 1.35, z + dz, 0.1, 2.7, parent);
      const roof = shape(geometries.cone, color, x, 2.9, z, 2.35, 1.4, 2.35, parent);
      roof.rotation.y = Math.PI / 4;
      orb('#f2d792', x, 1.7, z, 0.22, parent, true);
    }
  };
  const rebuild = (state: State) => {
    const nextSignature = JSON.stringify([state.decorations, state.worldSeed]);
    if (nextSignature === signature) return;
    signature = nextSignature;
    for (const id of Object.keys(districts) as District[]) {
      const group = additions[id];
      group.clear();
      for (const item of state.decorations.filter(d => d.district === id)) furnishing(item, group, state.worldSeed);
      roots[id].userData.decorations = state.decorations.filter(d => d.district === id).length;
    }
  };

  // Fireflies are a single animated point batch; reduced-motion mode freezes them.
  const fireflyPositions = new Float32Array(72 * 3);
  for (let i = 0; i < 72; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 18 + random() * 44;
    fireflyPositions[i * 3] = Math.cos(angle) * radius;
    fireflyPositions[i * 3 + 1] = 0.5 + random() * 2.2;
    fireflyPositions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const fireflyGeometry = new T.BufferGeometry();
  fireflyGeometry.setAttribute('position', new T.BufferAttribute(fireflyPositions, 3));
  const fireflies = new T.Points(fireflyGeometry, new T.PointsMaterial({
    color: '#fff0b0', size: 0.14, transparent: true, opacity: 0.66,
    depthWrite: false, blending: T.AdditiveBlending,
  }));
  scene.add(fireflies);
  const glowMats = [...materials.values()].filter(m => m.emissiveIntensity > 0);
  let active: District = 'garden';

  function activate(id: District) {
    active = id;
    // All landmarks stay in view on the same ground; active only tracks focus.
  }

  function sync(state: State) {
    rebuild(state);
  }

  function tick(time: number, reduced: boolean, windStrength = 1) {
    if (reduced) return;
    const normalizedWind = Number.isFinite(windStrength) ? Math.max(0, Math.min(1, windStrength)) : 1;
    const wind = 0.4 + normalizedWind * 0.65;
    residentRoots.forEach((person, i) => {
      const origin = person.userData.origin as T.Vector3;
      const phase = person.userData.phase as number;
      person.position.x = origin.x + Math.sin(time * 0.22 + phase) * 0.45;
      person.position.z = origin.z + Math.cos(time * 0.22 + phase) * 0.35;
      person.position.y = 0.035 + Math.sin(time * 1.35 + i) * 0.035;
      person.rotation.y = Math.sin(time * 0.18 + phase) * 0.2;
    });
    // A slow shared breeze is enough to make the meadows feel alive.
    treePositions.forEach((tree, i) => {
      dummy.position.set(tree.x, 3.55 * tree.size, tree.z);
      dummy.scale.set(1.9 * tree.size, 1.75 * tree.size, 1.8 * tree.size);
      dummy.rotation.set(0, tree.lean, Math.sin(time * 0.55 + i * 0.41) * 0.018 * wind);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
    });
    crowns.instanceMatrix.needsUpdate = true;
    flowerLocations.forEach((flower, i) => {
      const breeze = Math.sin(time * 1.2 + i * 0.29) * 0.08 * wind;
      dummy.position.set(flower.x, 0.29 * flower.size, flower.z);
      dummy.scale.set(flower.size, flower.size, flower.size);
      dummy.rotation.set(0, 0, breeze);
      dummy.updateMatrix();
      stems.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 0.62 * flower.size;
      dummy.rotation.z = breeze * 0.7;
      dummy.updateMatrix();
      petals.setMatrixAt(i, dummy.matrix);
    });
    stems.instanceMatrix.needsUpdate = true;
    petals.instanceMatrix.needsUpdate = true;
    water.scale.set(1 + Math.sin(time * 0.72) * 0.012, 1, 1 + Math.cos(time * 0.61) * 0.012);
    streamRipples.forEach((ripple, i) => {
      const pulse = (Math.sin(time * 1.3 + i * 1.8) + 1) / 2;
      ripple.scale.setScalar(0.8 + pulse * 0.65);
      (ripple.material as T.MeshBasicMaterial).opacity = 0.18 + pulse * 0.25;
    });
    poolShimmer.scale.setScalar(1.82 + Math.sin(time * 0.62) * 0.035);
    poolShimmer.rotation.z = time * 0.08;
    stillWater.scale.set(1 + Math.sin(time * 0.74) * 0.008, 1, 1 + Math.cos(time * 0.59) * 0.008);
    discoveryMotes.forEach(({ mesh, center, phase, radius }) => {
      const drift = time * 0.19 + phase;
      const glint = Math.pow(Math.max(0, Math.sin(time * 0.62 + phase)), 12);
      mesh.position.set(
        center.x + Math.cos(drift) * radius,
        center.y + 0.18 + (Math.sin(drift * 1.35) + 1) * 0.16,
        center.z + Math.sin(drift) * radius,
      );
      mesh.scale.setScalar(0.045 + glint * 0.075);
      (mesh.material as T.MeshStandardMaterial).emissiveIntensity = 0.18 + glint * 0.7;
    });
    windowGlowMaterial.emissiveIntensity = 0.15 + Math.sin(time * 0.7) * 0.025;
    fireflies.rotation.y = time * 0.008;
    for (const [i, mat] of glowMats.entries()) mat.emissiveIntensity = 0.34 + (Math.sin(time * 1.3 + i * 0.73) + 1) * 0.12;
  }

  function bounds() {
    return { x: 0, z: 0, r: 82 };
  }

  const worldObstacles: ObstacleCircle[] = [];

  // 1. Forest tree trunks
  treePositions.forEach(tree => {
    worldObstacles.push({
      x: tree.x,
      z: tree.z,
      radius: 0.38 * tree.size,
    });
  });

  // 2. Central pond deep water
  worldObstacles.push({ x: 0, z: 0, radius: 5.65 });

  // 3. Community grand tree
  worldObstacles.push({ x: 0, z: -13, radius: 1.35 });

  // 4. Two-Horn Home cottage
  worldObstacles.push({ x: -23.2, z: -10, radius: 2.1 });
  worldObstacles.push({ x: -20.8, z: -10, radius: 2.1 });

  // 5. Greenhouse structure
  worldObstacles.push({ x: 18.2, z: 14, radius: 2.4 });
  worldObstacles.push({ x: 21.8, z: 14, radius: 2.4 });

  // 6. Village central fountain
  worldObstacles.push({ x: 24, z: -13, radius: 2.1 });

  // 7. Village houses
  for (const [x, z] of [[-5, -4], [5, -4], [-5, 4], [5, 4]]) {
    worldObstacles.push({ x: 24 + x, z: -13 + z, radius: 1.9 });
  }

  // 8. Elder tree in grove
  worldObstacles.push({ x: -21 - 10.8, z: 19 - 9.8, radius: 1.35 });

  // 9. Stream in grove (safe footbridge crossing allowed at z ~= 1.45 relative to grove)
  for (let i = 0; i <= 10; i++) {
    const pt = streamCurve.getPoint(i / 10);
    const wx = -21 + pt.x;
    const wz = 19 + pt.z;
    const nearBridge = Math.hypot(wx - (-21), wz - (19 + 1.45)) < 1.9;
    if (!nearBridge) {
      worldObstacles.push({ x: wx, z: wz, radius: 0.85 });
    }
  }

  return {
    sync,
    tick,
    activate,
    get ground() { return ground; },
    root: (id: District) => roots[id],
    bounds,
    get obstacles() { return worldObstacles; },
  };
}
