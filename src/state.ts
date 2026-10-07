export const SAVE_KEY = 'dream-caravan:garden:v1';
const plantIdPattern = /^[a-z0-9-]{1,64}$/i;
export const resources = ['seed', 'crystal', 'feather'] as const;
export type Resource = typeof resources[number];
export type Invention = 'lantern' | 'sprout';
export interface State { version: 1; collected: Resource[]; invention: Invention | null; restored: boolean; plotLevel: number; plants: Plant[]; essence: number; houseLevel: number; projects: Project[]; hybrids: boolean; aura: number; lastGatherAt: number | null; visited: District[]; worldSeed: number; regionLevels: Record<District,number>; decorations: Decoration[]; landscapePlacements: LandscapePlacement[]; gorHair: HairColor; angelHair:HairColor; gorOutfit:Outfit; angelOutfit:Outfit }
export const initialState = (): State => ({ version: 1, collected: [], invention: null, restored: false, plotLevel: 5, plants: [], essence: 0, houseLevel: 0, projects: [], hybrids: false, aura: 0, lastGatherAt: null, visited: ['garden'],worldSeed:1,regionLevels:emptyRegionLevels(),decorations:[],landscapePlacements:[],gorHair:'white',angelHair:'black',gorOutfit:'classic',angelOutfit:'classic' });
export function decodeSave(raw: string | null): State {
  try {
    const s = JSON.parse(raw ?? 'null');
    if (!s || s.version !== 1 || !Array.isArray(s.collected) || !s.collected.every((r: unknown) => resources.includes(r as Resource))) return initialState();
    const collected = [...new Set<Resource>(s.collected)];
    const invention = ['lantern', 'sprout'].includes(s.invention) && collected.length === 3 ? s.invention as Invention : null;
    // Open the complete garden for both new and returning players. Older saves
    // keep their plants and appearance, while the previously locked soil opens.
    const plotLevel = 5;
    const plants: Plant[] = [];
    for(const p of Array.isArray(s.plants)?s.plants:[]){
      if(!p||typeof p.id!=='string'||!plantIdPattern.test(p.id)||!Object.hasOwn(species,p.species)||!cellUnlocked(plotLevel,p.col,p.row)||![p.plantedAt,p.boostMs,p.lastWaterAt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)||plants.some(q=>q.id===p.id||q.col===p.col&&q.row===p.row))continue;
      plants.push({id:p.id,species:p.species,col:p.col,row:p.row,plantedAt:p.plantedAt,boostMs:Math.min(p.boostMs,species[p.species as Species].minutes*60000),lastWaterAt:p.lastWaterAt,lastHarvestAt:typeof p.lastHarvestAt==='number'&&Number.isFinite(p.lastHarvestAt)&&p.lastHarvestAt>=0?p.lastHarvestAt:null});
    }
    return { version: 1, collected, invention, restored: Boolean(s.restored && invention), plotLevel, plants,
      essence:bounded(s.essence,100000),houseLevel:bounded(s.houseLevel,3),aura:bounded(s.aura,3),
      projects:Array.isArray(s.projects)?[...new Set<Project>(s.projects.filter((id:unknown)=>typeof id==='string'&&Object.hasOwn(projects,id)))]:[],
      hybrids:s.hybrids===true,lastGatherAt:typeof s.lastGatherAt==='number'&&Number.isFinite(s.lastGatherAt)&&s.lastGatherAt>=0?s.lastGatherAt:null,
      worldSeed:Math.max(1,bounded(s.worldSeed,2147483647)),gorHair:hairColors.includes(s.gorHair)?s.gorHair:'white',angelHair:hairColors.includes(s.angelHair)?s.angelHair:'black',gorOutfit:outfits.includes(s.gorOutfit)?s.gorOutfit:'classic',angelOutfit:outfits.includes(s.angelOutfit)?s.angelOutfit:'classic',regionLevels:Object.fromEntries(districtIds.map(id=>[id,bounded(s.regionLevels?.[id],20)])) as Record<District,number>,
      decorations:decodeDecorations(s),
      landscapePlacements:decodeLandscapePlacements(s.landscapePlacements),
      visited:Array.isArray(s.visited)?[...new Set<District>(['garden',...s.visited.filter((id:unknown)=>districtIds.includes(id as District))])]:['garden']
    };
  } catch { return initialState(); }
}
export function collect(s: State, r: Resource): State { return s.collected.includes(r) ? s : { ...s, collected: [...s.collected, r] }; }
export function craft(s: State, invention: Invention): State { return s.collected.length === 3 && !s.invention ? { ...s, invention } : s; }
export function restore(s: State): State { return s.invention && !s.restored ? { ...s, restored: true } : s; }

