import * as T from 'three';
import { regionRadius, decorationPosition, type State, type District, type Furnishing, projects } from './state';

export const districts:Record<District,{name:string;subtitle:string;description:string;x:number;z:number;color:string;icon:string}>= {
 garden:{name:'باغ مشترک',subtitle:'کاشت و چیدمان آزاد',description:'باغچه را بچین، نور گل‌های شکوفا را جمع کن و زمین را تا ۱۲×۱۲ گسترش بده.',x:-2,z:9,color:'#c6d9a3',icon:'❋'},
 greenhouse:{name:'گلخانهٔ پیوند',subtitle:'ترکیب و کشف گیاه',description:'گل ماه و گل آفتاب را پرورش بده؛ در گلخانه با پیوند آن‌ها سوسن ستاره را کشف کن.',x:20,z:14,color:'#9dd9ca',icon:'✿'},
 home:{name:'خانهٔ ما',subtitle:'از آشیانه تا قصر',description:'با نورهای جمع‌شده آشیانه، خانه و سپس قصر مشترک را بساز. هر ارتقا ظاهر بنا را تغییر می‌دهد.',x:-22,z:-10,color:'#e9c4af',icon:'⌂'},
 village:{name:'میدان دوشاخ‌ها',subtitle:'ساختن برای مردم',description:'چراغ‌های میدان و آبنمای مردم را بساز تا این محله جان بگیرد.',x:24,z:-13,color:'#efd395',icon:'♧'},
 grove:{name:'بیشهٔ روح',subtitle:'جنگل و جویبار نور',description:'از چشمه نور جمع کن؛ پل بیشه را بساز و کنار درخت‌های روح قدم بزن.',x:-21,z:19,color:'#a1bdce',icon:'♤'},
 sanctuary:{name:'نیایشگاه عشق',subtitle:'روح، جادو و پیوند',description:'نور را به حلقه‌های روح بده؛ سه مرحلهٔ بیداری، نیایشگاه را روشن‌تر می‌کند.',x:0,z:-29,color:'#c5b2da',icon:'✧'},
};

