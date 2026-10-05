import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { initialState, collect, craft, restore, decodeSave } from './state.ts';
test('materials cannot be collected twice and incomplete crafting is refused', () => {
 let s = collect(initialState(), 'seed'); assert.equal(collect(s, 'seed'), s); assert.equal(craft(s, 'lantern'), s); assert.equal(restore(s), s);
});
for (const kind of ['lantern', 'sprout'] as const) test(`${kind}: complete journey persists and reward cannot repeat`, () => {
 let s = initialState(); for (const r of ['seed', 'crystal', 'feather'] as const) s = collect(s, r);
 s = craft(s, kind); assert.equal(craft(s, kind === 'lantern' ? 'sprout' : 'lantern'), s);
 s = restore(s); assert.equal(restore(s), s); assert.deepEqual(decodeSave(JSON.stringify(s)), s);
});
test('corrupt or inconsistent saves cannot grant progress', () => {
 for (const raw of ['bad', '{"version":9}', '{"version":1,"collected":["unknown"]}']) assert.deepEqual(decodeSave(raw), initialState());
 const s = decodeSave('{"version":1,"collected":[],"invention":"lantern","restored":true}'); assert.equal(s.restored, false); assert.equal(s.invention, null);
});
import { plantAt, movePlant, growthStage, waterPlant, expandPlot, storageKey } from './state.ts';
test('planting and relocation respect bounds/occupancy and preserve age',()=>{
 let s=plantAt(initialState(),'moonflower',2,2,1000,'p1');assert.equal(s.plants.length,1);
 assert.equal(plantAt(s,'sunblossom',2,2,1000,'p2'),s);assert.equal(plantAt(s,'sunblossom',0,0,1000,'p2'),s);
 s=movePlant(s,'p1',3,4);assert.equal(s.plants[0].plantedAt,1000);assert.equal(s.plants[0].col,3);assert.deepEqual(decodeSave(JSON.stringify(s)),s);
});
test('growth continues offline and water has a cooldown',()=>{
 let s=plantAt(initialState(),'moonflower',2,2,1000,'p1');assert.equal(growthStage(s.plants[0],1000),0);assert.equal(growthStage(s.plants[0],121000),1);assert.equal(growthStage(s.plants[0],361000),3);assert.equal(growthStage(s.plants[0],0),0);
 s=waterPlant(s,'p1',2000);assert.equal(waterPlant(s,'p1',3000),s);assert.equal(s.plants[0].boostMs,90000);
});
test('expansion preserves old plots and extends to twelve cells',()=>{
 let s=initialState();assert.equal(expandPlot(s,999999),s);
 s=plantAt(s,'moonflower',2,2,1000,'p1');s=plantAt(s,'moonflower',3,2,1000,'p2');assert.equal(expandPlot(s,2000),s);s=expandPlot(s,361000);assert.equal(s.plotLevel,2);
 for(let i=0;i<4;i++)s=plantAt(s,'moonflower',1+i,1,1000,`extra${i}`);s=expandPlot(s,361000);assert.equal(s.plotLevel,3);assert.equal(expandPlot(s,999999),s);
 for(let i=0;i<6;i++)s=plantAt(s,'moonflower',i,0,1000,`level4-${i}`);s=expandPlot(s,361000);assert.equal(s.plotLevel,4);assert.equal(plantAt(s,'moonflower',-1,-1,1000,'new-edge').plants.length,13);
 for(let i=0;i<8;i++)s=plantAt(s,'moonflower',i,7,1000,`level5-${i}`);s=expandPlot(s,361000);assert.equal(s.plotLevel,5);assert.equal(expandPlot(s,999999),s);
});
test('save rejects duplicate plants and scopes accounts independently',()=>{
 const s=plantAt(initialState(),'moonflower',2,2,1000,'p1');assert.equal(decodeSave(JSON.stringify({...s,plants:[...s.plants,...s.plants]})).plants.length,1);
 assert.notEqual(storageKey('a'),storageKey('b'));assert.equal(storageKey(null),'dream-caravan:garden:v1');
});

