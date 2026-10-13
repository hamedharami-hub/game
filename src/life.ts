import { species, type Species, type State } from './state.ts';
import { homeArrangements, type HomeArrangement } from './home-layout.ts';

export interface FlowerVase { id: string; species: Species; x: number; z: number }
export interface SharedLife { flowers: Partial<Record<Species, number>>; vases: FlowerVase[]; lastGift: Species | null; greenhouseColor: Species; homeArrangement: HomeArrangement }
export const emptyLife = (): SharedLife => ({ flowers: {}, vases: [], lastGift: null, greenhouseColor: 'moonflower', homeArrangement: 'tea' });
export function decodeLife(value: unknown): SharedLife {
  const result = emptyLife();
  if (!value || typeof value !== 'object') return result;
  const raw = value as Partial<SharedLife>;
  if (homeArrangements.includes(raw.homeArrangement as HomeArrangement)) result.homeArrangement = raw.homeArrangement!;
  for (const kind of Object.keys(species) as Species[]) {
    const count = raw.flowers?.[kind];
    if (typeof count === 'number' && Number.isFinite(count) && count >= 0) result.flowers[kind] = Math.min(99, Math.floor(count));
  }
  if (raw.lastGift && Object.hasOwn(species, raw.lastGift)) result.lastGift = raw.lastGift;
  if (raw.greenhouseColor && Object.hasOwn(species, raw.greenhouseColor)) result.greenhouseColor = raw.greenhouseColor;
  for (const vase of Array.isArray(raw.vases) ? raw.vases.slice(0, 64) : []) {
    if (!vase || typeof vase.id !== 'string' || !/^[a-z0-9-]{1,64}$/i.test(vase.id)
      || !Object.hasOwn(species, vase.species) || ![vase.x, vase.z].every(Number.isFinite)
      || Math.hypot(vase.x, vase.z) > 80 || result.vases.some(item => item.id === vase.id)) continue;
    result.vases.push({ id: vase.id, species: vase.species, x: vase.x, z: vase.z });
  }
  return result;
}
export function useFlower(state: State, kind: Species, use: 'gift' | 'vase', vase?: FlowerVase): State {
  const count = state.life.flowers[kind] ?? 0;
  if (!Object.hasOwn(species, kind) || count < 1) return state;
  if (use === 'vase' && (!vase || vase.species !== kind || state.life.vases.length >= 64
    || decodeLife({ vases: [vase] }).vases.length !== 1 || state.life.vases.some(item => item.id === vase.id))) return state;
  return { ...state, life: { ...state.life, flowers: { ...state.life.flowers, [kind]: count - 1 },
    lastGift: use === 'gift' ? kind : state.life.lastGift,
    vases: use === 'vase' ? [...state.life.vases, vase!] : state.life.vases } };
}