/** Shared geometry/materials and instanced woodland keep the extended world affordable. */
export function createWorld(scene:T.Scene){
 const palette=new Map<string,T.MeshStandardMaterial>();
 const mat=(color:string)=>{let m=palette.get(color);if(!m){m=new T.MeshStandardMaterial({color,roughness:.85});palette.set(color,m);}return m;};
 const box=new T.BoxGeometry(1,1,1),ball=new T.SphereGeometry(1,10,8),cyl=new T.CylinderGeometry(1,1,1,12),cone=new T.ConeGeometry(1,1,12);
 function shape(g:T.BufferGeometry,c:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,parent:T.Object3D=scene){const m=new T.Mesh(g,mat(c));m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.receiveShadow=true;parent.add(m);return m;}
 const b=(c:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,p?:T.Object3D)=>shape(box,c,x,y,z,sx,sy,sz,p);
 const orb=(c:string,x:number,y:number,z:number,r:number,p?:T.Object3D)=>shape(ball,c,x,y,z,r,r,r,p);
 const pillar=(c:string,x:number,y:number,z:number,r:number,h:number,p?:T.Object3D)=>shape(cyl,c,x,y,z,r,h,r,p);
 const grass='#a2b68d',ivory='#f4ebd6',stone='#cfccb8',gold='#c5a467',wood='#ad8b6b',purple='#bdacce';
 const land=pillar(grass,0,-.73,0,44,1.3);land.scale.z*=.91;
 // Each district has its own paving, planting and landing spot; paths connect them physically.
 for(const [id,d] of Object.entries(districts)){
  if(id==='garden')continue;
  pillar('#d4d4be',d.x,-.015,d.z,7,.08);
  const from=new T.Vector3(0,0,0),to=new T.Vector3(d.x,0,d.z);
  for(let i=1;i<=14;i++){const point=from.clone().lerp(to,i/15);const tile=b(ivory,point.x,.015,point.z,1.7,.07,.85);tile.rotation.y=Math.atan2(to.x,to.z);}
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2;orb(d.color,d.x+Math.cos(a)*6.5,.3,d.z+Math.sin(a)*6.5,.42);}
 }
 // Broad stream, stepping stones and a bridge in the spirit grove.
 for(let i=0;i<14;i++)pillar('#72b6bf',-26+Math.sin(i*.42)*2,.02,11+i*1.3,1.1,.05);
 const bridge=new T.Group();scene.add(bridge);
 for(let i=0;i<7;i++)b(wood,-24+i*.55,.25,18.5,.48,.16,1.7,bridge);
 for(const z of [17.6,19.4]){b(wood,-22.4,.7,z,4,.12,.12,bridge);for(const x of [-24,-21])pillar(wood,x,.55,z,.07,.8,bridge);}
 const well=new T.Group();well.position.set(-21,0,19);scene.add(well);pillar(stone,0,.15,0,1,.3,well);orb('#b6ecdc',0,1.1,0,.65,well);
 const ring=shape(new T.TorusGeometry(1,.045,6,32),gold,0,1.1,0,1,1,1,well);ring.rotation.x=Math.PI/2;
 // Large greenhouse with translucent panes and recognizable planting tables.
 const glass=new T.MeshStandardMaterial({color:'#c9efe1',transparent:true,opacity:.28,roughness:.3,depthWrite:false});
 for(const x of [17,23])for(const z of [10,15])pillar(ivory,x,1.6,z,.10,3.2);
 b(ivory,20,3.15,12.5,6.3,.16,5.3);
 for(const x of [17,23]){const wall=b('#d4ebda',x,1.6,12.5,.08,3,5);wall.material=glass;}
 const roof=shape(cone,'#8fbab0',20,3.9,12.5,4.5,1.6,3.6);roof.rotation.y=Math.PI/4;
 for(const x of [18.3,21.7]){b(wood,x,.7,12.5,1.4,.16,3.4);for(let i=0;i<3;i++){pillar('#be9980',x,.92,11.4+i,.27,.32);orb('#c2dca7',x,1.2,11.4+i,.24);}}
 const hybrid=new T.Group();hybrid.position.set(20,0,16);scene.add(hybrid);pillar(gold,0,.3,0,.7,.6,hybrid);pillar('#729b73',0,1.2,0,.04,1.5,hybrid);
 for(let i=0;i<7;i++){const a=i/7*Math.PI*2;orb('#eea9c9',Math.cos(a)*.35,2,Math.sin(a)*.35,.25,hybrid);}orb('#fff0a4',0,2.1,0,.2,hybrid);
 const greenhouseLight=new T.Group();scene.add(greenhouseLight);for(const x of [17,23])orb('#ffe1a0',x,3.4,15,.23,greenhouseLight);
 // Three physically distinct stages of the shared home; transparent foundations before construction.
 const houses:T.Group[]=[];
 for(let level=0;level<4;level++){
  const h=new T.Group();h.position.set(-22,0,-12);scene.add(h);houses.push(h);
  if(level===0){b(stone,0,.1,0,5,.2,4,h);for(const x of [-2.2,2.2])pillar(wood,x,1,1,.07,2,h);b('#ede3c1',0,2,1,4.6,.12,1.8,h);continue;}
  b(ivory,0,1.6,0,4.5,3.2,3.4,h);const r=shape(cone,'#937a98',0,3.9,0,3.6,1.7,3.2,h);r.rotation.y=Math.PI/4;
  b(wood,0,1,1.75,.85,2,.1,h);for(const x of [-1.4,1.4])b('#f9d994',x,1.8,1.76,.65,.8,.1,h);
  if(level>=2){for(const x of [-3,3]){pillar(ivory,x,1.65,0,1.15,3.3,h);shape(cone,purple,x,4,0,1.5,1.5,1.5,h);}b(ivory,0,.12,3,7,.24,2,h);}
  if(level===3){for(const x of [-3,3]){pillar(ivory,x,4.2,0,.85,2.4,h);shape(cone,gold,x,5.7,0,1.2,1.4,1.2,h);}pillar(ivory,0,5,-1,1,3,h);shape(cone,purple,0,7,-1,1.6,1.5,1.6,h);orb('#ffe6b4',0,8,-1,.18,h);}
 }
 for(const x of [-26,-18]){pillar(stone,x,.4,-7,.4,.8);orb('#a9b984',x,1,-7,.8);}
 // Village: three small homes, market awnings, residents with upright ivory horns.
 for(const [x,z,color] of [[21,-17,'#ddada4'],[27,-17,'#adbfbd'],[29,-11,'#c8b5ce']] as const){b(ivory,x,1.2,z,2.6,2.4,2.5);const r=shape(cone,color,x,3,z,2.3,1.4,2.1);r.rotation.y=Math.PI/4;b(wood,x,.7,z+1.28,.6,1.4,.08);}
 for(const x of [20,28]){b(wood,x,.7,-10,2,.15,1.1);for(const dx of [-1,1])pillar(ivory,x+dx,1.5,-10,.05,3);b('#e7c595',x,2.7,-10,2.3,.1,1.5);}
 const lamps=new T.Group();scene.add(lamps);for(const [x,z] of [[21,-13],[27,-13],[24,-9]]){pillar(wood,x,1.4,z,.07,2.8,lamps);orb('#fff0b3',x,2.8,z,.28,lamps);}
 const fountain=new T.Group();scene.add(fountain);pillar(ivory,24,.18,-13,1.45,.35,fountain);pillar('#8ecdc5',24,.37,-13,1.2,.08,fountain);pillar(ivory,24,1,-13,.3,1.6,fountain);orb('#bceee5',24,1.9,-13,.3,fountain);
 const iColor=(x:number)=>Math.sin(x)>0?'#e0e7e1':'#e7dff0';
 const residents:T.Group[]=[];
 for(const [x,z] of Array.from({length:14},(_,i)=>[24+Math.sin(i*2.399)*5.2,-13+Math.cos(i*2.399)*5.2])){const person=new T.Group();person.position.set(x,0,z);scene.add(person);residents.push(person);shape(cone,iColor(x),0,.75,0,.36,1.45,.29,person);shape(ball,iColor(x),0,1.2,0,.3,.25,.24,person);shape(ball,ivory,0,1.64,0,.23,.3,.21,person);shape(ball,'#d2d5cf',0,1.78,-.045,.245,.2,.21,person);for(const dx of [-.15,.15]){const horn=shape(cone,ivory,dx,2.03,0,.055,.52,.055,person);horn.rotation.z=-dx*.8;}for(const side of [-1,1]){const arm=shape(cyl,ivory,side*.28,1.12,0,.075,.65,.075,person);arm.rotation.z=side*.22;}const collar=shape(new T.TorusGeometry(.2,.025,5,12),gold,0,1.36,0,1,1,1,person);collar.rotation.x=Math.PI/2;person.scale.setScalar(.85+Math.abs(Math.sin(x))*.28);}
 // Open-air sanctuary: clear circular floor, six pillars and three levels of soul rings.
 pillar('#c7bfd3',0,.04,-29,4.5,.1);const rings:T.Mesh[]=[];
 for(let i=0;i<6;i++){const a=i/6*Math.PI*2;pillar(ivory,Math.cos(a)*3.8,1.65,-29+Math.sin(a)*3.8,.18,3.3);orb('#e1d1ee',Math.cos(a)*3.8,3.4,-29+Math.sin(a)*3.8,.24);}
 pillar(ivory,0,.6,-29,.9,1.2);orb('#d4c0e7',0,1.7,-29,.6);
 for(let i=0;i<3;i++){const r=shape(new T.TorusGeometry(1.3+i*.38,.055,6,40),gold,0,2.2+i*.6,-29,1,1,1);r.rotation.x=Math.PI/2;rings.push(r);}
 // The raised garden perimeter follows unlocked land; plants never shift when it expands.
 const gardenFrame=new T.Group();gardenFrame.position.set(-2,0,9);scene.add(gardenFrame);
 const frameEdges=[b(wood,0,.18,0,1,.16,.12,gardenFrame),b(wood,0,.18,0,1,.16,.12,gardenFrame),b(wood,0,.18,0,.12,.16,1,gardenFrame),b(wood,0,.18,0,.12,.16,1,gardenFrame)];
 for(const x of [-6,-2,2]){pillar(ivory,x,1.4,17,.07,2.8);orb('#eac0d2',x,2.9,17,.5);}
 b(ivory,-2,2.65,17,8.2,.12,.16);
 for(let i=0;i<9;i++)orb(i%2?'#f3d69c':'#e5c4db',-6+i,.15,17.3,.16);