import { harvest, gatherLight, buildProject, upgradeHouse, discoverHybrid, awakenAura, visitDistrict } from './state.ts';
test('light rewards respect cooldowns and flowers stay in the garden',()=>{
 let s=plantAt(initialState(),'moonflower',2,2,1000,'p1');assert.equal(harvest(s,'p1',1000),s);s=harvest(s,'p1',361000);assert.equal(s.essence,2);assert.equal(s.plants.length,1);assert.equal(harvest(s,'p1',361001),s);assert.equal(harvest(s,'p1',300000),s);s=harvest(s,'p1',541000);assert.equal(s.essence,4);
 s=gatherLight(s,0);assert.equal(s.essence,7);assert.equal(gatherLight(s,1),s);s=gatherLight(s,60000);assert.equal(s.essence,10);
});
test('build projects and house upgrades spend only once and never go negative',()=>{
 let s=initialState();assert.equal(buildProject(s,'lamps'),s);s={...s,essence:100};s=buildProject(s,'lamps');assert.equal(s.essence,94);assert.equal(buildProject(s,'lamps'),s);
 for(let i=0;i<3;i++)s=upgradeHouse(s);assert.equal(s.houseLevel,3);assert.equal(s.essence,56);assert.equal(upgradeHouse(s),s);
 for(let i=0;i<3;i++)s=awakenAura(s);assert.equal(s.aura,3);assert.equal(awakenAura(s),s);assert.deepEqual(decodeSave(JSON.stringify(s)),s);
});
test('hybrid discovery needs greenhouse and two mature species',()=>{
 let s={...initialState(),essence:50};assert.equal(discoverHybrid(s,999999),s);assert.equal(plantAt(s,'starlily',2,2,0,'hybrid'),s);
 s=buildProject(s,'greenhouse');s=plantAt(s,'moonflower',2,2,0,'moon');s=plantAt(s,'sunblossom',3,2,0,'sun');assert.equal(discoverHybrid(s,100),s);
 s=discoverHybrid(s,600000);assert.equal(s.hybrids,true);assert.equal(s.essence,38);assert.equal(discoverHybrid(s,600000),s);s=plantAt(s,'starlily',4,2,600000,'star');assert.equal(s.plants.length,3);
 s=visitDistrict(s,'village');assert.equal(visitDistrict(s,'village'),s);assert.deepEqual(decodeSave(JSON.stringify(s)),s);
});
test('old save migrates and malformed world fields are bounded',()=>{
 const old=decodeSave(JSON.stringify({version:1,collected:[],plotLevel:1,plants:[{id:'old',species:'moonflower',col:2,row:2,plantedAt:0,boostMs:0,lastWaterAt:0}]}));assert.equal(old.plants[0].lastHarvestAt,null);assert.equal(old.essence,0);assert.deepEqual(old.visited,['garden']);
 const bad=decodeSave(JSON.stringify({...initialState(),essence:-4,houseLevel:99,aura:Infinity,projects:['lamps','bad','lamps'],visited:['unknown','grove','grove']}));assert.equal(bad.essence,0);assert.equal(bad.houseLevel,3);assert.equal(bad.aura,0);assert.deepEqual(bad.projects,['lamps']);assert.deepEqual(bad.visited,['garden','grove']);
});

import {expandRegion,regionRadius,regionSlots,placeDecoration,moveDecoration,removeDecoration,decorationPosition} from './state.ts';
test('region expansion spends light, preserves layouts and has a bound',()=>{
 let s={...initialState(),essence:100000};s=placeDecoration(s,'garden',0,'arbor');for(let i=0;i<20;i++)s=expandRegion(s,'garden');assert.equal(s.regionLevels.garden,20);assert.equal(s.regionLevels.home,0);assert.equal(s.decorations[0].slot,0);assert.equal(expandRegion(s,'garden'),s);assert.equal(regionSlots(20),88);assert.ok(regionRadius('garden',20)>100);assert.deepEqual(decodeSave(JSON.stringify(s)),s);assert.equal(expandRegion(initialState(),'garden').regionLevels.garden,0);
});
test('personal construction validates capacity and moves without buying twice',()=>{
 let s={...initialState(),essence:30};s=placeDecoration(s,'home',0,'pool');assert.equal(s.essence,26);assert.equal(placeDecoration(s,'home',0,'crystal'),s);assert.equal(placeDecoration(s,'home',8,'crystal'),s);s=moveDecoration(s,'home',0,2);assert.equal(s.essence,26);assert.equal(s.decorations[0].slot,2);assert.equal(moveDecoration(s,'home',2,99),s);const bad=decodeSave(JSON.stringify({...s,decorations:[...s.decorations,...s.decorations,{district:'bad',slot:0,kind:'pool'}]}));assert.equal(bad.decorations.length,1);s=removeDecoration(s,'home',2);assert.equal(s.decorations.length,0);assert.equal(s.essence,26);
});
test('personal seeds change layout while preserving it across reload',()=>{
 assert.notDeepEqual(decorationPosition('village',0,123),decorationPosition('village',0,456));const s={...initialState(),worldSeed:123,gorHair:'brown' as const};assert.deepEqual(decodeSave(JSON.stringify(s)),s);
});

import {setAppearance,hairColors,outfits} from './state.ts';
test('all nine appearances per character persist independently, and old saves migrate',()=>{
 let s=initialState();for(const hair of hairColors)for(const outfit of outfits){s=setAppearance(s,'angel',hair,outfit);assert.equal(s.gorHair,'white');assert.equal(s.gorOutfit,'classic');assert.deepEqual(decodeSave(JSON.stringify(s)),s);}
 s=setAppearance(s,'gor','black','traveler');assert.equal(s.angelHair,'white');assert.equal(s.angelOutfit,'celestial');assert.deepEqual(decodeSave(JSON.stringify(s)),s);
 const old=decodeSave(JSON.stringify({version:1,collected:[],gorHair:'brown'}));assert.equal(old.gorHair,'brown');assert.equal(old.angelHair,'black');assert.equal(old.gorOutfit,'classic');const bad=decodeSave(JSON.stringify({...s,angelHair:'purple',gorOutfit:'invalid'}));assert.equal(bad.angelHair,'black');assert.equal(bad.gorOutfit,'classic');
});

import {directionFrame} from './directions.ts';
test('eight camera-relative directions use cardinal and diagonal art with correct side order',()=>{
 for(let sector=0;sector<8;sector++){const a=sector*Math.PI/4,frame=directionFrame(Math.sin(a),Math.cos(a),true);assert.equal(frame.sector,sector);assert.equal(frame.diagonal,sector%2===1);if(frame.diagonal)assert.equal(frame.column,(sector-1)/2);}
 assert.equal(directionFrame(1,0,true).column,1);assert.equal(directionFrame(1,0,false).column,3);assert.equal(directionFrame(-1,0,false).column,1);
});
