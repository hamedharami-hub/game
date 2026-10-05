import * as T from 'three';
import { resources, initialState, decodeSave, collect, craft, restore, type Resource, type Invention } from './state';
import './style.css';
import {memoryCards,cardImageStyle} from './cards';
import {directionFrame} from './directions';
import { createGarden } from './garden';
import { storageKey, projects, buildProject, gatherLight, upgradeHouse, discoverHybrid, awakenAura, visitDistrict, growthStage, gridSize, type District, type Project, furnishings, regionSlots, regionRadius, regionExpansionCost, expandRegion, placeDecoration, moveDecoration, removeDecoration, type Furnishing, hairColors, outfits, setAppearance, type HairColor, type Outfit } from './state';
import {lookAssets,diagonalAssets,hairNames,outfitNames} from './appearance';
import { createWorld, districts } from './world';
const gameSaveKey=storageKey(new URLSearchParams(location.search).get('profile'));
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `<main><div id="world" data-direction="0" aria-label="باغ سه‌بعدی دوشاخ‌ها"></div><div id="markers"></div><header><div class="brand">✦ <span>کاروان رؤیاها<small>فصل یک · ریشه‌های نور</small></span></div><div class="header-actions"><span id="essence-count" class="glass" aria-label="نور بازی">✧ ۰</span><button id="camera-view" class="glass" aria-pressed="false">نمای باز</button><button id="open-map" class="glass">نقشه</button><button id="open-garden" class="glass">باغ ما</button><button id="open-build" class="glass">ساخت و گسترش</button><button id="journal" class="glass">دفتر سفر</button></div></header><section class="quest glass"><span class="eyebrow">دنیای دوشاخ‌ها</span><h1>باغ خاموش</h1><p id="objective"></p><div id="inventory"></div><button id="next-step" class="primary">شروع ماجرا</button></section><div class="hint glass">لمس برای حرکت · WASD · اسکرول برای زوم</div><aside class="places glass" aria-label="مقصدهای باغ"><button data-go="gor">گوراستاخ</button><button data-go="seed">بذر نور</button><button data-go="crystal">بلور روح</button><button data-go="feather">پر ابر</button><button data-go="bench">کارگاه</button><button data-go="heart">باغ خاموش</button></aside><section id="district-panel" class="glass" hidden><strong id="district-name"></strong><small id="district-subtitle"></small><button id="district-action">امکانات منطقه</button></section><footer><button id="flight-toggle" aria-pressed="false">✧ پرواز و شناوری</button><span class="status" id="status" role="status" aria-live="polite"></span><button id="interact" class="primary" disabled>به یک مقصد نزدیک شو</button></footer><div id="overlay" hidden></div></main>`;
const $ = <E extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as E;
let state = initialState(); let storageWarning = '';
try { const raw=localStorage.getItem(gameSaveKey);state = decodeSave(raw);if(!raw){const profile=new URLSearchParams(location.search).get('profile');state.worldSeed=profile?[...profile].reduce((h,c)=>(Math.imul(h,31)+c.charCodeAt(0))>>>0,7)%2147483646+1:crypto.getRandomValues(new Uint32Array(1))[0]%2147483646+1;} } catch { storageWarning = 'ذخیرهٔ مرورگر در دسترس نیست؛ این نوبت موقت است.'; }
function save() { try { localStorage.setItem(gameSaveKey, JSON.stringify(state)); } catch { storageWarning = 'ذخیره انجام نشد؛ دسترسی ذخیرهٔ مرورگر را بررسی کن.'; } refresh(); }
const names: Record<Resource,string> = { seed: 'بذر نور', crystal: 'بلور روح', feather: 'پر ابر' };
function refresh() {
 $('essence-count').textContent=`✧ ${state.essence}`;
 $('objective').textContent = state.restored ? 'باغ روشن شد؛ از نقشه، محله‌های تازه را کشف کن.' : state.invention ? 'اختراع را به باغ مشخص‌شده ببر.' : state.collected.length === 3 ? 'سه ماده پیدا شد؛ در کارگاه یکی از دو راه‌حل را بساز.' : 'سه ماده پیدا کن و نور باغ را برگردان.';
 $('inventory').innerHTML = (Object.keys(names) as Resource[]).map(r => `<span class="chip ${state.collected.includes(r) ? 'found' : ''}">${state.collected.includes(r) ? '✓' : '◇'} ${names[r]}</span>`).join('');
 const next=$('next-step');next.textContent=state.restored?'دیدن یادگاری باغ':state.invention?'استفاده از اختراع':state.collected.length===3?'ساخت اختراع':`پیداکردن ${names[resources.find(r=>!state.collected.includes(r))!]}`;
 for(const b of document.querySelectorAll<HTMLButtonElement>('[data-go]')){const done=state.collected.includes(b.dataset.go as Resource);b.disabled=done;b.classList.toggle('done',done);}
 $('status').textContent = storageWarning || (state.invention ? `همراه تو: ${state.invention === 'lantern' ? 'فانوس شناور' : 'جوانهٔ نور'}` : 'پیشرفت روی همین دستگاه ذخیره می‌شود');
}
const overlay = $('overlay');
function closeDialog() { previewCleanup?.();overlay.hidden = true;overlay.replaceChildren();overlay.dataset.region=''; keys.clear(); $('interact').focus(); }
function dialog(title: string, body: string, actions = '', portrait = '') {
 overlay.dataset.region='';previewCleanup?.();target = null; pending = null; keys.clear(); overlay.hidden = false;
 overlay.innerHTML = `<section class="dialog glass" role="dialog" aria-modal="true" aria-labelledby="dialog-title">${portrait ? `<div class="portrait ${portrait}" style="background-image:url('${lookAssets[portrait==='gor'?state.gorOutfit:state.angelOutfit][portrait==='gor'?state.gorHair:state.angelHair]}')" role="img" aria-label="${portrait === 'gor' ? 'گوراستاخ' : 'فرشته'}"></div>` : ''}<span class="eyebrow">${districts[currentDistrict].name}</span><h2 id="dialog-title">${title}</h2><div class="dialog-body">${body}</div><div class="actions">${actions}<button id="close-dialog">ادامهٔ بازی</button></div></section>`;
 $('close-dialog').onclick = closeDialog;
 overlay.querySelector<HTMLButtonElement>('button')?.focus();
 for (const button of overlay.querySelectorAll<HTMLButtonElement>('[data-craft]')) button.onclick = () => {
  const kind = button.dataset.craft as Invention; state = craft(state, kind); save(); updateObjects();
  dialog('اولین اختراع تو', `<div id="creation-view" aria-label="نمای سه‌بعدی اختراع"></div><h3>${kind === 'lantern' ? 'فانوس شناور' : 'جوانهٔ نور'}</h3><p>${kind === 'lantern' ? 'نور روح را میان گل‌ها هدایت می‌کند.' : 'ریشه‌های نور را دوباره به هم پیوند می‌دهد.'}</p><p>حالا آن را به باغ خاموش ببر.</p>`);showCreation(kind);
 };
}
$('journal').onclick = () => {
 dialog('دفتر سفر', `<p>فرشته به انتخاب خودش برای دیدن گوراستاخ به این سرزمین آمده است. فرمانروای دوشاخ‌ها او را به باغی می‌برد که نورش کم شده.</p><ol><li>سه مادهٔ باغ را پیدا کن.</li><li>در کارگاه یک راه‌حل انتخاب کن.</li><li>اختراع را در باغ خاموش به کار ببر.</li></ol><p>این نمونه هنوز به حساب و امتیازهای ارشناز متصل نیست.</p><p>ذخیرهٔ بازی مخصوص همین مرورگر است.</p>`, '<button id="open-album" class="primary">✧ آلبوم شخصیت‌ها</button><button id="reset">شروع دوباره</button>');
 $('open-album').onclick=()=>openAlbum();
 $('reset').onclick = () => { dialog('شروع دوباره؟', '<p>پیشرفت سفر و همهٔ گیاه‌های باغ روی همین دستگاه پاک می‌شوند.</p>', '<button id="confirm-reset">بله، شروع دوباره</button>'); $('confirm-reset').onclick = () => { state = initialState(); save(); updateObjects(); ownGarden.redraw(); currentDistrict='garden';setDistrictUI(); closeDialog(); }; };
};
function openAlbum(actor='all',style='all') {
 const visible=memoryCards.filter(c=>(actor==='all'||c.collection.actor===actor)&&(style==='all'||c.collection.style===style));
 dialog('آلبوم نور',`<p class="album-intro">۲۴ تصویر از فرشته و گوراستاخ · کوچک و بزرگسالانه. کارت را لمس کن تا باز شود.</p><div class="album-filters" aria-label="فیلتر کارت‌ها"><button data-actor="all" aria-pressed="${actor==='all'}">هر دو</button><button data-actor="angel" aria-pressed="${actor==='angel'}">فرشته</button><button data-actor="gor" aria-pressed="${actor==='gor'}">گوراستاخ</button><button data-style="all" aria-pressed="${style==='all'}">همهٔ نماها</button><button data-style="small" aria-pressed="${style==='small'}">کوچک</button><button data-style="adult" aria-pressed="${style==='adult'}">بزرگسالانه</button></div><div class="memory-grid">${visible.map(c=>`<button class="memory-card" data-card="${c.id}" aria-label="${c.collection.name} · ${c.title}"><span class="card-art" style="${cardImageStyle(c)}"></span><strong>${c.title}</strong><small>${c.collection.name}</small></button>`).join('')}</div>`);
 overlay.querySelector('.dialog')?.classList.add('album-dialog');
 for(const b of overlay.querySelectorAll<HTMLButtonElement>('[data-actor]'))b.onclick=()=>openAlbum(b.dataset.actor!,style);
 for(const b of overlay.querySelectorAll<HTMLButtonElement>('[data-style]'))b.onclick=()=>openAlbum(actor,b.dataset.style!);
 for(const b of overlay.querySelectorAll<HTMLButtonElement>('[data-card]'))b.onclick=()=>{
  const card=memoryCards.find(c=>c.id===b.dataset.card)!;const index=visible.indexOf(card);
  function showCard(i:number){const c=visible[(i+visible.length)%visible.length];dialog(c.title,`<div class="card-large card-art" style="${cardImageStyle(c)}" role="img" aria-label="${c.collection.name} · ${c.title}"></div><p class="album-intro">${c.collection.name} · ${(i+visible.length)%visible.length+1} از ${visible.length}</p>`,`<button id="card-previous">قبلی</button><button id="card-next">بعدی</button><button id="album-return">آلبوم</button><a class="card-download" href="${c.collection.image}" download="${c.collection.id}.webp">دریافت مجموعهٔ ۶ تصویر</a>`);overlay.querySelector('.dialog')?.classList.add('card-dialog');$('card-previous').onclick=()=>showCard(i-1);$('card-next').onclick=()=>showCard(i+1);$('album-return').onclick=()=>{openAlbum(actor,style);overlay.querySelector<HTMLButtonElement>(`[data-card="${c.id}"]`)?.focus();};}
  showCard(index);
 };
}
const keys = new Set<string>();
let target: T.Vector3 | null = null; let nearest: Spot | null = null; let pending: Spot | null = null;
type Spot = { id: string; name: string; pos: T.Vector3; object: T.Object3D; action: () => void };
const spots: Spot[] = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const scene = new T.Scene(); scene.background = new T.Color('#b5d8d2'); scene.fog = new T.Fog('#b5d8d2', 30, 75);
const camera = new T.PerspectiveCamera(40, 1, .1, 350);
let renderer: T.WebGLRenderer;
try { renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'low-power' }); }
catch { $('world').innerHTML = '<div class="fallback glass"><h2>نمای سه‌بعدی اجرا نشد</h2><p>WebGL مرورگر را فعال کن یا مرورگر دیگری را امتحان کن. ذخیرهٔ قبلی محفوظ است.</p></div>'; refresh(); throw new Error('WebGL unavailable'); }
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true;renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.outputColorSpace = T.SRGBColorSpace;
$('world').append(renderer.domElement); renderer.domElement.setAttribute('aria-label','زمین باغ؛ برای حرکت کلیک کن');
scene.add(new T.HemisphereLight(0xfff5d9, 0x55796d, 2.4));
const sun = new T.DirectionalLight(0xffeed0, 3); sun.position.set(-7, 18, 8); sun.castShadow = true; sun.shadow.mapSize.set(512,512); Object.assign(sun.shadow.camera,{ left:-14,right:14,top:14,bottom:-14 }); scene.add(sun);
const material = (color: T.ColorRepresentation, glow = false) => new T.MeshStandardMaterial({ color, roughness:.7, ...(glow ? { emissive:color, emissiveIntensity:.6 } : {}) });
const ivory=material('#fff2d8'), gold=material('#d8b96b'), white=material('#fffdf2'), black=material('#202e32'), leaf=material('#6d9e83'), bark=material('#dacbb0');
function mesh(geo:T.BufferGeometry, mat:T.Material, x:number,y:number,z:number, parent:T.Object3D=scene) { const m=new T.Mesh(geo,mat); m.position.set(x,y,z); m.castShadow=true; m.receiveShadow=true; parent.add(m); return m; }
function sphere(r:number, mat:T.Material,x:number,y:number,z:number,parent:T.Object3D=scene) { return mesh(new T.SphereGeometry(r,16,12),mat,x,y,z,parent); }
function cylinder(r:number,h:number,mat:T.Material,x:number,y:number,z:number,parent:T.Object3D=scene) { return mesh(new T.CylinderGeometry(r,r,h,32),mat,x,y,z,parent); }
const districtWorld=createWorld(scene);
let randomSeed=71;function random(){randomSeed=(randomSeed*1664525+1013904223)>>>0;return randomSeed/4294967296;}
const rock=material('#a5b09a');
for(let i=0;i<46;i++){const a=i/46*Math.PI*2;const r=17.5+random()*.6;const stone=sphere(.45+random()*.5,rock,Math.cos(a)*r,-.3,Math.sin(a)*r*.86);stone.scale.y=1.2;}
// Woodland undergrowth and a winding spiritual stream.
for(let i=0;i<30;i++){const z=-12+i*.85,x=-9+Math.sin(i*.23)*1.6;cylinder(.8,.05,material('#72b8b3'),x,.01,z);}
const petalMaterials=[material('#e9c5dd'),material('#f1d791'),material('#bfdbd5')];
for(let i=0;i<22;i++){const a=random()*Math.PI*2,r=8+random()*8;const x=Math.cos(a)*r,z=Math.sin(a)*r*.83;if(x>-6&&x<2&&z>5&&z<13)continue;
 const bush=sphere(.22+random()*.25,leaf,x,.18,z);bush.scale.y=.65;bush.castShadow=false;
 if(i%3===0)for(let j=0;j<3;j++){const f=sphere(.09,petalMaterials[i%3],x+(random()-.5)*.5,.35,z+(random()-.5)*.5);f.castShadow=false;}
}
for(let i=0;i<4;i++){const a=i/4*Math.PI*2;const x=Math.cos(a)*15,z=Math.sin(a)*13;if(z>0)continue;if(x>-6&&x<2&&z>5&&z<13)continue;
 cylinder(.22,3.8,bark,x,1.9,z);const crown=sphere(1.5,material(i%2?'#8fb18e':'#75977c'),x,4.4,z);crown.scale.set(1,1.2,1);
}
// A small dwelling makes the clearing feel inhabited.
const home=new T.Group();home.position.set(-3,0,-10);scene.add(home);
home.visible=false;
const wall=mesh(new T.CylinderGeometry(1.5,1.7,2.6,24),ivory,0,1.3,0,home);wall.castShadow=true;
mesh(new T.ConeGeometry(2.1,1.7,24),leaf,0,3.25,0,home);
mesh(new T.BoxGeometry(.65,1.5,.08),bark,0,.75,1.63,home);
for(const x of [-.8,.8])sphere(.2,material('#ffd490',true),x,1.6,1.45,home);
// A luminous water garden with paths and a small workshop.
cylinder(2.3,.08,material('#74c9c4',true),0,.02,-2); const rim=mesh(new T.TorusGeometry(2.5,.15,8,64),ivory,0,.1,-2); rim.rotation.x=Math.PI/2;
for(let i=0;i<15;i++) { const z=7-i*.7; const tile=mesh(new T.BoxGeometry(1.45,.1,.55),ivory,1+Math.sin(i*.35)*.65,.04,z); tile.rotation.y=Math.sin(i)*.08; }
for(const [x,z] of [[-8,-5],[7,-6]]){
 cylinder(.3,3.2,bark,x,1.6,z); const crown=sphere(1.8,leaf,x,3.8,z); crown.scale.y=.65; sphere(1.2,material('#9dbfa0'),x-.9,3.6,z+.3);
 for(let i=0;i<4;i++) sphere(.1,material('#f4dc8b',true),x+Math.sin(i*2)*1.2,3.6+Math.cos(i),z+Math.cos(i*2));
}
const bench=new T.Group(); bench.position.set(-5,0,2); scene.add(bench); mesh(new T.BoxGeometry(2,.2,1.3),bark,0,1,0,bench); for(const x of [-.8,.8])for(const z of [-.45,.45])cylinder(.08,1,ivory,x,.5,z,bench);
sphere(.25,material('#a7e6dc',true),0,1.35,0,bench);
for(const x of [-1.6,1.6]) { cylinder(.12,3.5,ivory,x-5,1.75,2); }
mesh(new T.ConeGeometry(2.2,.9,4),material('#e0d6be'),-5,3.7,2).rotation.y=Math.PI/4;
// Illustrated directional characters preserve the approved faces in a 3D environment.
const visualActors:T.Group[]=[];
const atlasCache=new Map<string,T.Texture>();
function selectedAtlas(isAngel:boolean,diagonal=false){
 const hair=isAngel?state.angelHair:state.gorHair,outfit=isAngel?state.angelOutfit:state.gorOutfit,url=(diagonal?diagonalAssets:lookAssets)[outfit][hair];
 let atlas=atlasCache.get(url);if(!atlas){atlas=new T.TextureLoader().load(url,loaded=>{for(const actor of visualActors){for(const tex of [actor.userData.texture,actor.userData.ghostTexture] as T.Texture[]){if(tex?.source===loaded.source)tex.needsUpdate=true;}}});atlas.colorSpace=T.SRGBColorSpace;atlasCache.set(url,atlas);}return atlas;
}
function character(isAngel:boolean){
 const group=new T.Group(); const tex=selectedAtlas(isAngel).clone(); tex.needsUpdate=true; tex.repeat.set(.25,.5); tex.offset.set(0,isAngel?.5:0);
 const sprite=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,alphaTest:.03,depthWrite:false}));
 sprite.scale.set(3,3,1);sprite.position.y=1.53;group.add(sprite);group.userData.texture=tex;group.userData.angel=isAngel;group.userData.direction=new T.Vector3(0,0,1);
 const shadow=mesh(new T.CircleGeometry(.45,32),new T.MeshBasicMaterial({color:'#203f3d',transparent:true,opacity:.17,depthWrite:false}),0,.03,0,group);shadow.rotation.x=-Math.PI/2;shadow.castShadow=false;
 const ghostTexture=tex.clone();const ghost=new T.Sprite(new T.SpriteMaterial({map:ghostTexture,transparent:true,opacity:0,alphaTest:.03,depthWrite:false}));ghost.scale.copy(sprite.scale);ghost.position.copy(sprite.position);group.add(ghost);group.userData.ghost=ghost;group.userData.ghostTexture=ghostTexture;group.userData.sprite=sprite;group.userData.sector=0;group.userData.fade=1;sprite.renderOrder=2;ghost.renderOrder=1;
 selectedAtlas(isAngel,true);visualActors.push(group);return group;
}
function faceDirection(group:T.Group, direction:T.Vector3){
 group.userData.direction.copy(direction);
 // Use projected movement relative to the camera, so left/right sprites match screen motion.
 const right=new T.Vector3().setFromMatrixColumn(camera.matrixWorld,0); const forward=camera.position.clone().sub(cameraFocus).setY(0).normalize();
 const x=direction.dot(right),z=direction.dot(forward),frame=directionFrame(x,z,group.userData.angel);
 if(frame.sector===group.userData.sector)return;
 const texture=group.userData.texture as T.Texture,ghostTexture=group.userData.ghostTexture as T.Texture;
 ghostTexture.source=texture.source;ghostTexture.offset.copy(texture.offset);ghostTexture.needsUpdate=true;
 texture.source=selectedAtlas(group.userData.angel,frame.diagonal).source;texture.offset.x=frame.column*.25;texture.needsUpdate=true;
 group.userData.sector=frame.sector;group.userData.fade=reducedMotion?1:0;
 if(group.userData.angel)$('world').dataset.direction=String(frame.sector);

}
const angel=character(true);angel.position.set(2,0,7);scene.add(angel);
const gor=character(false);gor.position.set(3.7,0,5.7);scene.add(gor);
const garden=new T.Group(); garden.position.set(7,0,-4); scene.add(garden);cylinder(3,.12,material('#989d8b'),0,.04,0,garden);
for(const x of [-2,2]){cylinder(.15,2.8,ivory,x,1.4,2.4,garden);sphere(.23,gold,x,2.85,2.4,garden);}
const arch=mesh(new T.TorusGeometry(2,.12,8,40,Math.PI),ivory,0,2.8,2.4,garden);
for(let i=0;i<12;i++){const a=i/12*Math.PI*2;sphere(.23,rock,Math.cos(a)*2.8,.12,Math.sin(a)*2.8,garden);}
cylinder(.17,1.7,bark,0,.9,0,garden);for(const side of [-1,1]){const branch=mesh(new T.CylinderGeometry(.065,.09,1.05,10),bark,side*.3,1.4,0,garden);branch.rotation.z=side*-.55;}
const flowers:T.Mesh[]=[];
for(let i=0;i<16;i++){const a=i/16*Math.PI*2; const x=Math.cos(a)*2,z=Math.sin(a)*2; cylinder(.04,.5,leaf,x,.4,z,garden); const flower=sphere(.23,material('#9a9ba8'),x,.75,z,garden);flowers.push(flower);}
const heart=sphere(.45,material('#74788b'),0,1.2,0,garden); const bloomLight=new T.PointLight('#ffdd94',0,10);bloomLight.position.set(7,2,-4);scene.add(bloomLight);
function addSpot(id:string,name:string,pos:T.Vector3,object:T.Object3D,action:()=>void){object.userData.spot=id;spots.push({id,name,pos,object,action});
 if(id==='gor')return;const label=document.createElement('button');label.className='world-label';label.dataset.marker=id;label.textContent=id==='our-garden'?'باغ ما':id==='heart'?'◇ باغ خاموش':id==='bench'?'کارگاه پیوند':names[id as Resource];label.onclick=()=>visit(id);$('markers').append(label);
}
addSpot('gor','گفتگو با گوراستاخ',gor.position,gor,()=>dialog('گوراستاخ · فرمانروای دوشاخ‌ها','<p>«خوش آمدی. خوشحالم که خودت این راه را انتخاب کردی.»</p><p>«این باغ پیوند نورش را گم کرده. بیا سه ماده پیدا کنیم؛ شاید نگاه تو راه تازه‌ای به ما نشان بدهد.»</p>','', 'gor'));
const resourceObjects = new Map<Resource,T.Object3D>();
for(const [id,x,z,color] of [['seed',-4,-4,'#e9c875'],['crystal',4,4,'#8addda'],['feather',-7,4,'#e1cef4']] as const){
 const g=new T.Group();g.position.set(x,0,z);scene.add(g);cylinder(.45,.15,ivory,0,.1,0,g); const stone=mesh(new T.OctahedronGeometry(.4),material(color,true),0,.7,0,g);resourceObjects.set(id,g);
 addSpot(id,`برداشتن ${names[id]}`,g.position,g,()=>{if(state.collected.includes(id))return;state=collect(state,id);save();updateObjects(); $('status').textContent=`${names[id]} پیدا شد.`;}); stone.userData.float=true;
}
addSpot('bench','ساختن در کارگاه',bench.position,bench,()=>{
 if(state.invention){dialog('کارگاه پیوند','<p>اختراعت آماده است؛ آن را کنار باغ خاموش استفاده کن.</p>');return;}
 const ready=state.collected.length===3;
 dialog('کدام راه را می‌سازی؟',`<p>${ready?'مواد آماده‌اند. انتخاب تو ظاهر باغ را تغییر می‌دهد.':'برای ساختن، بذر نور، بلور روح و پر ابر را پیدا کن.'}</p>`, `<button data-craft="lantern" ${ready?'':'disabled'}>✧ فانوس شناور<br><small>نور طلایی را هدایت کن</small></button><button data-craft="sprout" ${ready?'':'disabled'}>❋ جوانهٔ نور<br><small>پیوند طبیعت را رشد بده</small></button>`);
});
addSpot('heart','روشن‌کردن باغ',garden.position,garden,()=>{
 if(state.restored){dialog('یادگاری باغ','<p>نور این باغ از انتخاب تو آمده است. اختراعت اینجا می‌ماند.</p>');return;}
 if(!state.invention){dialog('باغ خاموش','<p>برای بازگرداندن نور، ابتدا یک اختراع در کارگاه بساز.</p>');return;}
 state=restore(state);save();updateObjects();dialog('باغ دوباره نفس می‌کشد',`${storyArtwork()}<p>${state.invention==='lantern'?'فانوس تو نور را میان گل‌ها پخش می‌کند.':'جوانهٔ تو ریشه‌های نورانی را به گل‌ها پیوند می‌دهد.'}</p><p>گوراستاخ: «تو راه خودت را پیدا کردی. بیا کمی اینجا بمانیم.»</p><p>نخستین خاطرهٔ مشترک در دفتر سفر ثبت شد.</p>`,'');
});
let inventionObject:T.Group|null=null;
function makeInvention(kind:Invention){
 const metal=material('#d8b96b');const g=new T.Group();const glow=material(kind==='lantern'?'#ffdc82':'#83e6b4',true);
 if(kind==='lantern'){
  sphere(.28,glow,0,0,0,g);for(const y of [-.35,.35]){const ring=mesh(new T.TorusGeometry(.33,.045,8,32),metal,0,y,0,g);ring.rotation.x=Math.PI/2;}
  for(let i=0;i<4;i++){const a=i*Math.PI/2;cylinder(.025,.7,metal,Math.cos(a)*.31,0,Math.sin(a)*.31,g);}
  const loop=mesh(new T.TorusGeometry(.12,.025,8,24),metal,0,.5,0,g);
  sphere(.08,glow,0,-.52,0,g);loop.rotation.z=.2;
 }else{
  cylinder(.19,.45,metal,0,-.15,0,g);sphere(.14,glow,0,.38,0,g);
  for(const side of [-1,1]){const l=sphere(.23,glow,side*.24,.15,0,g);l.scale.set(1.3,.42,.65);l.rotation.z=side*.4;}
  const ring=mesh(new T.TorusGeometry(.44,.02,8,40),metal,0,-.05,0,g);ring.rotation.x=Math.PI/2;
 }
 const light=new T.PointLight(kind==='lantern'?'#ffd988':'#9ef0c8',2,4);g.add(light);return g;
}
let previewCleanup:(()=>void)|null=null;
function showCreation(kind:Invention){
 const el=$('creation-view');const preview=new T.WebGLRenderer({alpha:true,antialias:true});preview.setPixelRatio(Math.min(devicePixelRatio,1.5));preview.setSize(el.clientWidth,190);el.append(preview.domElement);
 const mini=new T.Scene();mini.add(new T.HemisphereLight(0xffffff,0x55796d,3));const item=makeInvention(kind);item.scale.setScalar(1.5);mini.add(item);const cam=new T.PerspectiveCamera(35,el.clientWidth/190,.1,20);cam.position.set(0,1,4.3);cam.lookAt(0,0,0);
 preview.setAnimationLoop(()=>{if(!reducedMotion)item.rotation.y+=.008;preview.render(mini,cam);});
 previewCleanup=()=>{preview.setAnimationLoop(null);mini.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});preview.dispose();previewCleanup=null;};
}
function updateObjects(){
 renderer.shadowMap.needsUpdate=true;
 districtWorld.sync(state);
 for(const [id,obj]of resourceObjects)obj.visible=!state.collected.includes(id);
 const color=state.invention==='sprout'?'#93ecc3':'#ffd890';
 flowers.forEach(f=>{const m=f.material as T.MeshStandardMaterial;m.color.set(state.restored?color:'#9a9ba8');m.emissive.set(state.restored?color:'#000000');m.emissiveIntensity=.5;});
 const hm=heart.material as T.MeshStandardMaterial;hm.color.set(state.restored?color:'#74788b');hm.emissive.set(state.restored?color:'#000000');bloomLight.intensity=state.restored?5:0;
 if(inventionObject){inventionObject.parent?.remove(inventionObject);inventionObject.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(o.material as T.Material).dispose();}});inventionObject=null;}
 if(state.invention){inventionObject=makeInvention(state.invention);gardenScene.add(inventionObject);}
}
const ownGarden=createGarden(scene,()=>state,next=>{state=next;save();},()=>{target=null;pending=null;keys.clear();angel.position.set(-1,0,5);gor.position.set(-2.7,0,5);},()=>{keys.clear();},()=>{ownGarden.close();currentDistrict='garden';setDistrictUI();districtDialog();});
const ownGardenAnchor=new T.Group();ownGardenAnchor.position.set(-2,0,6.5);scene.add(ownGardenAnchor);
const gardenScene=new T.Group();gardenScene.name='garden-adventure';
// Individual magical trails and a hover sigil belong to the companions, not the region.
for(const [actor,color] of [[angel,'#ffe5a3'],[gor,'#cfb7ff']] as const){const ring=new T.Mesh(new T.TorusGeometry(.65,.025,6,32),new T.MeshBasicMaterial({color,transparent:true,opacity:.8,depthWrite:false}));ring.rotation.x=Math.PI/2;ring.position.y=.10;actor.add(ring);actor.userData.flightRing=ring;}
const flightWings=new T.Group();angel.add(flightWings);const wingPivots:T.Group[]=[];
for(const side of [-1,1]){const pivot=new T.Group();pivot.position.set(side*.45,1.8,-.08);flightWings.add(pivot);wingPivots.push(pivot);for(let i=0;i<3;i++){const feather=new T.Mesh(new T.CircleGeometry(.48,16),new T.MeshBasicMaterial({color:'#fff1c7',transparent:true,opacity:.3,side:T.DoubleSide,depthWrite:false,blending:T.AdditiveBlending}));feather.position.set(side*(.3+i*.16),i*.14,0);feather.scale.set(1.6,.4,1);feather.rotation.z=side*(.15+i*.15);pivot.add(feather);}}
const shared=new Set<T.Object3D>([angel,gor]);
for(const object of [...scene.children])if((object instanceof T.Mesh||object instanceof T.Group)&&!object.name.startsWith('region-')&&!shared.has(object)){gardenScene.add(object);}
scene.add(gardenScene);
let currentDistrict:District='garden';let airborne=false;
function toggleFlight(){airborne=!airborne;$('flight-toggle').setAttribute('aria-pressed',String(airborne));$('flight-toggle').textContent=airborne?'✧ فرود':'✧ پرواز و شناوری';}
$('flight-toggle').onclick=toggleFlight;
function activateRegion(id:District){districtWorld.activate(id);gardenScene.visible=id==='garden';bloomLight.visible=id==='garden';document.querySelector('main')!.dataset.region=id;renderer.shadowMap.needsUpdate=true;}