export const species = {
  moonflower: { name: 'گل ماه', minutes: 1, color: '#dad0f3' },
  sunblossom: { name: 'گل آفتاب', minutes: 1.5, color: '#f7ca75' },
  spiritfern: { name: 'سرخس روح', minutes: 2, color: '#91dac3' },
  starlily: { name: 'سوسن ستاره', minutes: 1.25, color: '#f0a6bf' },
} as const;
export type Species = keyof typeof species;
export interface Plant { id: string; species: Species; col: number; row: number; plantedAt: number; boostMs: number; lastWaterAt: number; lastHarvestAt: number | null }
export const stageNames = ['بذر', 'جوانه', 'بوته', 'شکوفه'] as const;
export function gridSize(level: number) { return 2 + level * 2; }
export function cellUnlocked(level: number, col: number, row: number) { const min = 4 - gridSize(level) / 2; return Number.isInteger(col) && Number.isInteger(row) && col >= min && row >= min && col < 8-min && row < 8-min; }
export function growthDurationMs(p: Plant) {
  // Each planted flower gets a stable, subtle rhythm so nearby blooms do not
  // all open on the same beat. The variation follows the plant when moved.
  let hash = 0;
  for (const char of `${p.species}:${p.id}`) hash = (hash * 31 + char.charCodeAt(0)) % 201;
  return species[p.species].minutes * 60_000 * (0.9 + hash / 1_000);
}
export function growthStage(p: Plant, now = Date.now()): number { const progress = Math.max(0, now-p.plantedAt) + p.boostMs; return Math.min(3, Math.floor(progress / (growthDurationMs(p)/3))); }
export function growRemaining(p: Plant, now = Date.now()) { return Math.max(0, growthDurationMs(p) - Math.max(0,now-p.plantedAt) - p.boostMs); }
export function plantAt(s: State, kind: Species, col: number, row: number, now: number, id: string): State {
  if (!Object.hasOwn(species,kind) || typeof id!=='string' || !plantIdPattern.test(id) || !cellUnlocked(s.plotLevel,col,row) || s.plants.some(p=>p.col===col&&p.row===row||p.id===id) || !Number.isFinite(now) || now<0) return s;
  return {...s,plants:[...s.plants,{id,species:kind,col,row,plantedAt:now,boostMs:0,lastWaterAt:0,lastHarvestAt:null}]};
}
export function movePlant(s: State, id: string, col: number, row: number): State {
  if(!cellUnlocked(s.plotLevel,col,row)||s.plants.some(p=>p.col===col&&p.row===row))return s;
  const p=s.plants.find(p=>p.id===id);if(!p)return s;
  return {...s,plants:s.plants.map(p=>p.id===id?{...p,col,row}:p)};
}
export function waterPlant(s: State,id:string,now=Date.now()):State {
 const p=s.plants.find(p=>p.id===id);if(!p||growthStage(p,now)===3||!Number.isFinite(now)||now<p.plantedAt)return s;
 const duration=growthDurationMs(p), boost=Math.min(duration,p.boostMs+duration/3);
 return {...s,plants:s.plants.map(p=>p.id===id?{...p,lastWaterAt:now,boostMs:boost}:p)};
}
export function expansionRequirement(_level:number){return 0;}
export function expandPlot(s:State,now=Date.now()):State {
 if(s.plotLevel>=5)return s;
 return {...s,plotLevel:s.plotLevel+1};
}
export function storageKey(profile: string | null) { return profile ? `${SAVE_KEY}:profile:${encodeURIComponent(profile.slice(0,128))}` : SAVE_KEY; }

