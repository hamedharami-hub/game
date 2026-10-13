import * as T from 'three';
import { species, type State } from './state.ts';
import { planetElevation } from './interactions.ts';

/** Small shared meshes; no textures or private art are generated. */
export function createLifeWorld(scene: T.Scene) {
  const root = new T.Group(); scene.add(root);
  const pot = new T.CylinderGeometry(.28, .2, .45, 10);
  const stem = new T.CylinderGeometry(.025, .025, .55, 5);
  const petal = new T.SphereGeometry(.15, 7, 5);
  const clay = new T.MeshStandardMaterial({ color: '#bd896c', roughness: .85 });
  const green = new T.MeshStandardMaterial({ color: '#548569' });
  const colors = new Map(Object.entries(species).map(([kind, spec]) => [kind, new T.MeshStandardMaterial({ color: spec.color })]));
  let signature = '';
  return {
    sync(state: State) {
      const next = JSON.stringify(state.life.vases); if (next === signature) return; signature = next;
      for (const child of root.children) {
        const mesh = child as T.InstancedMesh;
        if (mesh.geometry === petal) (mesh.material as T.Material).dispose();
        mesh.dispose();
      }
      root.clear();
      const count = state.life.vases.length; if (!count) return;
      const pots = new T.InstancedMesh(pot, clay, count);
      const stems = new T.InstancedMesh(stem, green, count);
      const petals = new T.InstancedMesh(petal, colors.get('moonflower')!.clone(), count * 5);
      // Instance color is multiplied by the material; use white for all species.
      (petals.material as T.MeshStandardMaterial).color.set('#ffffff');
      const dummy = new T.Object3D();
      state.life.vases.forEach((vase, slot) => {
        const ground = planetElevation(vase.x, vase.z);
        dummy.position.set(vase.x, ground + .25, vase.z); dummy.updateMatrix(); pots.setMatrixAt(slot, dummy.matrix);
        dummy.position.y = ground + .7; dummy.updateMatrix(); stems.setMatrixAt(slot, dummy.matrix);
        for (let i = 0; i < 5; i++) {
          dummy.position.set(vase.x + Math.cos(i * Math.PI * .4) * .18, ground + 1, vase.z + Math.sin(i * Math.PI * .4) * .18);
          dummy.updateMatrix(); petals.setMatrixAt(slot * 5 + i, dummy.matrix);
          petals.setColorAt(slot * 5 + i, colors.get(vase.species)!.color);
        }
      });
      for (const mesh of [pots, stems, petals]) { mesh.computeBoundingSphere(); root.add(mesh); }
    },
  };
}