function setDistrictUI(){activateRegion(currentDistrict);const d=districts[currentDistrict];$('district-name').textContent=d.name;$('district-subtitle').textContent=d.subtitle;$('district-panel').hidden=currentDistrict==='garden';document.querySelector('main')!.classList.toggle('district-view',currentDistrict!=='garden');}
addSpot('our-garden','ورود به باغ ما',ownGardenAnchor.position,ownGardenAnchor,()=>ownGarden.open());
$('open-garden').onclick=()=>travelTo('garden');
function visit(id:string){const spot=spots.find(s=>s.id===id);if(!spot)return;pending=spot;target=spot.pos.clone();keys.clear();$('status').textContent=`در راه: ${spot.name}`;}
for(const b of document.querySelectorAll<HTMLButtonElement>('[data-go]'))b.onclick=()=>visit(b.dataset.go!);
$('next-step').onclick=()=>{if(state.restored){visit('heart');return;}if(state.invention){visit('heart');return;}const missing=resources.find(r=>!state.collected.includes(r));visit(missing??'bench');};

function travelTo(id:District){
 closeDialog();ownGarden.close();moveSlot=null;currentDistrict=id;const visitedState=visitDistrict(state,id);if(visitedState!==state){state=visitedState;save();}setDistrictUI();target=null;pending=null;keys.clear();
 const d=districts[id];angel.position.set(d.x+1.1,0,d.z+5);gor.position.set(d.x-1,0,d.z+5);cameraFocus.set(d.x,0,d.z+3);zoom=1;
 $('status').textContent=`رسیدی به ${d.name}`;if(id==='garden')ownGarden.open();
}
function openMap(){
 ownGarden.close();
 const visited=state.visited.length;
 dialog('سرزمین دوشاخ‌ها',`<p class="map-caption">${visited} از ۶ ناحیه دیده شده · همهٔ مقصدها قابل بازدیدند</p><svg class="region-diagram" viewBox="0 0 280 210" role="img" aria-label="نقشهٔ موقعیت شش منطقه"><ellipse cx="140" cy="104" rx="128" ry="95" fill="#e1e7d0"/>${Object.values(districts).map(d=>`<path d="M140 104 L${140+d.x*2.7} ${104+d.z*2.7}" stroke="#f8f1de" stroke-width="6"/>`).join('')}${Object.entries(districts).map(([id,d])=>`<circle cx="${140+d.x*2.7}" cy="${104+d.z*2.7}" r="${currentDistrict===id?14:10}" fill="${d.color}" stroke="${currentDistrict===id?'#406251':'#ffffff'}" stroke-width="2"/><text x="${140+d.x*2.7}" y="${108+d.z*2.7}" text-anchor="middle" font-size="12" fill="#395a4b">${d.icon}</text>`).join('')}</svg><div class="world-map">${Object.entries(districts).map(([id,d])=>`<button class="map-place" data-travel="${id}" style="--district-color:${d.color}"><span>${d.icon}</span><strong>${d.name}</strong><small>${d.subtitle}</small><em>${currentDistrict===id?'اینجا هستی':state.visited.includes(id as District)?'دیده شده':'کشف تازه'}</em></button>`).join('')}</div><p class="map-caption">انتخاب مقصد = سفر سریع. برای شروع، از چشمهٔ بیشه نور جمع کن. روی زمین هم می‌توانی راه بروی.</p>`);
 for(const button of overlay.querySelectorAll<HTMLButtonElement>('[data-travel]'))button.onclick=()=>travelTo(button.dataset.travel as District);
}
let selectedFurnishing:Furnishing='crystal',moveSlot:number|null=null;
function applyHair(){for(const actor of visualActors){const texture=actor.userData.texture as T.Texture;texture.source=selectedAtlas(actor.userData.angel,actor.userData.sector%2===1).source;texture.needsUpdate=true;actor.userData.fade=1;(actor.userData.ghost as T.Sprite).material.opacity=0;selectedAtlas(actor.userData.angel,actor.userData.sector%2!==1);}}
function wardrobe(who:'angel'|'gor'){
 const hair=who==='angel'?state.angelHair:state.gorHair,outfit=who==='angel'?state.angelOutfit:state.gorOutfit;
 return `<section class="hair-choices"><h3>${who==='angel'?'فرشته':'گوراستاخ'}</h3><div class="hair-options">${hairColors.map(h=>`<button ${who==='gor'?'data-hair':'data-angel-hair'}="${h}" aria-pressed="${hair===h}"><span class="look-preview ${who}" style="background-image:url('${lookAssets[outfit][h]}')"></span>${hairNames[h]}</button>`).join('')}</div><div class="outfit-options">${outfits.map(o=>`<button data-${who}-outfit="${o}" aria-pressed="${outfit===o}">${outfitNames[o]}</button>`).join('')}</div></section>`;
}
function districtDialog(){
 const d=districts[currentDistrict],kind=currentDistrict;
 let actions='';
 if(kind==='garden')actions+='<button id="manage-garden" class="primary">کاشت و چیدمان</button>';
 if(kind==='grove'){
  const seconds=state.lastGatherAt===null?0:Math.max(0,Math.ceil((60000-Date.now()+state.lastGatherAt)/1000));
  actions+=`<button id="gather-light" ${seconds?'disabled':''}>جمع‌کردن نور +۳${seconds?` · ${seconds} ثانیه دیگر`:''}</button>`;
 }
 if(kind==='home'){const cost=[6,12,20][state.houseLevel];actions+=`<button id="upgrade-house" ${cost===undefined||state.essence<cost?'disabled':''}>${['ساخت آشیانه','گسترش به خانه','ساخت قصر','قصر کامل است'][state.houseLevel]}${cost===undefined?'':` · ${cost} نور`}</button>`;}
 if(kind==='greenhouse'){
  const blooms=['moonflower','sunblossom'].every(k=>state.plants.some(p=>p.species===k&&growthStage(p)===3));
  actions+=`<button id="hybrid-discovery" ${state.hybrids||!state.projects.includes('greenhouse')||!blooms||state.essence<4?'disabled':''}>${state.hybrids?'سوسن ستاره کشف شد':'پیوند ماه + آفتاب · ۴ نور'}</button>`;
 }
 if(kind==='sanctuary')actions+=`<button id="awaken-aura" ${state.aura>=3||state.essence<5?'disabled':''}>${state.aura>=3?'پیوند کامل است':`بیداری حلقهٔ ${state.aura+1} · ۵ نور`}</button>`;
 actions+=Object.entries(projects).filter(([,p])=>p.district===kind).map(([id,p])=>`<button data-project="${id}" ${state.projects.includes(id as Project)||state.essence<p.cost?'disabled':''}>${state.projects.includes(id as Project)?'✓ ':''}${p.name} · ${p.cost} نور</button>`).join('');
 const level=state.regionLevels[kind];
 actions+=`<button id="expand-region" ${level>=20||state.essence<regionExpansionCost(level)?'disabled':''}>${level>=20?'گسترش کامل':`زمین تازه · ${regionExpansionCost(level)} نور`}</button>`;
 const items=state.decorations.filter(d=>d.district===kind);
 const builder=`<section class="builder"><h3>چیدمان ${d.name}</h3><p>هر شماره یک جای واقعی در محیط است؛ نوع سازه را انتخاب کن، سپس جای خالی را بزن. جابه‌جایی رایگان است؛ پاک‌کردن نور را پس نمی‌دهد.</p><div class="furnishing-types">${Object.entries(furnishings).map(([id,f])=>`<button data-furnishing="${id}" aria-pressed="${selectedFurnishing===id}">${f.name} · ${f.cost}✧</button>`).join('')}</div><div class="building-slots">${Array.from({length:regionSlots(level)},(_,slot)=>{const item=items.find(i=>i.slot===slot);return `<button data-slot="${slot}" aria-pressed="${moveSlot===slot}" ${!item&&moveSlot===null&&state.essence<furnishings[selectedFurnishing].cost?'disabled':''}>${slot+1}<small>${item?furnishings[item.kind].name:'جای خالی'}</small></button>`;}).join('')}</div>${moveSlot!==null?`<p>سازهٔ ${moveSlot+1} انتخاب شده؛ یک جای خالی را برای انتقال بزن.</p><button id="cancel-move">لغو جابه‌جایی</button><button id="remove-decoration">پاک‌کردن سازه</button>`:''}<p>گسترش ${level}/۲۰ · قطر زمین ${regionRadius(kind,level)*2} · ${items.length} سازهٔ شخصی</p></section>${wardrobe('angel')}${wardrobe('gor')}`;
 dialog(d.name,`<p>${d.description}</p><div class="region-status"><span>✧ ${state.essence} نور</span><span>${kind==='home'?['زمین آماده','آشیانه','خانه','قصر'][state.houseLevel]:kind==='sanctuary'?`${state.aura}/۳ حلقه روشن`:kind==='greenhouse'?state.hybrids?'گونهٔ چهارم آمادهٔ کاشت':'گل ماه و گل آفتاب باید شکوفا باشند':'پروژه‌ها ظاهر همین منطقه را تغییر می‌دهند'}</span></div>${builder}`,actions);
 overlay.dataset.region=kind;
 function commit(next:typeof state){if(next===state)return;state=next;save();updateObjects();ownGarden.redraw();districtDialog();}
 for(const b of overlay.querySelectorAll<HTMLButtonElement>('[data-furnishing]'))b.onclick=()=>{selectedFurnishing=b.dataset.furnishing as Furnishing;moveSlot=null;districtDialog();};
 for(const b of overlay.querySelectorAll<HTMLButtonElement>('[data-slot]'))b.onclick=()=>{const slot=Number(b.dataset.slot);if(state.decorations.some(d=>d.district===kind&&d.slot===slot)){moveSlot=slot;districtDialog();return;}if(moveSlot!==null){const next=moveDecoration(state,kind,moveSlot,slot);moveSlot=null;commit(next);}else commit(placeDecoration(state,kind,slot,selectedFurnishing));};
 for(const who of ['angel','gor'] as const){
 const hairSelector=who==='gor'?'[data-hair]':'[data-angel-hair]';
 for(const b of overlay.querySelectorAll<HTMLButtonElement>(hairSelector))b.onclick=()=>{const hair=(who==='gor'?b.dataset.hair:b.dataset.angelHair) as HairColor;state=setAppearance(state,who,hair,who==='gor'?state.gorOutfit:state.angelOutfit);applyHair();save();districtDialog();};
 for(const b of overlay.querySelectorAll<HTMLButtonElement>(`[data-${who}-outfit]`))b.onclick=()=>{const outfit=(who==='gor'?b.dataset.gorOutfit:b.dataset.angelOutfit) as Outfit;state=setAppearance(state,who,who==='gor'?state.gorHair:state.angelHair,outfit);applyHair();save();districtDialog();};
 }
 for(const b of overlay.querySelectorAll<HTMLButtonElement>('[data-project]'))b.onclick=()=>commit(buildProject(state,b.dataset.project as Project));
 const bind=(id:string,action:()=>void)=>{const b=document.getElementById(id);if(b)b.onclick=action;};
 bind('expand-region',()=>commit(expandRegion(state,kind)));bind('cancel-move',()=>{moveSlot=null;districtDialog();});bind('remove-decoration',()=>{if(moveSlot===null)return;const next=removeDecoration(state,kind,moveSlot);moveSlot=null;commit(next);});
 bind('gather-light',()=>commit(gatherLight(state)));bind('upgrade-house',()=>commit(upgradeHouse(state)));bind('hybrid-discovery',()=>commit(discoverHybrid(state)));bind('awaken-aura',()=>commit(awakenAura(state)));bind('manage-garden',()=>{closeDialog();ownGarden.open();});
}
$('open-build').onclick=()=>{ownGarden.close();moveSlot=null;districtDialog();};$('open-map').onclick=openMap;$('district-action').onclick=districtDialog;
for(const [id,d]of Object.entries(districts)){
 if(id==='garden')continue;
 const anchor=new T.Group();anchor.position.set(d.x,0,d.z+2);scene.add(anchor);
 addSpot(`district-${id}`,d.name,anchor.position,anchor,()=>{currentDistrict=id as District;state=visitDistrict(state,currentDistrict);save();setDistrictUI();districtDialog();});
 const marker=document.querySelector<HTMLButtonElement>(`[data-marker="district-${id}"]`)!;marker.textContent=d.name;
}