const gardenBench=new T.Group();scene.add(gardenBench);b(wood,-9.5,.5,11,2,.15,.7,gardenBench);b(wood,-9.5,.95,11.35,2,.7,.12,gardenBench);for(const x of [-10.2,-8.8])b(ivory,x,.25,11,.15,.5,.6,gardenBench);
 const pond=new T.Group();scene.add(pond);pillar(ivory,5.7,.13,12,1.4,.25,pond);pillar('#8ed7c9',5.7,.28,12,1.2,.06,pond);for(let i=0;i<5;i++)orb('#e9c7da',5.7+Math.sin(i*2)*.7,.38,12+Math.cos(i*2)*.7,.14,pond);
 // Regions have individual grounds; distant generic forest is replaced by sparse magical trees.
 const roots={} as Record<District,T.Group>,grounds={} as Record<District,T.Mesh>;
 scene.remove(land);
 const contents=[...scene.children].filter(o=>o instanceof T.Mesh||o instanceof T.Group);
 for(const id of Object.keys(districts) as District[]){const d=districts[id];const root=new T.Group();root.name=`region-${id}`;root.position.set(d.x,0,d.z);roots[id]=root;scene.add(root);}
 for(const object of contents){const center=new T.Box3().setFromObject(object).getCenter(new T.Vector3());const id=(Object.keys(districts) as District[]).sort((a,b)=>Math.hypot(center.x-districts[a].x,center.z-districts[a].z)-Math.hypot(center.x-districts[b].x,center.z-districts[b].z))[0];object.position.x-=districts[id].x;object.position.z-=districts[id].z;roots[id].add(object);}
 const motes={} as Record<District,T.Points>;
 const sigils:T.LineSegments[]=[];
 for(const id of Object.keys(districts) as District[]){
  const root=roots[id],d=districts[id];if(id!=='garden')root.scale.setScalar(1.55);
  grounds[id]=pillar(id==='grove'?'#536b82':id==='sanctuary'?'#81719b':'#8da59a',0,-.7,0,18,.95,root);
  const glowMat=new T.MeshStandardMaterial({color:d.color,emissive:d.color,emissiveIntensity:.7,roughness:.6});
  for(let i=0;i<(id==='grove'?10:5);i++){const angle=id==='garden'?Math.PI+.2+i*.5:i*Math.PI*2/(id==='grove'?10:5)+.3,r=12+(i%3),x=Math.cos(angle)*r,z=Math.sin(angle)*r;const trunk=pillar('#9eafae',x,1.4,z,.13,2.8,root);trunk.rotation.z=Math.sin(i)*.13;const crown=shape(i%3===0?cone:ball,i%2?'#94bdb8':'#b0a6d0',x,3.3,z,1+(i%2)*.4,1.3,.8,root);if(i%3===2)crown.material=glowMat;for(let k=0;k<2;k++)orb(d.color,x+Math.sin(k+i)*.7,3.5+k*.3,z,.13,root);}
  for(let i=0;i<5;i++){const crystal=shape(new T.OctahedronGeometry(.45),d.color,Math.cos(i*1.7)*10,1.1,Math.sin(i*1.7)*10,.8,1.4,.8,root);crystal.material=glowMat;}
  const halo=shape(new T.TorusGeometry(4,.04,6,48),'#efd49a',0,.15,0,1,1,1,root);halo.rotation.x=Math.PI/2;halo.material=glowMat;
  const strokes:number[]=[];for(let i=0;i<10;i++){const a=i/10*Math.PI*2,x=Math.cos(a)*6,z=Math.sin(a)*6;for(const [dx,dz,ex,ez]of [[-.2,0,0,-.4],[0,-.4,.2,0],[-.2,0,.2,0],[0,-.4,0,.3]])strokes.push(x+dx,.2,z+dz,x+ex,.2,z+ez);}const runeGeometry=new T.BufferGeometry();runeGeometry.setAttribute('position',new T.Float32BufferAttribute(strokes,3));const runes=new T.LineSegments(runeGeometry,new T.LineBasicMaterial({color:'#f4dfba',transparent:true,opacity:.9}));root.add(runes);sigils.push(runes);
  const coords=new Float32Array(36*3);for(let i=0;i<36;i++){coords[i*3]=Math.sin(i*2.3)*13;coords[i*3+1]=.7+(i%7)*.6;coords[i*3+2]=Math.cos(i*1.7)*13;}const geom=new T.BufferGeometry();geom.setAttribute('position',new T.BufferAttribute(coords,3));const points=new T.Points(geom,new T.PointsMaterial({color:d.color,size:.09,transparent:true,opacity:.75,depthWrite:false}));root.add(points);motes[id]=points;
 }
 // Personalized building slots and terraces are rebuilt only when saved layout changes.
 const additions={} as Record<District,T.Group>;let layoutSignature='';let saved:State|null=null;
 for(const id of Object.keys(districts) as District[]){const g=new T.Group();g.name='personal-layout';roots[id].add(g);additions[id]=g;}
 function furnishing(kind:Furnishing,x:number,z:number,p:T.Group,color:string){
  pillar(stone,x,.1,z,1.5,.2,p);
  if(kind==='crystal'){const gem=shape(cone,color,x,1.5,z,.65,2.6,.65,p);gem.material=mat(color);const r=shape(new T.TorusGeometry(.9,.05,6,20),gold,x,1.2,z,1,1,1,p);r.rotation.x=Math.PI/2;}
  if(kind==='pool'){pillar('#85cdc9',x,.23,z,1.25,.08,p);for(let i=0;i<5;i++)orb(color,x+Math.sin(i*1.3),.4,z+Math.cos(i*1.3),.16,p);}
  if(kind==='arbor'){for(const side of [-1,1])pillar(ivory,x+side,1.4,z,.12,2.8,p);const arch=shape(new T.TorusGeometry(1,.1,6,20,Math.PI),gold,x,2.8,z,1,1,1,p);for(let i=0;i<5;i++)orb(color,x+Math.cos(i*.7),2.8+Math.sin(i*.7),z,.22,p);}
  if(kind==='pavilion'){for(const dx of [-1,1])for(const dz of [-1,1])pillar(ivory,x+dx,1.5,z+dz,.12,3,p);shape(cone,color,x,3.6,z,2.1,1.4,2.1,p);orb('#ffecb5',x,2.6,z,.3,p);}
 }
 function rebuild(s:State){
  const signature=JSON.stringify([s.regionLevels,s.decorations,s.worldSeed,s.projects]);if(signature===layoutSignature)return;layoutSignature=signature;saved=s;
  for(const id of Object.keys(districts) as District[]){const g=additions[id];for(const child of [...g.children]){if(child instanceof T.InstancedMesh)child.dispose();g.remove(child);child.traverse(o=>{if(o instanceof T.Mesh&&! [box,ball,cyl,cone].includes(o.geometry))o.geometry.dispose();});}
   const scale=roots[id].scale.x,r=regionRadius(id,s.regionLevels[id])/scale;grounds[id].scale.x=grounds[id].scale.z=r;
   // New land is visibly edged with an illuminated perimeter, and expansion adds terraces.
   const edge=shape(new T.TorusGeometry(r-.3,.08,5,96),districts[id].color,0,-.15,0,1,1,1,g);edge.rotation.x=Math.PI/2;
   for(let tier=0;tier<s.regionLevels[id];tier++){const a=tier*2.4+(s.worldSeed%100)*.04,rr=(regionRadius(id,tier)+2)/scale;const x=Math.cos(a)*rr,z=Math.sin(a)*rr;pillar(districts[id].color,x,-.1,z,2.8,.22,g);furnishing(tier%2?'arbor':'crystal',x,z,g,districts[id].color);}
   for(let i=0;i<8;i++){const a=i*Math.PI/4+(s.worldSeed%100)*.02,rr=(id==='garden'?24:29)/scale;const x=Math.cos(a)*rr,z=Math.sin(a)*rr;shape(ball,id==='grove'?'#748fa8':'#b9cbc0',x,.1,z,2.2,.35,1.4,g);orb(districts[id].color,x,.65,z,.2,g);}
   const blades=new T.InstancedMesh(cone,mat(id==='grove'?'#668d95':'#7d9c89'),160);const dummy=new T.Object3D();
   for(let i=0;i<160;i++){const a=i*2.399+(s.worldSeed%997)*.01,rr=(10+(i%13)*1.1)/scale;dummy.position.set(Math.cos(a)*rr,.15,Math.sin(a)*rr);dummy.scale.set(.09,.15+(i%4)*.04,.09);dummy.rotation.set(0,a,.1);dummy.updateMatrix();blades.setMatrixAt(i,dummy.matrix);}g.add(blades);
   for(const item of s.decorations.filter(d=>d.district===id)){const p=decorationPosition(id,item.slot,s.worldSeed);furnishing(item.kind,p.x/scale,p.z/scale,g,districts[id].color);}
   const extras=['butterfly','seedvault','moonlab','library','skyterrace','market','gathering','spiritgate','waterfall','memory','constellation'] as const;
   for(const project of extras.filter(key=>s.projects.includes(key)&&projects[key].district===id)){
    const n=extras.indexOf(project),x=(n%2?-8:8),z=-10;
    const group=new T.Group();group.name=project;g.add(group);
    if(['waterfall','memory'].includes(project)){pillar(ivory,x,1.7,z,.6,3.4,group);const water=shape(ball,'#97e3df',x,1.8,z+.35,.8,1.8,.15,group);water.material=new T.MeshStandardMaterial({color:'#97e3df',emissive:'#67c7cd',emissiveIntensity:.4,transparent:true,opacity:.7});pillar('#7fcbc7',x,.15,z+1,1.6,.1,group);}
    else if(['moonlab','constellation','gathering'].includes(project)){pillar(stone,x,.15,z,2,.3,group);for(let i=0;i<3;i++){const ring=shape(new T.TorusGeometry(1+i*.3,.05,6,32),gold,x,2,z,1,1,1,group);ring.rotation.set(i*.8,0,i*.6);}orb(districts[id].color,x,2,z,.4,group);}
    else if(project==='butterfly'){for(let i=0;i<7;i++){const a=i*.9;orb('#f8ddba',x+Math.sin(a)*1.5,1.3+i*.2,z+Math.cos(a)*1.5,.14,group);}}
    else {furnishing(project==='spiritgate'?'arbor':'pavilion',x,z,group,districts[id].color);if(project==='library'||project==='seedvault')for(let i=0;i<6;i++)b(i%2?gold:purple,x-1+i*.35,.7,z+.8,.18,1,.3,group);}
   }
   roots[id].userData.level=s.regionLevels[id];roots[id].userData.decorations=s.decorations.filter(d=>d.district===id).length;
  }
 }
 let active:District='garden';
 function activate(id:District){active=id;for(const key of Object.keys(roots) as District[])roots[key].visible=key===id;scene.background=new T.Color(id==='grove'?'#677a95':id==='sanctuary'?'#85749e':'#a8c7c5');scene.fog=new T.Fog(scene.background,55,180);}
 for(const person of residents)person.userData.origin=person.position.clone();
 activate('garden');
 function sync(s:State){rebuild(s);const half=(2+s.plotLevel*2)/2+.10;frameEdges[0].position.z=-half;frameEdges[1].position.z=half;frameEdges[0].scale.x=frameEdges[1].scale.x=half*2;frameEdges[2].position.x=-half;frameEdges[3].position.x=half;frameEdges[2].scale.z=frameEdges[3].scale.z=half*2;houses.forEach((g,i)=>g.visible=i===s.houseLevel);bridge.visible=s.projects.includes('bridge');lamps.visible=s.projects.includes('lamps');fountain.visible=s.projects.includes('fountain');hybrid.visible=s.hybrids;greenhouseLight.visible=s.projects.includes('greenhouse');gardenBench.visible=s.projects.includes('bench');pond.visible=s.projects.includes('pond');rings.forEach((r,i)=>r.visible=i<s.aura);}
 function tick(time:number,reduced:boolean){if(!reduced){well.rotation.y=time*.15;rings.forEach((r,i)=>r.rotation.z=time*(.1+i*.05));if(active==='village')residents.forEach((r,i)=>{r.position.y=.12+Math.sin(time*1.2+i)*.1;const base=r.userData.origin as T.Vector3;r.position.x=base.x+Math.sin(time*.3+i)*.6;r.position.z=base.z+Math.cos(time*.3+i)*.6;r.rotation.y=time*.08+i;});motes[active].rotation.y=time*.012;}}
 return {sync,tick,activate,get ground(){return grounds[active];},root:(id:District)=>roots[id],bounds:()=>({x:districts[active].x,z:districts[active].z,r:regionRadius(active,saved?.regionLevels[active]??0)-1})};
}