function bounded(value:unknown,max:number){return typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(max,Math.floor(value)):0;}
export const districtIds=['garden','greenhouse','home','village','grove','sanctuary'] as const;
export type District=typeof districtIds[number];
export const projects={
 bench:{name:'نیمکت عاشقانه',cost:0,district:'garden'},
 pond:{name:'برکهٔ نیلوفر',cost:0,district:'garden'},
 greenhouse:{name:'فعال‌کردن گلخانه',cost:0,district:'greenhouse'},
 lamps:{name:'چراغ‌های میدان',cost:0,district:'village'},
 fountain:{name:'آبنمای مردم',cost:0,district:'village'},
 bridge:{name:'پلِ بیشه',cost:0,district:'grove'},
 butterfly:{name:'پناه پروانه‌های نور',cost:0,district:'garden'},
 seedvault:{name:'خزانهٔ بذرها',cost:0,district:'greenhouse'},
 moonlab:{name:'رصدخانهٔ پیوند',cost:0,district:'greenhouse'},
 library:{name:'کتابخانهٔ خاطره',cost:0,district:'home'},
 skyterrace:{name:'ایوان آسمان',cost:0,district:'home'},
 market:{name:'بازارِ نور',cost:0,district:'village'},
 gathering:{name:'حلقهٔ گردهمایی',cost:0,district:'village'},
 spiritgate:{name:'دروازهٔ درختان روح',cost:0,district:'grove'},
 waterfall:{name:'آبشارِ روح',cost:0,district:'grove'},
 memory:{name:'آینهٔ خاطره',cost:0,district:'sanctuary'},
 constellation:{name:'ستاره‌نگارِ عشق',cost:0,district:'sanctuary'},
} as const;
export type Project=keyof typeof projects;
export function buildProject(s:State,id:Project):State{
 if(!Object.hasOwn(projects,id)||s.projects.includes(id))return s;
 return {...s,projects:[...s.projects,id]};
}
export function harvest(s:State,id:string,now=Date.now()):State{
 const p=s.plants.find(p=>p.id===id);
 if(!p||!Number.isFinite(now)||now<p.plantedAt||growthStage(p,now)<3)return s;
 // A harvested flower remains planted and begins a fresh, short growth cycle.
 return {...s,plants:s.plants.map(p=>p.id===id?{...p,plantedAt:now,boostMs:0,lastWaterAt:0,lastHarvestAt:now}:p)};
}
export function gatherLight(s:State,now=Date.now()):State{
 if(!Number.isFinite(now)||now<0)return s;
 return {...s,essence:Math.min(100000,s.essence+3),lastGatherAt:now};
}
export function upgradeHouse(s:State):State{
 if(s.houseLevel>=3)return s;
 return {...s,houseLevel:s.houseLevel+1};
}
export function discoverHybrid(s:State,now=Date.now()):State{
 if(s.hybrids)return s;
 return {...s,hybrids:true};
}
export function awakenAura(s:State):State{
 if(s.aura>=3)return s;return {...s,aura:s.aura+1};
}
export function visitDistrict(s:State,id:District):State{
 return !districtIds.includes(id)||s.visited.includes(id)?s:{...s,visited:[...s.visited,id]};
}

