export const SAVE_KEY = 'dream-caravan:garden:v1';
export const resources = ['seed', 'crystal', 'feather'] as const;
export type Resource = typeof resources[number];
export type Invention = 'lantern' | 'sprout';
export interface State { version: 1; collected: Resource[]; invention: Invention | null; restored: boolean; plotLevel: number; plants: Plant[]; essence: number; houseLevel: number; projects: Project[]; hybrids: boolean; aura: number; lastGatherAt: number | null; visited: District[]; worldSeed: number; regionLevels: Record<District,number>; decorations: Decoration[]; gorHair: HairColor; angelHair:HairColor; gorOutfit:Outfit; angelOutfit:Outfit }
export const initialState = (): State => ({ version: 1, collected: [], invention: null, restored: false, plotLevel: 1, plants: [], essence: 0, houseLevel: 0, projects: [], hybrids: false, aura: 0, lastGatherAt: null, visited: ['garden'],worldSeed:1,regionLevels:emptyRegionLevels(),decorations:[],gorHair:'white',angelHair:'black',gorOutfit:'classic',angelOutfit:'classic' });
export function decodeSave(raw: string | null): State {
  try {
    const s = JSON.parse(raw ?? 'null');
    if (!s || s.version !== 1 || !Array.isArray(s.collected) || !s.collected.every((r: unknown) => resources.includes(r as Resource))) return initialState();
    const collected = [...new Set<Resource>(s.collected)];
    const invention = ['lantern', 'sprout'].includes(s.invention) && collected.length === 3 ? s.invention as Invention : null;
    const plotLevel = [1,2,3,4,5].includes(s.plotLevel) ? s.plotLevel : 1;
    const plants: Plant[] = [];
    for(const p of Array.isArray(s.plants)?s.plants:[]){
      if(!p||typeof p.id!=='string'||!/^[a-z0-9-]{1,64}$/i.test(p.id)||!Object.hasOwn(species,p.species)||!cellUnlocked(plotLevel,p.col,p.row)||![p.plantedAt,p.boostMs,p.lastWaterAt].every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0)||plants.some(q=>q.id===p.id||q.col===p.col&&q.row===p.row))continue;
      plants.push({id:p.id,species:p.species,col:p.col,row:p.row,plantedAt:p.plantedAt,boostMs:Math.min(p.boostMs,species[p.species as Species].minutes*60000),lastWaterAt:p.lastWaterAt,lastHarvestAt:typeof p.lastHarvestAt==='number'&&Number.isFinite(p.lastHarvestAt)&&p.lastHarvestAt>=0?p.lastHarvestAt:null});
    }
    return { version: 1, collected, invention, restored: Boolean(s.restored && invention), plotLevel, plants,
      essence:bounded(s.essence,100000),houseLevel:bounded(s.houseLevel,3),aura:bounded(s.aura,3),
      projects:Array.isArray(s.projects)?[...new Set<Project>(s.projects.filter((id:unknown)=>typeof id==='string'&&Object.hasOwn(projects,id)))]:[],
      hybrids:s.hybrids===true,lastGatherAt:typeof s.lastGatherAt==='number'&&Number.isFinite(s.lastGatherAt)&&s.lastGatherAt>=0?s.lastGatherAt:null,
      worldSeed:Math.max(1,bounded(s.worldSeed,2147483647)),gorHair:hairColors.includes(s.gorHair)?s.gorHair:'white',angelHair:hairColors.includes(s.angelHair)?s.angelHair:'black',gorOutfit:outfits.includes(s.gorOutfit)?s.gorOutfit:'classic',angelOutfit:outfits.includes(s.angelOutfit)?s.angelOutfit:'classic',regionLevels:Object.fromEntries(districtIds.map(id=>[id,bounded(s.regionLevels?.[id],20)])) as Record<District,number>,
      decorations:decodeDecorations(s),
      visited:Array.isArray(s.visited)?[...new Set<District>(['garden',...s.visited.filter((id:unknown)=>districtIds.includes(id as District))])]:['garden']
    };
  } catch { return initialState(); }
}
export function collect(s: State, r: Resource): State { return s.collected.includes(r) ? s : { ...s, collected: [...s.collected, r] }; }
export function craft(s: State, invention: Invention): State { return s.collected.length === 3 && !s.invention ? { ...s, invention } : s; }
export function restore(s: State): State { return s.invention && !s.restored ? { ...s, restored: true } : s; }

