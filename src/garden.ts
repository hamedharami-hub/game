import * as T from 'three';
import { species, stageNames, gridSize, cellUnlocked, growthStage, growRemaining, plantAt, movePlant, waterPlant, expandPlot, expansionRequirement, harvest, type State, type Species, type Plant } from './state';
export function createGarden(scene:T.Scene,getState:()=>State,change:(s:State)=>void,onOpen:()=>void,onClose:()=>void,onProjects:()=>void){
 const root=new T.Group();root.position.set(-2,.02,9);scene.add(root);root.name='planting-garden';
 const plantRoot=new T.Group();root.add(plantRoot);const cells:T.Mesh[]=[];
 let editing=false,kind:Species='moonflower',tool:'plant'|'move'='plant',selected:string|null=null,lastTick=0,stageSignature='';
 const panel=document.createElement('section');panel.className='garden-panel glass';panel.hidden=true;panel.setAttribute('aria-label','باغ مشترک');document.querySelector('main')!.append(panel);
 const notice=document.createElement('div');notice.className='garden-notice';notice.setAttribute('role','status');
 const make=(geo:T.BufferGeometry,color:string,x:number,y:number,z:number,parent:T.Object3D)=>{const m=new T.Mesh(geo,new T.MeshStandardMaterial({color,roughness:.8}));m.position.set(x,y,z);m.castShadow=false;m.receiveShadow=true;parent.add(m);return m;};
 for(let row=-2;row<10;row++)for(let col=-2;col<10;col++){
  const cell=make(new T.BoxGeometry(.88,.12,.88),'#90775c',col-3.5,.08,row-3.5,root);cell.userData.cell={col,row};cells.push(cell);
 }
 function dispose(group:T.Group){group.traverse(o=>{if(o instanceof T.Mesh){if(o instanceof T.InstancedMesh)o.dispose();o.geometry.dispose();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose());else o.material.dispose();}});group.clear();}
 function renderPlant(p:Plant,now:number){
  const g=new T.Group();g.position.set(p.col-3.5,.17,p.row-3.5);g.userData.plant=p.id;plantRoot.add(g);const stage=growthStage(p,now),color=species[p.species].color;
  const ball=(r:number,c:string,x:number,y:number,z:number)=>make(new T.SphereGeometry(r,12,8),c,x,y,z,g);
  if(stage===0){ball(.10,'#e1be79',0,.08,0);return;}
  const height=[0,.23,.56,.9][stage];make(new T.CylinderGeometry(.025,.04,height,8),'#6b9b6b',0,height/2,0,g);
  for(const side of [-1,1]){const leaf=ball(stage===1?.13:.20,'#7fab75',side*.12,height*.5,0);leaf.scale.set(1.5,.35,.65);leaf.rotation.z=side*.4;}
  if(stage===2){const bud=ball(.13,color,0,height,0);bud.scale.y=1.3;}
  if(stage===3){
   if(p.species==='spiritfern'){for(let i=0;i<5;i++){const frond=ball(.18,color,Math.sin(i*1.3)*.19,.55+i*.1,Math.cos(i*1.3)*.15);frond.scale.set(.45,1.8,.35);}}
   else {for(let i=0;i<6;i++){const a=i/6*Math.PI*2;const petal=ball(.15,color,Math.cos(a)*.19,height,Math.sin(a)*.19);petal.scale.y=.55;}ball(.1,'#fff0b5',0,height+.06,0);}
  }
 }
 function batchPlants(){
  plantRoot.updateMatrixWorld(true);const inverse=new T.Matrix4().copy(plantRoot.matrixWorld).invert();
  const batches=new Map<string,{geometry:T.BufferGeometry;material:T.MeshStandardMaterial;matrices:T.Matrix4[]}>();
  plantRoot.traverse(o=>{if(!(o instanceof T.Mesh))return;const m=o.material as T.MeshStandardMaterial;
   const key=JSON.stringify([o.geometry.type,(o.geometry as T.BufferGeometry & {parameters:unknown}).parameters,m.color.getHex()]);
   let batch=batches.get(key);if(!batch){batch={geometry:o.geometry,material:m,matrices:[]};batches.set(key,batch);}else{o.geometry.dispose();m.dispose();}
   batch.matrices.push(new T.Matrix4().multiplyMatrices(inverse,o.matrixWorld));
  });
  plantRoot.clear();
  for(const batch of batches.values()){const mesh=new T.InstancedMesh(batch.geometry,batch.material,batch.matrices.length);batch.matrices.forEach((matrix,i)=>mesh.setMatrixAt(i,matrix));mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=true;plantRoot.add(mesh);}
 }
 function redraw(now=Date.now()){
  const state=getState();for(const cell of cells){const {col,row}=cell.userData.cell;const unlocked=cellUnlocked(state.plotLevel,col,row);cell.visible=unlocked||editing&&cellUnlocked(Math.min(state.plotLevel+1,5),col,row);const occupied=state.plants.find(p=>p.col===col&&p.row===row);(cell.material as T.MeshStandardMaterial).color.set(!unlocked?'#94a48b':occupied?.id===selected?'#c8a66c':'#8f7659');}
  dispose(plantRoot);for(const p of state.plants)renderPlant(p,now);batchPlants();stageSignature=state.plants.map(p=>`${p.id}:${growthStage(p,now)}:${p.col}:${p.row}`).join('|');
 }
 function selectCell(col:number,row:number){
  const s=getState();if(!cellUnlocked(s.plotLevel,col,row)){notice.textContent='این قسمت هنوز باز نشده؛ باغ را گسترش بده.';return;}
  const existing=s.plants.find(p=>p.col===col&&p.row===row);
  if(existing){selected=existing.id;notice.textContent='گیاه انتخاب شد؛ می‌توانی آن را جابه‌جا یا آبیاری کنی.';}
  else if(tool==='move'){
   if(!selected){notice.textContent='اول گیاهی را انتخاب کن، بعد جای خالی را بزن.';return;}
   const next=movePlant(s,selected,col,row);if(next===s)return;change(next);notice.textContent='جای گیاه عوض شد؛ سن و رشدش حفظ شد.';
  }else {
   const id=typeof crypto.randomUUID==='function'?crypto.randomUUID():`plant-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
   const next=plantAt(s,kind,col,row,Date.now(),id);if(next===s)return;selected=id;change(next);notice.textContent=`${species[kind].name} کاشته شد.`;
  }
  redraw();renderPanel();
 }
 function renderPanel(){
  if(!editing)return;const s=getState(),p=s.plants.find(p=>p.id===selected),now=Date.now(),mature=s.plants.filter(p=>growthStage(p,now)===3).length;
  const seconds=p?Math.ceil(growRemaining(p,now)/1000):0;const waterReady=!!p&&growthStage(p,now)<3&&(p.boostMs===0||now-p.lastWaterAt>=180000);
  const expanded=s.plotLevel===5;const canExpand=!expanded&&mature>=expansionRequirement(s.plotLevel);
  const detailsOpen=!!panel.querySelector('details[open]');const focus=panel.contains(document.activeElement)?(document.activeElement as HTMLElement).id:'';
  panel.innerHTML=`<div class="garden-heading"><strong>باغ ما · ${gridSize(s.plotLevel)}×${gridSize(s.plotLevel)}</strong><button id="garden-close">بازگشت</button></div><div class="garden-tools">${Object.entries(species).filter(([id])=>id!=='starlily'||s.hybrids).map(([id,spec])=>`<button id="species-${id}" data-species="${id}" aria-pressed="${tool==='plant'&&id===kind}">${spec.name}</button>`).join('')}<button id="garden-move" aria-pressed="${tool==='move'}">جابه‌جایی</button></div><div class="plant-info">${p?`${species[p.species].name} · ${stageNames[growthStage(p,now)]}${seconds?` · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} تا شکوفه`:''}`:'جای خالی را برای کاشت انتخاب کن.'}</div><div class="garden-tools"><button id="garden-water" ${waterReady?'':'disabled'}>آبیاری</button><button id="garden-design">تجهیز باغ</button><button id="garden-harvest" disabled>برداشت نور +۲</button><button id="garden-expand" ${canExpand?'':'disabled'}>${expanded?'باغ کامل است':`گسترش به ${gridSize(s.plotLevel+1)}×${gridSize(s.plotLevel+1)}`}</button></div><small>${expanded?'می‌توانی چیدمان را هر زمان تغییر بدهی.':`برای گسترش: ${mature} از ${expansionRequirement(s.plotLevel)} گیاه شکوفا`}</small><details ${detailsOpen?'open':''}><summary>انتخاب دقیق جای کاشت</summary><div class="garden-grid" style="grid-template-columns:repeat(${gridSize(s.plotLevel)},1fr)">${cells.filter(c=>cellUnlocked(s.plotLevel,c.userData.cell.col,c.userData.cell.row)).map(c=>{const {col,row}=c.userData.cell;const plant=s.plants.find(p=>p.col===col&&p.row===row);return `<button id="cell-${col}-${row}" data-col="${col}" data-row="${row}" aria-label="ردیف ${row+1} ستون ${col+1}؛ ${plant?species[plant.species].name:'جای خالی'}">${plant?'❋':'·'}</button>`;}).join('')}</div></details>`;
  panel.append(notice);panel.querySelector<HTMLButtonElement>('#garden-close')!.onclick=close;
  for(const b of panel.querySelectorAll<HTMLButtonElement>('[data-species]'))b.onclick=()=>{kind=b.dataset.species as Species;tool='plant';selected=null;notice.textContent='روی یک جای خالی در باغ بزن.';redraw();renderPanel();};
  panel.querySelector<HTMLButtonElement>('#garden-move')!.onclick=()=>{tool='move';notice.textContent=selected?'حالا جای خالی جدید را انتخاب کن.':'گیاه را انتخاب کن، سپس جای خالی را بزن.';renderPanel();};
  panel.querySelector<HTMLButtonElement>('#garden-water')!.onclick=()=>{if(!selected)return;const next=waterPlant(getState(),selected);if(next!==getState()){change(next);notice.textContent='آبیاری شد؛ رشد سریع‌تر می‌شود. آبیاری بعدی پس از سه دقیقه.';redraw();renderPanel();}};
  panel.querySelector<HTMLButtonElement>('#garden-design')!.onclick=onProjects;
  panel.querySelector<HTMLButtonElement>('#garden-harvest')!.onclick=()=>{if(!selected)return;const next=harvest(getState(),selected);if(next!==getState()){change(next);notice.textContent='دو نور جمع شد؛ گیاه باقی می‌ماند. برداشت بعدی سه دقیقه دیگر.';renderPanel();}};
  panel.querySelector<HTMLButtonElement>('#garden-expand')!.onclick=()=>{const next=expandPlot(getState());if(next!==getState()){change(next);notice.textContent='زمین تازه آمادهٔ کاشت شد.';redraw();renderPanel();}};
  for(const b of panel.querySelectorAll<HTMLButtonElement>('[data-col]'))b.onclick=()=>selectCell(Number(b.dataset.col),Number(b.dataset.row));
  const selectedPlant=s.plants.find(p=>p.id===selected);panel.querySelector<HTMLButtonElement>('#garden-harvest')!.disabled=!selectedPlant||growthStage(selectedPlant,now)<3||(selectedPlant.lastHarvestAt!==null&&now-selectedPlant.lastHarvestAt<180000);
  if(focus)panel.querySelector<HTMLButtonElement>(`#${focus}`)?.focus({preventScroll:true});
 }
 function open(){editing=true;document.querySelector('main')!.classList.add('gardening');panel.hidden=false;tool='plant';selected=null;notice.textContent='۱. یک گل انتخاب کن؛ ۲. روی خانهٔ خاکی بزن. خانه‌های سبز هنوز قفل‌اند.';onOpen();redraw();renderPanel();}
 function close(){editing=false;document.querySelector('main')!.classList.remove('gardening');panel.hidden=true;onClose();redraw();}
 function tick(now:number){if(now>=lastTick&&now-lastTick<1000)return;lastTick=now;const signature=getState().plants.map(p=>`${p.id}:${growthStage(p,now)}:${p.col}:${p.row}`).join('|');if(signature!==stageSignature)redraw(now);if(editing){
 const s=getState(),p=s.plants.find(p=>p.id===selected),mature=s.plants.filter(p=>growthStage(p,now)===3).length,seconds=p?Math.ceil(growRemaining(p,now)/1000):0;
 panel.querySelector('.plant-info')!.textContent=p?`${species[p.species].name} · ${stageNames[growthStage(p,now)]}${seconds?` · ${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} تا شکوفه`:''}`:'جای خالی را برای کاشت انتخاب کن.';
 panel.querySelector<HTMLButtonElement>('#garden-harvest')!.disabled=!p||growthStage(p,now)<3||(p.lastHarvestAt!==null&&now-p.lastHarvestAt<180000);
 panel.querySelector<HTMLButtonElement>('#garden-water')!.disabled=!p||growthStage(p,now)===3||(p.boostMs>0&&now-p.lastWaterAt<180000);
 panel.querySelector<HTMLButtonElement>('#garden-expand')!.disabled=s.plotLevel===5||mature<expansionRequirement(s.plotLevel);
 panel.querySelector('small')!.textContent=s.plotLevel===5?'می‌توانی چیدمان را هر زمان تغییر بدهی.':`برای گسترش: ${mature} از ${expansionRequirement(s.plotLevel)} گیاه شکوفا`;
 }}
 redraw();return {open,close,redraw,tick,get editing(){return editing;},owns:(raycaster:T.Raycaster)=>raycaster.intersectObjects(cells.filter(c=>c.visible),false).length>0,root,focus:new T.Vector3(-2,0,9),hit(raycaster:T.Raycaster){if(!editing)return false;const hit=raycaster.intersectObjects(cells.filter(c=>c.visible),false)[0];if(!hit)return false;selectCell(hit.object.userData.cell.col,hit.object.userData.cell.row);return true;}};
}