for(const id of Object.keys(districts) as District[]){const root=districtWorld.root(id);const portal=new T.Group();portal.position.set(0,0,14);root.add(portal);const frame=mesh(new T.TorusGeometry(1.6,.12,8,40),material('#bd9de5',true),0,2,0,portal);const veil=mesh(new T.CircleGeometry(1.4,32),new T.MeshBasicMaterial({color:'#b9e6eb',transparent:true,opacity:.38,side:T.DoubleSide,depthWrite:false}),0,2,0,portal);frame.rotation.z=.2;veil.position.z=.04;const d=districts[id];addSpot(`portal-${id}`,'ورود به درگاه',new T.Vector3(d.x,0,d.z+14*root.scale.z),portal,openMap);document.querySelector<HTMLButtonElement>(`[data-marker="portal-${id}"]`)!.textContent='✧ درگاه';}
const raycaster=new T.Raycaster(); const pointer=new T.Vector2(); let pointerStart={x:0,y:0};
renderer.domElement.addEventListener('pointerdown',e=>{pointerStart={x:e.clientX,y:e.clientY};});
renderer.domElement.addEventListener('pointerup',e=>{if(!overlay.hidden||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>12)return;const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);raycaster.setFromCamera(pointer,camera);if(currentDistrict==='garden'&&!ownGarden.editing&&ownGarden.owns(raycaster)){ownGarden.open();ownGarden.hit(raycaster);return;}if(ownGarden.editing){ownGarden.hit(raycaster);return;}const hit=raycaster.intersectObject(districtWorld.ground)[0];const hits=raycaster.intersectObjects(spots.filter(s=>spotActive(s)&&!resourcesCollected(s.id)).map(s=>s.object),true);if(hits.length){let object:T.Object3D|null=hits[0].object;while(object&&!object.userData.spot)object=object.parent;if(object){visit(object.userData.spot);return;}}if(hit){pending=null;target=hit.point.clone();target.y=0;const bound=districtWorld.bounds(),dx=target.x-bound.x,dz=target.z-bound.z,distance=Math.hypot(dx,dz);if(distance>bound.r){target.x=bound.x+dx*bound.r/distance;target.z=bound.z+dz*bound.r/distance;}}});
$('interact').onclick=()=>nearest?.action();
window.addEventListener('keydown',e=>{
 if(!overlay.hidden){if(e.key==='Escape')closeDialog();if(e.key==='Tab'){const buttons=[...overlay.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];const first=buttons[0],last=buttons.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}return;}

 if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d'].includes(e.key)){e.preventDefault();keys.add(e.key);target=null;pending=null;}if(e.key.toLowerCase()==='f')toggleFlight();if(e.key.toLowerCase()==='e'&&!ownGarden.editing)nearest?.action();if(e.key==='Escape'&&ownGarden.editing)ownGarden.close();
});window.addEventListener('keyup',e=>keys.delete(e.key));window.addEventListener('blur',()=>keys.clear());
let wideView=false,viewScale=1;
$('camera-view').onclick=()=>{wideView=!wideView;$('camera-view').setAttribute('aria-pressed',String(wideView));$('camera-view').textContent=wideView?'نمای نزدیک':'نمای باز';document.querySelector('main')!.dataset.camera=wideView?'wide':'close';};
let zoom=1;const cameraFocus=new T.Vector3();
function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();}window.addEventListener('resize',resize);resize();
renderer.domElement.addEventListener('wheel',e=>{e.preventDefault();zoom=T.MathUtils.clamp(zoom+e.deltaY*.0008,.65,1.35);},{passive:false});
const clock=new T.Clock();let elapsed=0,lastRegionUI=0,lastFrame=0;
function animate(){const now=performance.now(),interval=overlay.hidden?1000/30:200;if(now>=lastFrame&&now-lastFrame<interval)return;lastFrame=now;const dt=T.MathUtils.clamp(clock.getDelta(),0,.75);elapsed+=dt;
 if(overlay.hidden&&!ownGarden.editing){let movement=new T.Vector3();if(target){movement.copy(target).sub(angel.position);movement.y=0;if(movement.length()<.2){target=null;movement.set(0,0,0);const arriving=pending;pending=null;arriving?.action();}else movement.normalize();}else {let x=Number(keys.has('d')||keys.has('ArrowRight'))-Number(keys.has('a')||keys.has('ArrowLeft'));let z=Number(keys.has('s')||keys.has('ArrowDown'))-Number(keys.has('w')||keys.has('ArrowUp'));movement.set(x*.84+z*.54,0,z*.84-x*.54).normalize();}
 if(movement.lengthSq()){angel.position.addScaledVector(movement,target?Math.min(dt*4.5,target.clone().setY(angel.position.y).distanceTo(angel.position)):dt*4.5);const bound=districtWorld.bounds(),dx=angel.position.x-bound.x,dz=angel.position.z-bound.z,d=Math.hypot(dx,dz);if(d>bound.r){angel.position.x=bound.x+dx*bound.r/d;angel.position.z=bound.z+dz*bound.r/d;}faceDirection(angel,movement);}
 const diff=angel.position.clone().sub(gor.position);diff.y=0;if(diff.length()>1.8){const step=Math.min(dt*3.8,diff.length()-1.6);gor.position.addScaledVector(diff.normalize(),step);faceDirection(gor,diff);}
 }
 const airTarget=airborne&&!ownGarden.editing?1.7:0;angel.position.y=T.MathUtils.lerp(angel.position.y,airTarget,1-Math.exp(-dt*3));gor.position.y=T.MathUtils.lerp(gor.position.y,airTarget*.6,1-Math.exp(-dt*3));
 for(const [actor,index] of [[angel,0],[gor,1]] as const){const sprite=actor.children[0] as T.Sprite,ghost=actor.userData.ghost as T.Sprite;actor.userData.fade=Math.min(1,actor.userData.fade+dt/.16);sprite.material.opacity=actor.userData.fade;ghost.material.opacity=1-actor.userData.fade;ghost.visible=actor.userData.fade<1;ghost.material.rotation=sprite.material.rotation;if(!reducedMotion)sprite.material.rotation=Math.sin(elapsed*2+index)*.025;const ring=actor.userData.flightRing as T.Mesh;ring.visible=actor.position.y>.1;ring.rotation.z=reducedMotion?0:elapsed*.35;const shadow=actor.children[1];shadow.position.y=.03-actor.position.y;shadow.scale.setScalar(1/(1+actor.position.y*.3));}
 flightWings.visible=angel.position.y>.1;flightWings.quaternion.copy(camera.quaternion);wingPivots.forEach((pivot,i)=>pivot.rotation.z=(i===0?-1:1)*(reducedMotion?.25:.25+Math.sin(elapsed*5)*.24));
 $('flight-toggle').dataset.altitude=angel.position.y.toFixed(2);

 nearest=spots.filter(s=>spotActive(s)&&!(resourcesCollected(s.id))).sort((a,b)=>a.pos.distanceToSquared(new T.Vector3(angel.position.x,0,angel.position.z))-b.pos.distanceToSquared(new T.Vector3(angel.position.x,0,angel.position.z)))[0]??null;
 if(nearest&&Math.hypot(nearest.pos.x-angel.position.x,nearest.pos.z-angel.position.z)>2.2)nearest=null;
 const button=$<HTMLButtonElement>('interact');button.disabled=!nearest;button.textContent=nearest?nearest.name:'به یک مقصد نزدیک شو';
 if(inventionObject){inventionObject.position.copy(state.restored?garden.position:angel.position).add(new T.Vector3(.6,1.8,0));if(!reducedMotion)inventionObject.position.y+=Math.sin(elapsed*2)*.12;}
 districtWorld.tick(elapsed,reducedMotion);
 if(Date.now()<lastRegionUI||Date.now()-lastRegionUI>=1000){lastRegionUI=Date.now();
  if(!overlay.hidden&&overlay.dataset.region){
   const gather=document.getElementById('gather-light') as HTMLButtonElement|null;
   if(gather){const seconds=state.lastGatherAt===null?0:Math.max(0,Math.ceil((60000-Date.now()+state.lastGatherAt)/1000));gather.disabled=seconds>0;gather.textContent=`جمع‌کردن نور +۳${seconds?` · ${seconds} ثانیه دیگر`:''}`;}
   const hybrid=document.getElementById('hybrid-discovery') as HTMLButtonElement|null;
   if(hybrid)hybrid.disabled=state.hybrids||!state.projects.includes('greenhouse')||state.essence<4||!['moonflower','sunblossom'].every(k=>state.plants.some(p=>p.species===k&&growthStage(p)===3));
  }
 }

 ownGarden.tick(Date.now());const desired=ownGarden.editing?ownGarden.focus.clone():angel.position.clone();desired.y=0;cameraFocus.lerp(desired,reducedMotion?1:1-Math.exp(-dt*2));
 if(ownGarden.editing&&innerWidth<700)camera.setViewOffset(innerWidth,innerHeight,0,innerHeight*.18,innerWidth,innerHeight);else if(camera.view?.enabled)camera.clearViewOffset();
 const offset=ownGarden.editing?new T.Vector3(11,16,15).multiplyScalar(Math.max(1,gridSize(state.plotLevel)/8)):innerWidth<700?new T.Vector3(15,21,24):new T.Vector3(14,19,23);viewScale=T.MathUtils.lerp(viewScale,wideView&&!ownGarden.editing?1.75:1,reducedMotion?1:Math.min(1,dt*4));$('camera-view').dataset.scale=viewScale.toFixed(2);camera.position.copy(cameraFocus).add(offset.multiplyScalar(zoom*viewScale));camera.lookAt(cameraFocus);camera.updateMatrixWorld();
 for(const label of document.querySelectorAll<HTMLButtonElement>('[data-marker]')){const spot=spots.find(s=>s.id===label.dataset.marker)!;const hidden=resourcesCollected(spot.id);const screen=spot.pos.clone().add(new T.Vector3(0,spot.id==='heart'?4:1.5,0)).project(camera);label.hidden=!spotActive(spot)||ownGarden.editing||hidden||spot.id===`district-${currentDistrict}`||Math.abs(screen.x)>.94||Math.abs(screen.y)>.85||screen.z>1;label.style.left=`${(screen.x+1)*innerWidth/2}px`;label.style.top=`${(1-screen.y)*innerHeight/2}px`;if(spot.id==='heart')label.textContent=state.restored?'✦ باغ روشن':'◇ باغ خاموش';}
 if(inventionObject&&!reducedMotion)inventionObject.rotation.y=elapsed*.3;
 renderer.render(scene,camera);
}
function spotActive(spot:Spot){return spot.id.startsWith('portal-')?spot.id===`portal-${currentDistrict}`:spot.id.startsWith('district-')?spot.id===`district-${currentDistrict}`:currentDistrict==='garden';}
function resourcesCollected(id:string){return ['seed','crystal','feather'].includes(id)&&state.collected.includes(id as Resource);}
setDistrictUI();refresh();updateObjects();renderer.setAnimationLoop(animate);
function storyArtwork(){return '<figure class="story-art"><img src="/art/story-adults.webp" alt="فرشتهٔ بزرگسال با موی مشکی و گوراستاخ فرمانروا با موی سفید و لباس‌های اصلی"><figcaption>ریشه‌های نور · فرشته و گوراستاخ</figcaption></figure>';}
if(!state.collected.length&&!state.invention)dialog('به باغ خوش آمدی',storyArtwork()+'<p>فرشته برای دیدن گوراستاخ، فرمانروای دوشاخ‌ها، به این دنیا آمده است. امروز با هم نور باغ را برمی‌گردانید.</p><p>برای کاشت، روی خاک باغچه بزن یا «باغ ما» را باز کن؛ گل را انتخاب کن و جای خالی را بزن. برای سفر، نقشه و درگاه‌ها آماده‌اند.</p><p>برای ماجرای باغ خاموش، سه ماده را پیدا کن و در کارگاه یک اختراع بساز.</p>','<button id="start-adventure" class="primary">دیدار با گوراستاخ</button>');
const start=document.getElementById('start-adventure');if(start)start.onclick=()=>{closeDialog();visit('gor');};
