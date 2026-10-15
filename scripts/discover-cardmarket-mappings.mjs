// Proposition de correspondances : ce fichier ne modifie jamais le registre publié.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createHash } from 'node:crypto';
const direct = process.argv.includes('--blueprints');
const read=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const cards=read('public/data/cards.json'),prices=read('public/data/prices.json');
const merchant=read('public/data/cardtrader-catalogue.json');
const dir='.cache/catalogue-audit/merchant-images';fs.mkdirSync(dir,{recursive:true});
const featureFile='.cache/catalogue-audit/image-features.json';
const stored=fs.existsSync(featureFile)?read(featureFile):{};
const byCode=new Map();
for(const b of merchant.blueprints){
 const code = String(b.fixed_properties?.collector_number ?? '').match(/^(?:[A-Z]{1,3}\d{2}-\d{3}|P-\d{3})/i)?.[0]?.toUpperCase();
 const products=direct ? (code ? [{ id:null, code, exp:null, blueprintExpansion:b.expansion_id }] : []) : (b.card_market_ids??[]).map(id=>prices.products[id]).filter(p=>p&&!p.foreign);
 for(const p of products){const a=byCode.get(p.code)??[];a.push({b,p});byCode.set(p.code,a);}
}
async function features(buffer){
 const data=await sharp(buffer).flatten({background:'#fff'}).resize(160,224,{fit:'fill'}).removeAlpha().raw().toBuffer();
 const regions=[[24,35,112,85],[24,80,112,45],[10,15,140,190]];
 const out=[];
 for(const [left,top,width,height] of regions){const d=await sharp(data,{raw:{width:160,height:224,channels:3}}).extract({left,top,width,height}).resize(32,24).blur(.7).raw().toBuffer();out.push(d.toString('base64'));}return out;
}
function distance(a,b){return a.map((base,k)=>{const v=Buffer.from(base,'base64'),w=Buffer.from(b[k],'base64');let sum=0;for(let i=0;i<v.length;i++)sum+=Math.abs(v[i]-w[i]);return sum/v.length;});}
const allowed=(c,p)=>c.series.some(sid=>{const s=cards.series.find(x=>x.id===sid);return direct ? (merchant.expansions.find(e=>e.id===p.blueprintExpansion)?.code?.replaceAll('-','').toUpperCase()===s.code || ['PROMO','AUTRE'].includes(s.code)) : s.cm.includes(p.exp)||['PROMO','AUTRE'].includes(s.code);});
const used=new Map();for(const c of cards.cards)for(const x of byCode.get(c.code)??[])if(allowed(c,x.p))used.set(x.b.id,x.b);
const queue=[...used.values()];let done=0,failed=0;
await Promise.all(Array.from({length:4},async()=>{while(queue.length){const b=queue.shift();try{const file=path.join(dir,b.id+'.jpg');if(!stored['ct'+b.id]){if(!fs.existsSync(file)){if(!b.image_url)throw Error('image absente');const r=await fetch(b.image_url,{signal:AbortSignal.timeout(25000)});if(!r.ok)throw Error('HTTP '+r.status);fs.writeFileSync(file,Buffer.from(await r.arrayBuffer()));}const buffer=fs.readFileSync(file);stored['ct'+b.id]={features:await features(buffer),sha256:createHash('sha256').update(buffer).digest('hex'),url:b.image_url};}}catch(e){failed++;if(failed<15)console.log('Image indisponible',b.id,e.message);}done++;if(done%100===0){fs.writeFileSync(featureFile,JSON.stringify(stored));console.log('Images',done,'/',used.size,'échecs',failed);}}}));
const proposals=[];
for(const c of cards.cards){const file='public/images/cards/'+c.id+'.webp';if(!stored[c.id]){const buffer=fs.readFileSync(file);stored[c.id]={features:await features(buffer),sha256:createHash('sha256').update(buffer).digest('hex')};}const rows=[];for(const {b,p} of byCode.get(c.code)??[]){if(!allowed(c,p)||!stored['ct'+b.id])continue;const d=distance(stored[c.id].features,stored['ct'+b.id].features);rows.push({product:p.id,expansion:p.exp,blueprint:b.id,version:b.version,name:b.name,image:b.image_url,distance:d.map(n=>+n.toFixed(3)),score:+((d[0]+d[2])/2).toFixed(3)});}rows.sort((a,b)=>a.score-b.score);proposals.push({card:c.id,series:c.series,sha256:stored[c.id].sha256,candidates:rows});}
fs.writeFileSync(featureFile,JSON.stringify(stored));fs.writeFileSync(`.cache/catalogue-audit/${direct?'direct':'image'}-proposals.json`,JSON.stringify({updatedAt:new Date().toISOString(),merchantUpdatedAt:merchant.updatedAt,proposals},null,2));console.log('Propositions',proposals.length,'images indisponibles',failed);