export const furnishings={crystal:{name:'بلورِ روح',cost:0},arbor:{name:'طاقِ شکوفه',cost:0},pool:{name:'حوض نور',cost:0},pavilion:{name:'کوشک جادویی',cost:0}} as const;
export type Furnishing=keyof typeof furnishings;
export interface Decoration {district:District;slot:number;kind:Furnishing}
function emptyRegionLevels(){return Object.fromEntries(districtIds.map(id=>[id,0])) as Record<District,number>;}
export function regionRadius(id:District,level:number){return (id==='garden'?26:32)+level*4;}
export function regionSlots(level:number){return 8+level*4;}
export function regionExpansionCost(_level:number){return 0;}
export function expandRegion(s:State,id:District):State{
 if(!districtIds.includes(id)||s.regionLevels[id]>=20)return s;
 return {...s,regionLevels:{...s.regionLevels,[id]:s.regionLevels[id]+1}};
}
export function placeDecoration(s:State,district:District,slot:number,kind:Furnishing):State{
 if(!districtIds.includes(district)||!Object.hasOwn(furnishings,kind)||!Number.isInteger(slot)||slot<0||slot>=regionSlots(s.regionLevels[district])||s.decorations.some(d=>d.district===district&&d.slot===slot))return s;
 return {...s,decorations:[...s.decorations,{district,slot,kind}]};
}
export function removeDecoration(s:State,district:District,slot:number):State{
 if(!s.decorations.some(d=>d.district===district&&d.slot===slot))return s;
 return {...s,decorations:s.decorations.filter(d=>d.district!==district||d.slot!==slot)};
}
export function moveDecoration(s:State,district:District,from:number,to:number):State{
 if(!districtIds.includes(district)||!Number.isInteger(to)||to<0||to>=regionSlots(s.regionLevels[district])||s.decorations.some(d=>d.district===district&&d.slot===to)||!s.decorations.some(d=>d.district===district&&d.slot===from))return s;
 return {...s,decorations:s.decorations.map(d=>d.district===district&&d.slot===from?{...d,slot:to}:d)};
}
export function decorationPosition(id:District,slot:number,seed:number){
 const ring=slot<8?0:1+Math.floor((slot-8)/4), index=slot<8?slot:(slot-8)%4,count=ring===0?8:4;
 const angle=(index+.3+((seed%997)/997)*.2+ring*.37)/count*Math.PI*2;
 const radius=(id==='garden'?19:16)+ring*3.8;
 return {x:Math.cos(angle)*radius,z:Math.sin(angle)*radius};
}
function decodeDecorations(s:any):Decoration[]{
 const result:Decoration[]=[];
 for(const d of Array.isArray(s.decorations)?s.decorations:[]){if(!d||!districtIds.includes(d.district)||!Object.hasOwn(furnishings,d.kind)||!Number.isInteger(d.slot)||d.slot<0||d.slot>=regionSlots(bounded(s.regionLevels?.[d.district],20))||result.some(q=>q.district===d.district&&q.slot===d.slot))continue;result.push({district:d.district,slot:d.slot,kind:d.kind});}
 return result;
}

export const hairColors=['black','brown','white'] as const;
export type HairColor=typeof hairColors[number];
export const outfits=['classic','traveler','celestial'] as const;
export type Outfit=typeof outfits[number];
export function setAppearance(s:State,who:'angel'|'gor',hair:HairColor,outfit:Outfit):State{
 if(!['angel','gor'].includes(who)||!hairColors.includes(hair)||!outfits.includes(outfit))return s;
 if(who==='angel')return {...s,angelHair:hair,angelOutfit:outfit};return {...s,gorHair:hair,gorOutfit:outfit};
}

/** All freeform props are kept on the same walkable land, in world-space units. */
export const LANDSCAPE_RADIUS = 82;
export const LANDSCAPE_PLACEMENT_CLEARANCE = 0.12;
export const landscapeKinds = [
  'tree', 'spirit-tree', 'flower', 'flower-clump', 'garden-bed',
  'cottage', 'cabin', 'gazebo', 'wooden-bridge', 'well',
] as const;
export type LandscapeKind = typeof landscapeKinds[number];
export interface LandscapePlacement {
  /** Caller-generated and persistent; this module deliberately does not use randomness. */
  id: string;
  kind: LandscapeKind;
  x: number;
  z: number;
  /** Radians, normalized to [0, 2π). */
  rotation: number;
}