export const species = {
  moonflower: { name: 'گل ماه', minutes: 6, color: '#dad0f3' },
  sunblossom: { name: 'گل آفتاب', minutes: 10, color: '#f7ca75' },
  spiritfern: { name: 'سرخس روح', minutes: 15, color: '#91dac3' },
  starlily: { name: 'سوسن ستاره', minutes: 12, color: '#f0a6bf' },
} as const;
export type Species = keyof typeof species;
export interface Plant { id: string; species: Species; col: number; row: number; plantedAt: number; boostMs: number; lastWaterAt: number; lastHarvestAt: number | null }
export const stageNames = ['بذر', 'جوانه', 'بوته', 'شکوفه'] as const;
export function gridSize(level: number) { return 2 + level * 2; }
export function cellUnlocked(level: number, col: number, row: number) { const min = 4 - gridSize(level) / 2; return Number.isInteger(col) && Number.isInteger(row) && col >= min && row >= min && col < 8-min && row < 8-min; }
export function growthStage(p: Plant, now = Date.now()): number { const progress = Math.max(0, now-p.plantedAt) + p.boostMs; return Math.min(3, Math.floor(progress / (species[p.species].minutes*60000/3))); }
export function growRemaining(p: Plant, now = Date.now()) { return Math.max(0, species[p.species].minutes*60000 - Math.max(0,now-p.plantedAt) - p.boostMs); }
export function plantAt(s: State, kind: Species, col: number, row: number, now: number, id: string): State {
  if (!species[kind] || kind==='starlily'&&!s.hybrids || !cellUnlocked(s.plotLevel,col,row) || s.plants.some(p=>p.col===col&&p.row===row||p.id===id) || !Number.isFinite(now) || now<0) return s;
  return {...s,plants:[...s.plants,{id,species:kind,col,row,plantedAt:now,boostMs:0,lastWaterAt:0,lastHarvestAt:null}]};
}
export function movePlant(s: State, id: string, col: number, row: number): State {
  if(!cellUnlocked(s.plotLevel,col,row)||s.plants.some(p=>p.col===col&&p.row===row))return s;
  const p=s.plants.find(p=>p.id===id);if(!p)return s;
  return {...s,plants:s.plants.map(p=>p.id===id?{...p,col,row}:p)};
}
export function waterPlant(s: State,id:string,now=Date.now()):State {
 const p=s.plants.find(p=>p.id===id);if(!p||growthStage(p,now)===3||now<p.plantedAt||p.boostMs>0&&now-p.lastWaterAt<180000)return s;
 return {...s,plants:s.plants.map(p=>p.id===id?{...p,lastWaterAt:now,boostMs:p.boostMs+species[p.species].minutes*15000}:p)};
}
export function expansionRequirement(level:number){return [0,2,6,12,20][level]??Infinity;}
export function expandPlot(s:State,now=Date.now()):State {
 if(s.plotLevel>=5||s.plants.filter(p=>growthStage(p,now)===3).length<expansionRequirement(s.plotLevel))return s;
 return {...s,plotLevel:s.plotLevel+1};
}
export function storageKey(profile: string | null) { return profile ? `${SAVE_KEY}:profile:${encodeURIComponent(profile.slice(0,128))}` : SAVE_KEY; }

