import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
const manifest=JSON.parse(readFileSync('docs/ASSET_MANIFEST.json','utf8'));
const identity=JSON.parse(readFileSync('docs/IDENTITY_REFERENCES.json','utf8'));
const identityIds=new Set();
for(const ref of identity.references){
 if(identityIds.has(ref.id)||!ref.path.startsWith('public/art/reference/')||ref.path.includes('..'))throw new Error('Invalid immutable identity reference');
 identityIds.add(ref.id);checkDigest(ref.path,ref.sha256);
}
for(const id of ['gorastakh-adult-approved','gorastakh-compact-approved','angel-approved','angel-compact-approved','angel-adult-approved']){
 if(!identityIds.has(id))throw new Error(`Missing original facial reference: ${id}`);
}
for(const preserved of identity.preservedArtwork)checkDigest(preserved.path,preserved.sha256);
for(const group of ['assets','diagonalAssets']){
 const assets=manifest[group];if(assets.length!==9)throw new Error(`${group}: expected all nine wardrobe combinations`);
 const combinations=new Set();for(const a of assets){const key=`${a.outfit}/${a.hair}`;if(combinations.has(key))throw new Error(`Duplicate ${group} combination ${key}`);combinations.add(key);check(a);}
}
check(manifest.storyArtwork);
const cards=JSON.parse(readFileSync('docs/CARD_ASSETS.json','utf8'));
if(cards.assets.length!==4||cards.cards!==24)throw new Error('Expected four six-card sheets');
for(const a of cards.assets){check(a);if(a.width/a.height!==1.5)throw new Error('Card sheet must be 3x2 square cells');}
function check(a){
 if(!a.runtime.startsWith('public/art/')||!a.source.startsWith('public/art/')||a.runtime.includes('..')||a.source.includes('..'))throw new Error('Unsafe asset path');
 if(!existsSync(a.source))throw new Error(`Missing artwork source: ${a.source}`);
 const hash=createHash('sha256').update(readFileSync(a.runtime)).digest('hex');if(hash!==a.sha256)throw new Error(`Artwork changed without manifest update: ${a.runtime}`);
 if(!(a.width>0&&a.height>0))throw new Error(`Invalid image dimensions: ${a.runtime}`);
 if(!Array.isArray(a.identityReferences)||!a.identityReferences.length||a.identityReferences.some(id=>!identityIds.has(id)))throw new Error(`Missing approved face provenance: ${a.runtime}`);
}
function checkDigest(path,expected){
 const actual=createHash('sha256').update(readFileSync(path)).digest('hex');
 if(actual!==expected)throw new Error(`Approved original changed: ${path}`);
}
console.log('Verified 18 directional atlases, four card sheets, story artwork and immutable approved facial references.');
