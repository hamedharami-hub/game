import * as T from 'three';
import {
  decorationPosition,
  type Decoration,
  type District,
  type Furnishing,
  type LandscapeKind,
  type LandscapePlacement,
  type State,
} from './state.ts';
import type { ObstacleCircle } from './interactions';
import { gardenTangentEuler } from './garden-transform.ts';

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
    pool: new T.CircleGeometry(0.88, 24),
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
    if (collecting) batch.push(mesh);
    return mesh;
  };
  const box = (color: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, parent?: T.Object3D) =>
    shape(geometries.box, color, x, y, z, sx, sy, sz, parent);
  const orb = (color: string, x: number, y: number, z: number, r: number, parent?: T.Object3D, glow = false) =>
    shape(geometries.sphere, color, x, y, z, r, r, r, parent, glow);
  const pillar = (color: string, x: number, y: number, z: number, r: number, h: number, parent?: T.Object3D) =>
    shape(geometries.cylinder, color, x, y, z, r, h, r, parent);

  // -- static batching -----------------------------------------------------
  // The landscape is built from hundreds of small one-off meshes that never move.
  // While `collecting` they are merely recorded; once the world is complete they
  // are baked into a handful of vertex-coloured meshes, so a pebble no longer
  // costs a draw call. Anything animated is `drop`ped and stays a real mesh.
  const batch: T.Mesh[] = [];
  let collecting = true;
  const villagerMaterial = new T.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.86 });
  const drop = (...meshes: (T.Object3D | null | undefined)[]) => {
    for (const mesh of meshes) {
      const at = batch.indexOf(mesh as T.Mesh);
      if (at >= 0) batch.splice(at, 1);
    }
  };
  const bake = (meshes: T.Mesh[], target: T.Object3D, material: T.Material, vertexColors: boolean) => {
    const positions: number[] = [];
    const normals: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    const toLocal = new T.Matrix4();
    const local = new T.Matrix4();
    const normalMatrix = new T.Matrix3();
    const v = new T.Vector3();
    const n = new T.Vector3();
    const tint = new T.Color();
    target.updateWorldMatrix(true, false);
    if (target !== scene) toLocal.copy(target.matrixWorld).invert();
    for (const mesh of meshes) {
      const geometry = mesh.geometry;
      const position = geometry.getAttribute('position') as T.BufferAttribute | undefined;
      if (!position) continue;
      mesh.updateWorldMatrix(true, false);
      local.multiplyMatrices(toLocal, mesh.matrixWorld);
      normalMatrix.getNormalMatrix(local);
      tint.copy((mesh.material as T.MeshStandardMaterial).color);
      const normal = geometry.getAttribute('normal') as T.BufferAttribute | undefined;
      const base = positions.length / 3;
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(local);
        positions.push(v.x, v.y, v.z);
        if (normal) {
          n.fromBufferAttribute(normal, i).applyMatrix3(normalMatrix);
          if (n.lengthSq() > 0) n.normalize();
          normals.push(n.x, n.y, n.z);
        }
        colors.push(tint.r, tint.g, tint.b);
      }
      const index = geometry.getIndex();
      if (index) for (let i = 0; i < index.count; i++) indices.push(base + index.getX(i));
      else for (let i = 0; i < position.count; i++) indices.push(base + i);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    if (normals.length) geometry.setAttribute('normal', new T.Float32BufferAttribute(normals, 3));
    if (vertexColors) geometry.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeBoundingSphere();
    const merged = new T.Mesh(geometry, material);
    target.add(merged);
    return merged;
  };
  const flushStatic = () => {
    collecting = false;
    scene.updateMatrixWorld(true);
    const buckets = new Map<string, { meshes: T.Mesh[]; material: T.Material; vertexColors: boolean }>();
    for (const mesh of batch) {
      if (!mesh.parent) continue;
      const source = mesh.material as T.MeshStandardMaterial;
      // MeshStandardMaterial defaults emissiveIntensity to 1 even with a black
      // emissive, so "glows" must be detected from the emissive colour itself.
      if (source.type !== 'MeshStandardMaterial') continue;
      const glow = source.emissive.r > 0 || source.emissive.g > 0 || source.emissive.b > 0;
      const key = [
        source.type, glow ? source.color.getHexString() : 'vertex-colour',
        source.roughness, source.metalness, source.transparent, source.opacity, source.depthWrite,
        source.side, source.flatShading,
        glow ? `${source.emissive.getHexString()}:${source.emissiveIntensity}` : 'no-emissive',
        mesh.castShadow, mesh.receiveShadow,
      ].join('|');
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.meshes.push(mesh);
        continue;
      }
      buckets.set(key, { meshes: [mesh], material: mesh.material as T.Material, vertexColors: !glow });
    }
    for (const bucket of buckets.values()) {
      const source = bucket.material as T.MeshStandardMaterial;
      const shared = bucket.meshes[0];
      const material = bucket.vertexColors
        ? new T.MeshStandardMaterial({
          color: '#ffffff', vertexColors: true, roughness: source.roughness, metalness: source.metalness,
          transparent: source.transparent, opacity: source.opacity, depthWrite: source.depthWrite,
          side: source.side, flatShading: source.flatShading,
        })
        : bucket.material;
      const merged = bake(bucket.meshes, scene, material, bucket.vertexColors);
      merged.castShadow = shared.castShadow;
      merged.receiveShadow = shared.receiveShadow;
      for (const mesh of bucket.meshes) mesh.removeFromParent();
    }
    batch.length = 0;
    // Villagers travel as one rigid body each, so each villager is baked on its own.
    for (const resident of residentRoots) {
      const parts = resident.children.filter((child): child is T.Mesh => (child as T.Mesh).isMesh);
      if (!parts.length) continue;
      const merged = bake(parts, resident, villagerMaterial, true);
      merged.castShadow = true;
      merged.receiveShadow = true;
      for (const part of parts) part.removeFromParent();
    }
  };

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
  batch.push(ocean);
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
  batch.push(ground);
  const shore = shape(new T.TorusGeometry(85.6, 1.75, 8, 144), '#d7b16f', 0, 0.025, 0, 1, 1, 1, scene);
  shore.rotation.x = Math.PI / 2;

  const pathMaterial = material('#ead39a');
  const pathPoints: T.Vector3[][] = [];
  const ribbonGeometry = (points: T.Vector3[], width: number, y: number | ((x: number, z: number) => number)) => {
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
      positions[at + 1] = typeof y === 'number' ? y : y(point.x + sideX, point.z + sideZ);
      positions[at + 2] = point.z + sideZ;
      positions[at + 3] = point.x - sideX;
      positions[at + 4] = typeof y === 'number' ? y : y(point.x - sideX, point.z - sideZ);
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
    batch.push(edging, path);
  }

  // Soft clearings mark places without walls or teleport pads.
  for (const [id, place] of Object.entries(districts) as [District, typeof districts[District]][]) {
    // The grove needs a broad breathing space so its river and old spirit tree
    // read as one destination instead of disappearing between the forest trunks.
    const clearingRadius = id === 'grove' ? 16.8 : 8.6;
    const clearing = new T.Mesh(new T.CircleGeometry(clearingRadius, 48), material(id === 'grove' ? '#82ad76' : '#86aa70'));
    clearing.rotation.x = -Math.PI / 2;
    clearing.position.set(place.x, 0.009, place.z);
    clearing.scale.set(1.05, 0.84, 1);
    clearing.receiveShadow = true;
    scene.add(clearing);
    batch.push(clearing);
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
  const nearGrove = (x: number, z: number, margin: number) =>
    Math.hypot(districts.grove.x - x, districts.grove.z - z) < margin;

  const treePositions: { x: number; z: number; size: number; tone: string; lean: number }[] = [];
  for (let tries = 0; treePositions.length < 150 && tries < 1200; tries++) {
    const angle = random() * Math.PI * 2;
    const radius = 30 + random() * 49;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    if (Math.hypot(x, z) > 79 || nearPlace(x, z, 10) || nearGrove(x, z, 19) || nearRoute(x, z, 4.8)) continue;
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
  batch.push(pond);
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
    drop(window);
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
    drop(...resident.children);
  };
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7;
    makeResident(residentColors[i % residentColors.length], Math.cos(angle) * 9.6, Math.sin(angle) * 8.2);
  }

  // A shallow, winding river and its timber footbridge.
  const grove = roots.grove;
  const groveGroundY = (x: number, z: number) =>
    -0.02 + planetElevation(districts.grove.x + x, districts.grove.z + z) - grove.position.y;
  const groveWaterY = (x: number, z: number) => groveGroundY(x, z) + 0.12;
  const streamCurve = new T.CatmullRomCurve3([
    new T.Vector3(-7, 0.035, -8), new T.Vector3(-4, 0.035, -5),
    new T.Vector3(2, 0.035, -2), new T.Vector3(3, 0.035, 2),
    new T.Vector3(-1, 0.035, 6), new T.Vector3(-4, 0.035, 9),
  ]);
  // Both ribbons sample the actual curved ground at each bank edge. The broad
  // sandy shoulder remains visible around the narrower, slightly raised water.
  const banks = new T.Mesh(ribbonGeometry(streamCurve.getPoints(48), 5.6, (x, z) => groveGroundY(x, z) + 0.025), material('#c6b891'));
  const riverMaterial = new T.MeshStandardMaterial({
    color: '#72dcd5', emissive: '#35b6b4', emissiveIntensity: 0.34,
    roughness: 0.26, metalness: 0.04,
  });
  const stream = new T.Mesh(ribbonGeometry(streamCurve.getPoints(48), 4.2, (x, z) => groveWaterY(x, z)), riverMaterial);
  grove.add(banks, stream);
  batch.push(banks, stream);
  const streamRipples: T.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const point = streamCurve.getPoint(0.17 + i * 0.2);
    const ripple = new T.Mesh(
      new T.TorusGeometry(0.34, 0.022, 5, 24),
      new T.MeshBasicMaterial({ color: '#e4faf0', transparent: true, opacity: 0.38, depthWrite: false }),
    );
    ripple.rotation.x = Math.PI / 2;
    ripple.position.copy(point);
    ripple.position.y = groveWaterY(point.x, point.z) + 0.035;
    grove.add(ripple);
    streamRipples.push(ripple);
  }
  // A short, sunlit fall breaks the river into a recognizable landmark. A
  // faceted rock outcrop backs the water sheet and sinks into the lower channel.
  const fallAt = streamCurve.getPointAt(0.3);
  const fallFlow = streamCurve.getTangentAt(0.3).setY(0).normalize();
  const fallAcross = new T.Vector3(-fallFlow.z, 0, fallFlow.x).normalize();
  const fallCenter = fallAt.clone().addScaledVector(fallFlow, 0.32);
  const fallHalfWidth = 2.5;
  const fallHeight = 2.15;

  // Build an irregular, solid rock apron behind the cascade as one low-poly
  // vertex-coloured mesh. Its cap and side faces give the waterfall a clear
  // shelf, while green and pale mineral facets break up the stone face.
  const rockPositions: number[] = [];
  const rockColors: number[] = [];
  const rockIndices: number[] = [];
  const rockPalette = ['#656d60', '#777967', '#85816a', '#59665b', '#718568', '#9a9b78'];
  const pushRockTriangle = (a: T.Vector3, b: T.Vector3, c: T.Vector3, color: string) => {
    const base = rockPositions.length / 3;
    const tint = new T.Color(color);
    for (const vertex of [a, b, c]) {
      rockPositions.push(vertex.x, vertex.y, vertex.z);
      rockColors.push(tint.r, tint.g, tint.b);
    }
    rockIndices.push(base, base + 1, base + 2);
  };
  const rockColumns = 8;
  const rockRows = 4;
  const rockFront: T.Vector3[][] = [];
  const rockBack: T.Vector3[][] = [];
  for (let row = 0; row <= rockRows; row++) {
    rockFront[row] = [];
    rockBack[row] = [];
    const v = row / rockRows;
    for (let col = 0; col <= rockColumns; col++) {
      const u = col / rockColumns;
      const side = (u - 0.5) * (fallHalfWidth * 2.45) + Math.sin(col * 2.3 + row) * 0.12;
      const shoulderHeight = fallHeight + 0.04 + Math.sin(col * 1.4) * 0.2 - Math.abs(u - 0.5) * 0.14;
      const ground = groveGroundY(fallCenter.x + fallAcross.x * side, fallCenter.z + fallAcross.z * side);
      const y = ground + 0.04 + v * shoulderHeight + (row > 0 && row < rockRows ? Math.sin(col * 2.1 + row * 1.4) * 0.07 : 0);
      const forward = Math.sin(col * 1.7 + row * 1.2) * 0.085;
      rockFront[row][col] = new T.Vector3(
        fallCenter.x + fallAcross.x * side + fallFlow.x * forward,
        y,
        fallCenter.z + fallAcross.z * side + fallFlow.z * forward,
      );
      const backDepth = 1.08 + Math.sin(col * 1.3) * 0.12;
      rockBack[row][col] = rockFront[row][col].clone().addScaledVector(fallFlow, -backDepth);
    }
  }
  for (let row = 0; row < rockRows; row++) for (let col = 0; col < rockColumns; col++) {
    const a = rockFront[row][col], b = rockFront[row][col + 1];
    const c = rockFront[row + 1][col], d = rockFront[row + 1][col + 1];
    const moss = row >= 2 && ((col + row * 3) % 5 === 0 || (col === 1 && row === 2) || (col === 6 && row === 3));
    const color = rockPalette[(col * 2 + row) % rockPalette.length];
    const faceColor = moss ? '#718d68' : color;
    pushRockTriangle(a, c, b, faceColor);
    pushRockTriangle(b, c, d, moss && row === 2 ? '#8e9c72' : color);
    const ba = rockBack[row][col], bb = rockBack[row][col + 1];
    const bc = rockBack[row + 1][col], bd = rockBack[row + 1][col + 1];
    pushRockTriangle(ba, bb, bc, '#566257');
    pushRockTriangle(bb, bd, bc, '#66705e');
  }
  for (let col = 0; col < rockColumns; col++) {
    const frontA = rockFront[rockRows][col], frontB = rockFront[rockRows][col + 1];
    const backA = rockBack[rockRows][col], backB = rockBack[rockRows][col + 1];
    pushRockTriangle(frontA, backA, frontB, '#a29a7a');
    pushRockTriangle(frontB, backA, backB, '#8b896f');
    const frontLow = rockFront[0][col], frontNext = rockFront[0][col + 1];
    const backLow = rockBack[0][col], backNext = rockBack[0][col + 1];
    pushRockTriangle(frontLow, frontNext, backLow, '#596257');
    pushRockTriangle(frontNext, backNext, backLow, '#656b5c');
  }
  for (const col of [0, rockColumns]) for (let row = 0; row < rockRows; row++) {
    const frontLow = rockFront[row][col], frontHigh = rockFront[row + 1][col];
    const backLow = rockBack[row][col], backHigh = rockBack[row + 1][col];
    pushRockTriangle(frontLow, backLow, frontHigh, '#62685a');
    pushRockTriangle(frontHigh, backLow, backHigh, '#747661');
  }
  const rockGeometry = new T.BufferGeometry();
  rockGeometry.setAttribute('position', new T.Float32BufferAttribute(rockPositions, 3));
  rockGeometry.setAttribute('color', new T.Float32BufferAttribute(rockColors, 3));
  rockGeometry.setIndex(rockIndices);
  rockGeometry.computeVertexNormals();
  const rockFace = new T.Mesh(rockGeometry, new T.MeshStandardMaterial({
    color: '#ffffff', vertexColors: true, roughness: 0.96, flatShading: true, side: T.DoubleSide,
  }));
  rockFace.name = 'mossy-waterfall-rock-face';
  rockFace.castShadow = true;
  rockFace.receiveShadow = true;
  grove.add(rockFace);

  const fallGeometry = new T.BufferGeometry();
  const fallColumns = 8;
  const fallRows = 5;
  const fallPositions = new Float32Array((fallColumns + 1) * (fallRows + 1) * 3);
  const fallUvs = new Float32Array((fallColumns + 1) * (fallRows + 1) * 2);
  const fallIndices: number[] = [];
  for (let row = 0; row <= fallRows; row++) for (let col = 0; col <= fallColumns; col++) {
    const u = col / fallColumns;
    const v = row / fallRows;
    const side = (u - 0.5) * fallHalfWidth * 2.0;
    const x = fallCenter.x + fallAcross.x * side + fallFlow.x * (0.31 + Math.sin(u * Math.PI * 4) * 0.035);
    const z = fallCenter.z + fallAcross.z * side + fallFlow.z * (0.31 + Math.sin(u * Math.PI * 4) * 0.035);
    const surface = groveWaterY(x, z);
    const top = surface + fallHeight + Math.sin(u * Math.PI) * 0.035;
    const bottom = surface + 0.045;
    const index = row * (fallColumns + 1) + col;
    fallPositions[index * 3] = x;
    fallPositions[index * 3 + 1] = top * (1 - v) + bottom * v;
    fallPositions[index * 3 + 2] = z;
    fallUvs[index * 2] = u;
    fallUvs[index * 2 + 1] = 1 - v;
    if (row < fallRows && col < fallColumns) {
      const a = index, b = index + 1, c = index + fallColumns + 1, d = c + 1;
      fallIndices.push(a, c, b, b, c, d);
    }
  }
  fallGeometry.setAttribute('position', new T.BufferAttribute(fallPositions, 3));
  fallGeometry.setAttribute('uv', new T.BufferAttribute(fallUvs, 2));
  fallGeometry.setIndex(fallIndices);
  fallGeometry.computeVertexNormals();
  const fallCurtain = new T.Mesh(fallGeometry, new T.MeshStandardMaterial({
    color: '#9ce7e0', emissive: '#42c9c0', emissiveIntensity: 0.5,
    transparent: true, opacity: 0.73, roughness: 0.22, metalness: 0.04,
    side: T.DoubleSide, depthWrite: false,
  }));
  fallCurtain.name = 'sunlit-riverfall';
  fallCurtain.castShadow = false;
  fallCurtain.receiveShadow = false;
  grove.add(fallCurtain);
  batch.push(fallCurtain);
  // Two mossy shoulders continue the outcrop into the stream banks.
  for (const side of [-1, 1]) {
    const rockX = fallCenter.x + fallAcross.x * side * 2.0;
    const rockZ = fallCenter.z + fallAcross.z * side * 2.0;
    const rock = orb('#a39b79', rockX, groveGroundY(rockX, rockZ) + 0.61, rockZ, 0.76, grove);
    rock.scale.set(1.2, 0.8, 1.05);
    rock.castShadow = false;
    const mossX = fallCenter.x + fallAcross.x * side * 1.95;
    const mossZ = fallCenter.z + fallAcross.z * side * 1.95;
    const moss = orb('#79a878', mossX, groveGroundY(mossX, mossZ) + 1.02, mossZ, 0.38, grove);
    moss.scale.set(1.1, 0.5, 1);
  }
  // One point batch supplies the moving silver-blue water glints. It costs one
  // draw call, rather than a separate mesh for every droplet.
  const fallGlintCount = 28;
  const fallGlintPositions = new Float32Array(fallGlintCount * 3);
  const fallGlintGeometry = new T.BufferGeometry();
  fallGlintGeometry.setAttribute('position', new T.BufferAttribute(fallGlintPositions, 3).setUsage(T.DynamicDrawUsage));
  const fallGlints = new T.Points(fallGlintGeometry, new T.PointsMaterial({
    color: '#edfff5', size: 0.14, transparent: true, opacity: 0.82,
    depthWrite: false, blending: T.AdditiveBlending,
  }));
  fallGlints.name = 'waterfall-glints';
  grove.add(fallGlints);
  const updateFallGlints = (time: number) => {
    const positions = fallGlintGeometry.getAttribute('position') as T.BufferAttribute;
    for (let i = 0; i < fallGlintCount; i++) {
      const across = ((i * 0.61803398875) % 1 - 0.5) * fallHalfWidth * 1.8;
      const progress = (time * (0.34 + (i % 5) * 0.025) + i / fallGlintCount) % 1;
      const jitter = Math.sin(time * 2.1 + i * 1.7) * 0.055;
      positions.setXYZ(i,
        fallCenter.x + fallAcross.x * (across + jitter),
        groveWaterY(fallCenter.x + fallAcross.x * across, fallCenter.z + fallAcross.z * across) + fallHeight
          - progress * (fallHeight - 0.045),
        fallCenter.z + fallAcross.z * (across + jitter),
      );
    }
    positions.needsUpdate = true;
  };
  updateFallGlints(0);
  // Put the plank path where it actually spans the river bend. Keep the plank
  // rectangles as data too, so movement clearance follows the visible deck.
  const fixedBridgeRotation = -Math.PI / 4;
  const fixedBridgePlanks = Array.from({ length: 7 }, (_, index) => {
    const offset = (index - 3) * 0.57 * 0.707;
    return { x: 3 + offset, z: 2 + offset, rotation: fixedBridgeRotation, width: 0.5, length: 3.25 };
  });
  for (const plankSpec of fixedBridgePlanks) {
    const plank = box('#a57f60', plankSpec.x, 0.32, plankSpec.z, plankSpec.width, 0.16, plankSpec.length, grove);
    plank.rotation.y = plankSpec.rotation;
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
  const streamCrossing = streamCurve.getPointAt(0.82);
  const streamCrossingFlow = streamCurve.getTangentAt(0.82).setY(0).normalize();
  const streamCrossingAcross = new T.Vector3(-streamCrossingFlow.z, 0, streamCrossingFlow.x).normalize();
  for (let i = 0; i < 5; i++) {
    const offset = (i - 2) * 0.8;
    const x = streamCrossing.x + streamCrossingAcross.x * offset;
    const z = streamCrossing.z + streamCrossingAcross.z * offset;
    const stone = orb('#d8c9a8', x, groveGroundY(x, z) + 0.17, z, 0.34, grove);
    stone.scale.set(1.28, 0.38, 0.82);
    stone.rotation.y = Math.atan2(-streamCrossingAcross.z, streamCrossingAcross.x);
    stone.castShadow = false;
  }

  // The grove's old resting tree is a gentle spirit landmark: living jade
  // bark, a warm heart of light and a few floating leaf-lights. They remain
  // scenery only, with no map
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
    drop(mesh);
    discoveryMotes.push({ mesh, center: new T.Vector3(x, y, z), phase, radius });
  };

  const elderNook = new T.Group();
  elderNook.name = 'spirit-tree-resting-nook';
  elderNook.position.set(-10.8, 0, -9.8);
  grove.add(elderNook);
  const elderTrunk = pillar('#536d58', 0, 3.6, 0, 0.94, 7.2, elderNook);
  elderTrunk.rotation.z = -0.08;
  for (const [x, z, leanX, leanZ] of [
    [-1.2, 0.1, -0.32, -0.12], [1.15, 0.2, 0.34, 0.12],
    [-0.2, -1.25, -0.08, -0.3], [0.15, 1.2, 0.08, 0.32],
  ]) {
    const branch = pillar('#668365', x, 5.55, z, 0.24, 3.6, elderNook);
    branch.rotation.z = leanX;
    branch.rotation.x = leanZ;
  }
  for (const [x, y, z, r, color] of [
    [-1.9, 7.5, 0, 2.5, '#4d8178'], [0, 8.1, 0.4, 3.1, '#5f9a88'],
    [1.9, 7.45, -0.15, 2.45, '#638f83'], [-0.15, 7.3, -1.8, 2.3, '#83ad8f'],
  ] as [number, number, number, number, string][]) {
    const crown = orb(color, x, y, z, r, elderNook);
    crown.scale.set(1.12, 0.74, 1);
  }
  // Exposed roots and a low, weathered seat make the spot feel restful.
  for (const angle of [-1.3, -0.55, 0.3, 1.05, 2.35]) {
    const root = pillar('#668365', Math.cos(angle) * 1.55, 0.22, Math.sin(angle) * 1.25, 0.18, 0.44, elderNook);
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
  // A soft central heart and a vertical ring distinguish it from the ordinary
  // round-canopy trees scattered across the meadow.
  const heartLight = orb('#f7e5a7', 0.08, 4.65, 0.82, 0.37, elderNook, true);
  heartLight.name = 'spirit-tree-heart';
  heartLight.material = (heartLight.material as T.MeshStandardMaterial).clone();
  (heartLight.material as T.MeshStandardMaterial).emissiveIntensity = 0.82;
  drop(heartLight);
  const heartRing = shape(geometries.torus, '#b9f0d2', 0.08, 4.65, 0.84, 0.66, 0.66, 0.66, elderNook, true);
  heartRing.name = 'spirit-tree-heart-ring';
  heartRing.rotation.y = Math.PI * 0.25;
  heartRing.scale.setScalar(0.86);
  drop(heartRing);
  for (let i = 0; i < 7; i++) {
    const angle = i * Math.PI * 2 / 7;
    addDiscoveryMote(
      elderNook, i % 2 ? '#c9f4d4' : '#ffe8a9',
      Math.cos(angle) * (2.1 + i % 3 * 0.3), 6.0 + (i % 3) * 0.62,
      Math.sin(angle) * (1.7 + i % 2 * 0.45), 0.8 + i * 0.93, 0.34,
    );
  }

  const inletCurve = new T.CatmullRomCurve3([
    new T.Vector3(2.8, 0.035, -1.4), new T.Vector3(4.6, 0.035, -2.7),
    new T.Vector3(5.8, 0.035, -4.5), new T.Vector3(7.15, 0.035, -6.15),
  ]);
  const inletBank = new T.Mesh(ribbonGeometry(inletCurve.getPoints(28), 3.05, (x, z) => groveGroundY(x, z) + 0.025), material('#bdb18e'));
  const inletWater = new T.Mesh(ribbonGeometry(inletCurve.getPoints(28), 1.95, (x, z) => groveWaterY(x, z)), riverMaterial);
  grove.add(inletBank, inletWater);
  batch.push(inletBank, inletWater);
  const poolView = new T.Group();
  poolView.name = 'hidden-stream-viewpoint';
  poolView.position.set(7.55, 0, -6.55);
  grove.add(poolView);
  const poolBank = new T.Mesh(new T.CylinderGeometry(2.35, 2.75, 0.28, 36), material('#c8ba99'));
  poolBank.position.y = 0.08;
  poolView.add(poolBank);
  batch.push(poolBank);
  const stillWater = new T.Mesh(new T.CircleGeometry(2.2, 36), material('#83d0c8'));
  stillWater.rotation.x = -Math.PI / 2;
  stillWater.position.y = 0.23;
  poolView.add(stillWater);
  const poolShimmer = shape(geometries.torus, '#d9f5dd', 0, 0.28, 0, 1, 1, 1, poolView, true);
  poolShimmer.rotation.x = Math.PI / 2;
  poolShimmer.scale.set(1.85, 1.85, 1.85);
  drop(poolShimmer);
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2 + 0.35;
    const lily = orb(i % 2 ? '#8cbb91' : '#aacb91', Math.cos(angle) * 1.22, 0.29, Math.sin(angle) * 1.22, 0.34, poolView);
    lily.scale.set(1.15, 0.16, 0.88);
    const flower = orb(i % 2 ? '#f0c8d2' : '#f3dfa0', Math.cos(angle) * 1.22, 0.39, Math.sin(angle) * 1.22, 0.11, poolView, true);
    flower.scale.y = 0.58;
  }
  // Flat stepping stones cross the inlet at right angles to its current.
  const inletCrossing = inletCurve.getPointAt(0.54);
  const inletFlow = inletCurve.getTangentAt(0.54).setY(0).normalize();
  const inletAcross = new T.Vector3(-inletFlow.z, 0, inletFlow.x).normalize();
  for (let i = 0; i < 5; i++) {
    const offset = (i - 2) * 0.72;
    const x = inletCrossing.x + inletAcross.x * offset;
    const z = inletCrossing.z + inletAcross.z * offset;
    const stone = orb('#d6c8a8', x, groveGroundY(x, z) + 0.17, z, 0.38, grove);
    stone.scale.set(1.3, 0.34, 0.82);
    stone.rotation.y = Math.atan2(-inletAcross.z, inletAcross.x);
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
  batch.push(circle);
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
  flushStatic();
  const landscapeRoot = new T.Group();
  landscapeRoot.name = 'placed-landscape-items';
  scene.add(landscapeRoot);
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
      const pool = new T.Mesh(geometries.pool, material('#8bd5cd'));
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

  const placedLandscape = new Map<string, { kind: LandscapeKind; placement: LandscapePlacement; root: T.Group }>();
  const placementObstacles: (ObstacleCircle & { placementId: string })[] = [];
  const combinedObstacles: ObstacleCircle[] = [];
  // Movement collision follows the solid part of each model. The larger
  // saved-placement footprints are used for layout clearance, not collision:
  // beds, flowers, open bridges and the gazebo interior remain walkable.
  const movementRadiusByKind: Record<LandscapeKind, number> = {
    tree: 1.1, 'spirit-tree': 1.4, flower: 0, 'flower-clump': 0,
    'garden-bed': 0, cottage: 2.65, cabin: 2.65, gazebo: 0,
    'wooden-bridge': 0, well: 1.05,
  };

  const orientToLand = (root: T.Group, x: number, z: number, yaw: number) => {
    const orientation = gardenTangentEuler(x, z, yaw);
    root.rotation.set(orientation.x, orientation.y, orientation.z, orientation.order);
  };

  const addPlacedFlower = (parent: T.Group, x: number, z: number, scale: number, color: string) => {
    const stem = pillar('#658f71', x, 0.38 * scale, z, 0.045 * scale, 0.76 * scale, parent);
    stem.rotation.z = (x % 2 ? -1 : 1) * 0.11;
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * Math.PI * 2 / 5;
      const bloom = orb(color, x + Math.cos(angle) * 0.14 * scale, 0.82 * scale, z + Math.sin(angle) * 0.14 * scale, 0.15 * scale, parent);
      bloom.scale.set(1, 0.74, 0.8);
    }
    orb('#f6dfa0', x, 0.82 * scale, z, 0.11 * scale, parent);
  };

  const buildPlacementModel = (kind: LandscapeKind, parent: T.Group) => {
    if (kind === 'tree') {
      pillar('#785b43', 0, 1.28, 0, 0.3, 2.55, parent);
      const crown = orb('#78a96b', 0, 3.12, 0, 1.45, parent);
      crown.scale.set(1.25, 0.88, 1.1);
      for (const [x, y, z, color] of [[-0.82, 2.9, 0.05, '#80b473'], [0.8, 3.05, -0.12, '#639b67'], [0.1, 3.7, -0.18, '#91b77a']] as [number, number, number, string][]) {
        const leaf = orb(color, x, y, z, 0.84, parent);
        leaf.scale.set(1.15, 0.92, 1);
      }
    } else if (kind === 'spirit-tree') {
      const trunk = pillar('#536d58', 0, 1.9, 0, 0.42, 3.8, parent);
      trunk.rotation.z = -0.08;
      for (const side of [-1, 1]) {
        const limb = pillar('#668365', side * 0.68, 3, 0, 0.17, 2.35, parent);
        limb.rotation.z = side * -0.56;
        const canopy = orb(side < 0 ? '#4d8178' : '#6ca58c', side * 1.04, 4.24, 0, 1.25, parent);
        canopy.scale.set(1.1, 0.85, 1);
      }
      orb('#81ae91', 0, 4.45, -0.12, 1.48, parent);
      orb('#ffe5a6', 0.14, 2.9, 0.4, 0.3, parent, true);
      const halo = shape(geometries.torus, '#b9f0d2', 0.14, 2.9, 0.41, 0.55, 0.55, 0.55, parent, true);
      halo.rotation.y = Math.PI / 4;
    } else if (kind === 'flower') {
      addPlacedFlower(parent, 0, 0, 1, '#e9a9ca');
    } else if (kind === 'flower-clump') {
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI * 2 / 7;
        const scale = 0.65 + (i % 3) * 0.13;
        addPlacedFlower(parent, Math.cos(angle) * 0.75, Math.sin(angle) * 0.68, scale,
          ['#e9a9ca', '#eed78e', '#b9afe1', '#f0c6a5'][i % 4]);
      }
    } else if (kind === 'garden-bed') {
      box('#a77d5d', 0, 0.21, -1.25, 3.7, 0.38, 0.18, parent);
      box('#a77d5d', 0, 0.21, 1.25, 3.7, 0.38, 0.18, parent);
      box('#a77d5d', -1.78, 0.21, 0, 0.18, 0.38, 2.5, parent);
      box('#a77d5d', 1.78, 0.21, 0, 0.18, 0.38, 2.5, parent);
      box('#715c43', 0, 0.18, 0, 3.4, 0.12, 2.15, parent);
      for (const x of [-0.95, 0.05, 1.02]) for (const z of [-0.58, 0.58]) {
        addPlacedFlower(parent, x, z, 0.52, (x + z > 0) ? '#e9a9ca' : '#eed78e');
      }
    } else if (kind === 'cottage' || kind === 'cabin') {
      const cabin = kind === 'cabin';
      box(cabin ? '#a17859' : '#e9dcc2', 0, 1.3, 0, 4.3, 2.6, 3.6, parent);
      const roof = shape(geometries.cone, cabin ? '#69554a' : '#aa8074', 0, 3.2, 0, 3.65, 1.85, 3.45, parent);
      roof.rotation.y = Math.PI / 4;
      box('#795d47', 0, 0.92, 1.83, 0.82, 1.85, 0.13, parent);
      for (const x of [-1.28, 1.28]) {
        const window = box('#f2d99e', x, 1.74, 1.86, 0.7, 0.7, 0.12, parent);
        window.material = material('#f2d99e', true);
      }
      box(cabin ? '#896a4d' : '#ad8968', 0, 0.15, 2.8, 3, 0.18, 1.45, parent);
    } else if (kind === 'gazebo') {
      for (const x of [-1.75, 1.75]) for (const z of [-1.75, 1.75]) pillar('#e9dcc2', x, 1.5, z, 0.12, 3, parent);
      const roof = shape(geometries.cone, '#9c8278', 0, 3.35, 0, 2.65, 1.15, 2.65, parent);
      roof.rotation.y = Math.PI / 4;
      for (const side of [-1, 1]) {
        const bench = box('#ae8968', side * 0.9, 0.54, 0, 1.35, 0.17, 0.56, parent);
        bench.rotation.y = Math.PI / 2;
      }
    } else if (kind === 'wooden-bridge') {
      for (let i = 0; i < 7; i++) box('#a57f60', 0, 0.18, (i - 3) * 0.55, 2.5, 0.16, 0.49, parent);
      for (const x of [-1.38, 1.38]) {
        pillar('#8c7159', x, 0.34, 0, 0.1, 0.68, parent);
        const rail = box('#9a7558', x, 0.72, 0, 0.11, 0.11, 3.9, parent);
      }
    } else if (kind === 'well') {
      const base = pillar('#d4c5a4', 0, 0.34, 0, 1.05, 0.68, parent);
      base.scale.z = 0.82;
      const waterBowl = pillar('#8bd5cd', 0, 0.63, 0, 0.78, 0.08, parent);
      waterBowl.scale.z = 0.84;
      for (const x of [-0.78, 0.78]) pillar('#8b7057', x, 1.45, 0, 0.085, 2.25, parent);
      const roof = shape(geometries.cone, '#a88172', 0, 2.65, 0, 1.2, 0.78, 1.15, parent);
      roof.rotation.y = Math.PI / 4;
      orb('#d8f4d5', 0, 0.76, 0, 0.16, parent, true);
    }
  };

  const bakePlacement = (root: T.Group) => {
    const parts = root.children.filter((child): child is T.Mesh => (child as T.Mesh).isMesh);
    const buckets = new Map<string, T.Mesh[]>();
    for (const part of parts) {
      const source = part.material as T.MeshStandardMaterial;
      const glowing = source.emissive.r > 0 || source.emissive.g > 0 || source.emissive.b > 0;
      const key = glowing ? `glow:${source.emissive.getHexString()}:${source.emissiveIntensity}` : 'surfaces';
      buckets.set(key, [...(buckets.get(key) ?? []), part]);
    }
    for (const [key, meshes] of buckets) {
      const glowing = key.startsWith('glow:');
      const mergedMaterial = glowing ? meshes[0].material : new T.MeshStandardMaterial({
        color: '#ffffff', vertexColors: true, roughness: 0.82,
      });
      const merged = bake(meshes, root, mergedMaterial as T.Material, !glowing);
      merged.userData.placementBaked = true;
      merged.userData.placementOwnedMaterial = !glowing;
      merged.userData.placementId = root.userData.placementId;
      merged.castShadow = meshes[0].castShadow;
      merged.receiveShadow = meshes[0].receiveShadow;
      for (const part of meshes) part.removeFromParent();
    }
  };

  const bakePreview = (root: T.Group, previewMaterial: T.MeshStandardMaterial) => {
    const parts = root.children.filter((child): child is T.Mesh => (child as T.Mesh).isMesh);
    if (!parts.length) return null;
    const merged = bake(parts, root, previewMaterial, false);
    merged.userData.previewOwnedGeometry = true;
    merged.userData.previewOwnedMaterial = true;
    merged.castShadow = parts.some(part => part.castShadow);
    merged.receiveShadow = parts.some(part => part.receiveShadow);
    merged.raycast = () => undefined;
    for (const part of parts) part.removeFromParent();
    return merged;
  };

  const disposeLandscapeGroup = (group: T.Group, disposeMaterials: boolean) => {
    group.traverse(object => {
      const mesh = object as T.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.userData.placementBaked) {
        mesh.geometry.dispose();
        if (mesh.userData.placementOwnedMaterial) (mesh.material as T.Material).dispose();
      }
      if (mesh.userData.previewOwnedGeometry) mesh.geometry.dispose();
      if (disposeMaterials && mesh.userData.previewOwnedMaterial) (mesh.material as T.Material).dispose();
    });
    group.removeFromParent();
    group.clear();
  };

  const placementSignature = (placement: LandscapePlacement) =>
    `${placement.kind}:${placement.x}:${placement.z}:${placement.rotation}`;

  let previewGroup: T.Group | null = null;
  let previewKind: LandscapeKind | null = null;
  let previewId = '';
  let previewValid = true;
  const clearPreview = () => {
    if (!previewGroup) return;
    disposeLandscapeGroup(previewGroup, true);
    previewGroup = null;
    previewKind = null;
  };
  const setLandscapePreview = (placement: LandscapePlacement | null, valid = true) => {
    if (!placement) {
      clearPreview();
      return;
    }
    if (!previewGroup || previewKind !== placement.kind || previewId !== placement.id) {
      clearPreview();
      previewGroup = new T.Group();
      previewGroup.name = 'landscape-placement-preview';
      previewGroup.userData.preview = true;
      previewGroup.userData.placementId = undefined;
      landscapeRoot.add(previewGroup);
      previewKind = placement.kind;
      previewId = placement.id;
      if (placement.id === 'main-garden' && placement.kind === 'garden-bed') {
        const bedMaterial = new T.MeshBasicMaterial({ color: valid ? '#83bd83' : '#d98484', transparent: true, opacity: 0.2, depthWrite: false, side: T.DoubleSide });
        const bed = new T.Mesh(new T.CircleGeometry(8.25, 64), bedMaterial);
        bed.rotation.x = -Math.PI / 2;
        bed.position.y = 0.035;
        bed.userData.previewOwnedMaterial = true;
        bed.userData.previewOwnedGeometry = true;
        bed.raycast = () => undefined;
        previewGroup.add(bed);
        const rimMaterial = new T.MeshBasicMaterial({ color: valid ? '#dfc78e' : '#d98484', transparent: true, opacity: 0.68, depthWrite: false });
        const rim = new T.Mesh(geometries.torus, rimMaterial);
        rim.rotation.x = Math.PI / 2;
        rim.position.y = 0.07;
        rim.scale.set(8.25, 8.25, 8.25);
        rim.userData.previewOwnedMaterial = true;
        rim.raycast = () => undefined;
        previewGroup.add(rim);
      } else {
        buildPlacementModel(placement.kind, previewGroup);
        const previewMaterial = new T.MeshStandardMaterial({
          color: valid ? '#9be6c2' : '#ed8f8a',
          emissive: valid ? '#62c8a0' : '#cb5c62', emissiveIntensity: 0.18,
          transparent: true, opacity: 0.42, depthWrite: false, roughness: 0.55,
        });
        if (!bakePreview(previewGroup, previewMaterial)) previewMaterial.dispose();
      }
    }
    if (previewValid !== valid) {
      previewGroup.traverse(object => {
        const mesh = object as T.Mesh;
        if (!mesh.isMesh || !mesh.userData.previewOwnedMaterial) return;
        const mat = mesh.material as T.MeshStandardMaterial;
        mat.color.set(valid ? '#9be6c2' : '#ed8f8a');
        mat.emissive?.set(valid ? '#62c8a0' : '#cb5c62');
      });
    }
    previewValid = valid;
    previewGroup.position.set(placement.x, planetElevation(placement.x, placement.z), placement.z);
    orientToLand(previewGroup, placement.x, placement.z, placement.rotation);
  };

  const reconcileLandscapePlacements = (state: State) => {
    const next = new Map(state.landscapePlacements.map(placement => [placement.id, placement]));
    for (const [id, existing] of placedLandscape) {
      const replacement = next.get(id);
      if (!replacement || replacement.kind !== existing.kind) {
        disposeLandscapeGroup(existing.root, false);
        placedLandscape.delete(id);
      }
    }
    for (const placement of state.landscapePlacements) {
      let existing = placedLandscape.get(placement.id);
      if (!existing) {
        const root = new T.Group();
        root.name = `landscape-${placement.kind}-${placement.id}`;
        root.userData.placementId = placement.id;
        if (!(placement.id === 'main-garden' && placement.kind === 'garden-bed')) {
          buildPlacementModel(placement.kind, root);
          bakePlacement(root);
        } else {
          // The actual planting mesh is owned by createGarden; this invisible
          // disc keeps the relocated, user-built garden selectable in 3D.
          const proxy = new T.Mesh(new T.CircleGeometry(8.25, 48), new T.MeshBasicMaterial({
            colorWrite: false, transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide,
          }));
          proxy.rotation.x = -Math.PI / 2;
          proxy.position.y = 0.08;
          proxy.userData.placementId = placement.id;
          proxy.userData.placementBaked = true;
          proxy.userData.placementOwnedMaterial = true;
          root.add(proxy);
        }
        root.traverse(object => { (object as T.Object3D).userData.placementId = placement.id; });
        landscapeRoot.add(root);
        existing = { kind: placement.kind, placement, root };
        placedLandscape.set(placement.id, existing);
      } else if (placementSignature(existing.placement) !== placementSignature(placement)) {
        existing.root.position.set(placement.x, planetElevation(placement.x, placement.z), placement.z);
        orientToLand(existing.root, placement.x, placement.z, placement.rotation);
        existing.placement = placement;
      }
      existing.root.position.set(placement.x, planetElevation(placement.x, placement.z), placement.z);
      orientToLand(existing.root, placement.x, placement.z, placement.rotation);
    }
    placementObstacles.length = 0;
    for (const placement of state.landscapePlacements) {
      const radius = movementRadiusByKind[placement.kind];
      if (radius > 0) placementObstacles.push({ x: placement.x, z: placement.z, radius, placementId: placement.id });
      if (placement.kind === 'gazebo') {
        for (const dx of [-1.75, 1.75]) for (const dz of [-1.75, 1.75]) {
          const c = Math.cos(placement.rotation), s = Math.sin(placement.rotation);
          placementObstacles.push({
            x: placement.x + dx * c + dz * s,
            z: placement.z - dx * s + dz * c,
            radius: 0.25,
            placementId: placement.id,
          });
        }
      }
    }
    const coveredWater = waterwayObstacles.filter(obstacle => !state.landscapePlacements.some(placement =>
      placement.kind === 'wooden-bridge' && bridgeCoversWater(placement, obstacle)));
    combinedObstacles.splice(0, combinedObstacles.length, ...worldObstacles, ...coveredWater, ...placementObstacles);
  };
  const rebuild = (state: State) => {
    const nextSignature = JSON.stringify([state.decorations, state.worldSeed]);
    if (nextSignature !== signature) {
      signature = nextSignature;
      for (const id of Object.keys(districts) as District[]) {
        const group = additions[id];
        group.clear();
        for (const item of state.decorations.filter(d => d.district === id)) furnishing(item, group, state.worldSeed);
        roots[id].userData.decorations = state.decorations.filter(d => d.district === id).length;
      }
    }
    reconcileLandscapePlacements(state);
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

  function pickLandscape(raycaster: T.Raycaster): string | null {
    // Pointer-up can happen between scene ticks, especially after a placement
    // save has just added or moved its group. Update matrices here so picking
    // uses the same world transform as the rendered model without waiting for
    // another animation frame.
    raycaster.camera?.updateMatrixWorld(true);
    landscapeRoot.updateWorldMatrix(true, true);
    const hits = raycaster.intersectObject(landscapeRoot, true);
    for (const hit of hits) {
      let current: T.Object3D | null = hit.object;
      while (current && current !== landscapeRoot) {
        const id = current.userData.placementId;
        if (typeof id === 'string' && id) return id;
        current = current.parent;
      }
    }
    return null;
  }

  function tick(time: number, reduced: boolean, windStrength = 1) {
    fallGlints.visible = !reduced;
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
    updateFallGlints(time);
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

  // Water collision is kept in its own stable list so build validation can
  // exempt a wooden bridge from the stream alone. Movement still treats these
  // circles as solid water except at the fixed bridge, stepping stones, and
  // beneath saved bridge placements.
  const waterwayObstacles: (ObstacleCircle & { kind: 'waterway' })[] = [];
  const addWaterwayObstacle = (x: number, z: number, radius: number) =>
    waterwayObstacles.push({ x, z, radius, kind: 'waterway' });
  const nearCrossing = (
    point: T.Vector3,
    center: T.Vector3,
    along: T.Vector3,
    alongLimit: number,
    across: T.Vector3,
    acrossLimit: number,
  ) => {
    const dx = point.x - center.x, dz = point.z - center.z;
    return Math.abs(dx * along.x + dz * along.z) <= alongLimit
      && Math.abs(dx * across.x + dz * across.z) <= acrossLimit;
  };

  const fixedBridgeOpen = (point: T.Vector3, waterRadius: number) => fixedBridgePlanks.some(plank => {
    const dx = point.x - plank.x, dz = point.z - plank.z;
    const cos = Math.cos(plank.rotation), sin = Math.sin(plank.rotation);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    const outsideX = Math.max(0, Math.abs(localX) - plank.width * 0.5);
    const outsideZ = Math.max(0, Math.abs(localZ) - plank.length * 0.5);
    // Remove this blocker only when its collider and the player's .38m radius
    // can reach one of the visible planks.
    return Math.hypot(outsideX, outsideZ) <= waterRadius + 0.38;
  });
  const steppingStonesOpen = (point: T.Vector3) =>
    nearCrossing(point, streamCrossing, streamCrossingFlow, 1.05, streamCrossingAcross, 2.05);
  for (let i = 0; i <= 14; i++) {
    const point = streamCurve.getPointAt(i / 14);
    if (fixedBridgeOpen(point, 0.85) || steppingStonesOpen(point)) continue;
    addWaterwayObstacle(-21 + point.x, 19 + point.z, 0.85);
  }

  const inletSteppingOpen = (point: T.Vector3) =>
    nearCrossing(point, inletCrossing, inletFlow, 1.05, inletAcross, 1.7);
  for (let i = 0; i <= 6; i++) {
    const point = inletCurve.getPointAt(i / 6);
    if (inletSteppingOpen(point) || fixedBridgeOpen(point, 0.68)) continue;
    addWaterwayObstacle(-21 + point.x, 19 + point.z, 0.68);
  }

  function bridgeCoversWater(placement: LandscapePlacement, obstacle: ObstacleCircle): boolean {
    const dx = obstacle.x - placement.x, dz = obstacle.z - placement.z;
    const cos = Math.cos(placement.rotation), sin = Math.sin(placement.rotation);
    const localX = dx * cos - dz * sin;
    const localZ = dx * sin + dz * cos;
    return Math.abs(localX) <= 1.25 + obstacle.radius
      && Math.abs(localZ) <= 1.95 + obstacle.radius;
  }

  combinedObstacles.push(...worldObstacles, ...waterwayObstacles);

  return {
    sync,
    tick,
    activate,
    get ground() { return ground; },
    root: (id: District) => roots[id],
    landscapeRoot,
    setLandscapePreview,
    pickLandscape,
    bounds,
    get landscapeObstacles() { return placementObstacles; },
    get waterwayObstacles() { return waterwayObstacles; },
    get obstacles() { return combinedObstacles; },
  };
}