function bounded(value:unknown,max:number){return typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(max,Math.floor(value)):0;}
export const districtIds=['garden','greenhouse','home','village','grove','sanctuary'] as const;
export type District=typeof districtIds[number];
export const projects={
 bench:{name:'نیمکت عاشقانه',cost:3,district:'garden'},
 pond:{name:'برکهٔ نیلوفر',cost:5,district:'garden'},
 greenhouse:{name:'فعال‌کردن گلخانه',cost:8,district:'greenhouse'},
 lamps:{name:'چراغ‌های میدان',cost:6,district:'village'},
 fountain:{name:'آبنمای مردم',cost:10,district:'village'},
 bridge:{name:'پلِ بیشه',cost:5,district:'grove'},
 butterfly:{name:'پناه پروانه‌های نور',cost:4,district:'garden'},
 seedvault:{name:'خزانهٔ بذرها',cost:5,district:'greenhouse'},
 moonlab:{name:'رصدخانهٔ پیوند',cost:7,district:'greenhouse'},
 library:{name:'کتابخانهٔ خاطره',cost:5,district:'home'},
 skyterrace:{name:'ایوان آسمان',cost:7,district:'home'},
 market:{name:'بازارِ نور',cost:5,district:'village'},
 gathering:{name:'حلقهٔ گردهمایی',cost:7,district:'village'},
 spiritgate:{name:'دروازهٔ درختان روح',cost:5,district:'grove'},
 waterfall:{name:'آبشارِ روح',cost:7,district:'grove'},
 memory:{name:'آینهٔ خاطره',cost:5,district:'sanctuary'},
 constellation:{name:'ستاره‌نگارِ عشق',cost:7,district:'sanctuary'},
} as const;
export type Project=keyof typeof projects;
export function buildProject(s:State,id:Project):State{
 if(!Object.hasOwn(projects,id)||s.projects.includes(id)||s.essence<projects[id].cost)return s;
 return {...s,essence:s.essence-projects[id].cost,projects:[...s.projects,id]};
}
export function harvest(s:State,id:string,now=Date.now()):State{
 const p=s.plants.find(p=>p.id===id);
 if(!p||!Number.isFinite(now)||now<p.plantedAt||growthStage(p,now)<3||p.lastHarvestAt!==null&&now-p.lastHarvestAt<180000)return s;
 return {...s,essence:Math.min(100000,s.essence+2),plants:s.plants.map(p=>p.id===id?{...p,lastHarvestAt:now}:p)};
}
export function gatherLight(s:State,now=Date.now()):State{
 if(!Number.isFinite(now)||now<0||s.lastGatherAt!==null&&now-s.lastGatherAt<60000)return s;
 return {...s,essence:Math.min(100000,s.essence+3),lastGatherAt:now};
}
export function upgradeHouse(s:State):State{
 const cost=[6,12,20][s.houseLevel];if(cost===undefined||s.essence<cost)return s;
 return {...s,essence:s.essence-cost,houseLevel:s.houseLevel+1};
}
export function discoverHybrid(s:State,now=Date.now()):State{
 if(s.hybrids||!s.projects.includes('greenhouse')||s.essence<4||!['moonflower','sunblossom'].every(kind=>s.plants.some(p=>p.species===kind&&growthStage(p,now)===3)))return s;
 return {...s,essence:s.essence-4,hybrids:true};
}
export function awakenAura(s:State):State{
 if(s.aura>=3||s.essence<5)return s;return {...s,essence:s.essence-5,aura:s.aura+1};
}
export function visitDistrict(s:State,id:District):State{
 return !districtIds.includes(id)||s.visited.includes(id)?s:{...s,visited:[...s.visited,id]};
}

export const furnishings={crystal:{name:'بلورِ روح',cost:2},arbor:{name:'طاقِ شکوفه',cost:3},pool:{name:'حوض نور',cost:4},pavilion:{name:'کوشک جادویی',cost:5}} as const;
export type Furnishing=keyof typeof furnishings;
export interface Decoration {district:District;slot:number;kind:Furnishing}
function emptyRegionLevels(){return Object.fromEntries(districtIds.map(id=>[id,0])) as Record<District,number>;}
export function regionRadius(id:District,level:number){return (id==='garden'?26:32)+level*4;}
export function regionSlots(level:number){return 8+level*4;}
export function regionExpansionCost(level:number){return 3+level*3;}
export function expandRegion(s:State,id:District):State{
 if(!districtIds.includes(id)||s.regionLevels[id]>=20)return s;const cost=regionExpansionCost(s.regionLevels[id]);
 if(s.essence<cost)return s;return {...s,essence:s.essence-cost,regionLevels:{...s.regionLevels,[id]:s.regionLevels[id]+1}};
}
export function placeDecoration(s:State,district:District,slot:number,kind:Furnishing):State{
 if(!districtIds.includes(district)||!Object.hasOwn(furnishings,kind)||!Number.isInteger(slot)||slot<0||slot>=regionSlots(s.regionLevels[district])||s.decorations.some(d=>d.district===district&&d.slot===slot)||s.essence<furnishings[kind].cost)return s;
 return {...s,essence:s.essence-furnishings[kind].cost,decorations:[...s.decorations,{district,slot,kind}]};
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