export const landscapeFootprintRadii: Readonly<Record<LandscapeKind, number>> = {
  tree: 2.5,
  'spirit-tree': 3.5,
  flower: 0.35,
  'flower-clump': 1.1,
  // The movable live planting garden uses an 8.25m plot with a small rim margin.
  'garden-bed': 8.35,
  cottage: 5.5,
  cabin: 4.5,
  gazebo: 4,
  'wooden-bridge': 3.5,
  well: 1.5,
};

export function isLandscapePositionValid(x: number, z: number, kind?: LandscapeKind): boolean {
  const footprint = kind === undefined ? 0 : landscapeFootprintRadii[kind];
  return Number.isFinite(x) && Number.isFinite(z) && Number.isFinite(footprint)
    && Math.hypot(x, z) <= LANDSCAPE_RADIUS - footprint;
}

export function placeLandscapePlacement(s: State, placement: LandscapePlacement): State {
  if (!isLandscapePlacementValid(placement)
    || s.landscapePlacements.some(p => p.id === placement.id)
    || !hasLandscapePlacementClearance(placement, s.landscapePlacements)) return s;
  return { ...s, landscapePlacements: [...s.landscapePlacements, normalizeLandscapePlacement(placement)] };
}

export function moveLandscapePlacement(s: State, id: string, x: number, z: number, rotation?: number): State {
  const current = s.landscapePlacements.find(p => p.id === id);
  if (!current || !isLandscapePositionValid(x, z, current.kind) || (rotation !== undefined && !Number.isFinite(rotation))) return s;
  const moved = { ...current, x, z, rotation: rotation === undefined ? current.rotation : normalizeRotation(rotation) };
  if (!hasLandscapePlacementClearance(moved, s.landscapePlacements, id)) return s;
  return {
    ...s,
    landscapePlacements: s.landscapePlacements.map(p => p.id === id
      ? moved
      : p),
  };
}

export function removeLandscapePlacement(s: State, id: string): State {
  if (!s.landscapePlacements.some(p => p.id === id)) return s;
  return { ...s, landscapePlacements: s.landscapePlacements.filter(p => p.id !== id) };
}

function isLandscapePlacementValid(value: unknown): value is LandscapePlacement {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<LandscapePlacement>;
  return typeof p.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(p.id)
    && typeof p.kind === 'string' && landscapeKinds.includes(p.kind as LandscapeKind)
    && isLandscapePositionValid(p.x as number, p.z as number, p.kind as LandscapeKind)
    && typeof p.rotation === 'number' && Number.isFinite(p.rotation);
}

function normalizeLandscapePlacement(p: LandscapePlacement): LandscapePlacement {
  return { id: p.id, kind: p.kind, x: p.x, z: p.z, rotation: normalizeRotation(p.rotation) };
}

function normalizeRotation(rotation: number): number {
  const turn = Math.PI * 2;
  return ((rotation % turn) + turn) % turn;
}

function hasLandscapePlacementClearance(
  placement: LandscapePlacement,
  existing: readonly LandscapePlacement[],
  ignoreId?: string,
): boolean {
  const radius = landscapeFootprintRadii[placement.kind];
  return existing.every(other => other.id === ignoreId || Math.hypot(placement.x - other.x, placement.z - other.z)
    >= radius + landscapeFootprintRadii[other.kind] + LANDSCAPE_PLACEMENT_CLEARANCE);
}

function decodeLandscapePlacements(value: unknown): LandscapePlacement[] {
  if (!Array.isArray(value)) return [];
  const placements: LandscapePlacement[] = [];
  for (const entry of value) {
    if (!isLandscapePlacementValid(entry)) continue;
    const placement = normalizeLandscapePlacement(entry);
    if (placements.some(p => p.id === placement.id) || !hasLandscapePlacementClearance(placement, placements)) continue;
    placements.push(placement);
  }
  return placements;
}
