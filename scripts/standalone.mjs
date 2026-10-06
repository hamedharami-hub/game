import { readFileSync, writeFileSync, readdirSync, mkdirSync, copyFileSync } from 'node:fs';
const assets=readdirSync('dist/assets');
const js=assets.find(n=>n.endsWith('.js'));const css=assets.find(n=>n.endsWith('.css'));
if(!js||!css)throw new Error('Build assets missing');
function embed(source){return source.replace(/\/art\/[a-z-]+\.(?:png|webp)/g,path=>`data:image/${path.endsWith('.webp')?'webp':'png'};base64,${readFileSync('public'+path).toString('base64')}`);}
const script=embed(readFileSync('dist/assets/'+js,'utf8')).replace(/<\/script/gi,'<\\/script');
const style=embed(readFileSync('dist/assets/'+css,'utf8'));
writeFileSync('dist/play.html',`<!doctype html><html lang="fa" dir="rtl"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>سرزمین دوشاخ‌ها · بازی مستقل</title><style>${style}</style></head><body><div id="app"></div><script type="module">${script}</script></body></html>`);
console.log('Self-contained playable HTML written: dist/play.html');
try {
  mkdirSync('release', { recursive: true });
  copyFileSync('dist/play.html', 'release/play.html');
  console.log('Playable HTML updated: release/play.html');
} catch (e) {}

// Standalone builds never write outside this repository.
if(process.env.CARAVAN_ARSHNAZ_ROOT){
 const {resolve}=await import('node:path');
 const destination=resolve(process.env.CARAVAN_ARSHNAZ_ROOT,'public/dream-caravan');
 mkdirSync(destination,{recursive:true});copyFileSync('dist/play.html',resolve(destination,'index.html'));
}
