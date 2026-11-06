const {uid}=require('./domain.cjs');
const clone=structuredClone, edit=()=>require('./remix-editor.cjs');
const defaults={enabled:true,target:30,keepPosition:true,mixHook:false};
function options(value={}){const o={...defaults,...value};if(!Number.isFinite(o.target)||o.target<0||o.target>3600)throw Error('Chênh lệch thời lượng phải từ 0 đến 3600 giây.');return o;}
const length=u=>u.empty?0:u.segments.reduce((n,s)=>n+s.target_timerange.duration/1e6,0);
const total=p=>p.editor.blocks.reduce((n,b)=>n+b.units.reduce((n,u)=>n+length(u),0),0)+(p.editor.ending?length(p.editor.ending):0)+(p.settings?.intro?.duration||0);
const spread=values=>values.length?Math.max(...values)-Math.min(...values):0;
async function balance(batch,value={},sources=[]){
 const o=options(value),original=batch.projects,projects=original.filter(p=>!p.installed&&!p.locked).map(p=>clone(p)),origins=new Map();
 for(const s of sources)for(const [bi,b]of s.blocks.entries())for(const [slot,u]of b.units.entries()){const key=u.identity||u.fingerprint;if(!origins.has(key))origins.set(key,[]);origins.get(key).push({block:bi,slot});}
 for(const p of projects){edit().init(p);p.settings??=require('./remix-settings.cjs').effective(p,batch.renderSettings||batch.settings);for(const [bi,b]of p.editor.blocks.entries())for(const [slot,u]of b.units.entries())if(bi>0||o.mixHook)u.balanceOrigins??=clone(origins.get(u.fingerprint)||[{block:bi,slot}]);}
 const before=projects.map(total),times=[...before],initial=projects.map(p=>JSON.stringify(p.editor.blocks.map(b=>b.units.map(u=>u.id))));let swaps=0,moves=0,limited=false;const deadline=Date.now()+5000;
 const legal=(u,bi,slot)=>u.empty||!o.keepPosition||u.balanceOrigins.some(x=>x.slot===slot&&(bi===0?x.block===0:x.block>0&&Math.abs(x.block-bi)<=1));
 const contains=(p,u,except)=>!u.empty&&p.editor.blocks.some(b=>b.units.some(v=>v!==except&&!v.empty&&v.fingerprint===u.fingerprint));
 const validBlocks=blocks=>blocks.every((b,bi)=>bi===0||b.units.every((u,slot)=>legal(u,bi,slot)));
 for(let pass=0;pass<300&&spread(times)>o.target+.001;pass++){
  await new Promise(r=>setImmediate(r));if(Date.now()>deadline){limited=true;break;}let best=null,bestGain=.00001;const oldSpread=spread(times);
  const consider=(i,j,delta,action)=>{const gain=(times[i]-times[j])*delta-delta*delta;if(gain<=bestGain)return;const a=times[i],b=times[j];times[i]-=delta;times[j]+=delta;const range=spread(times);times[i]=a;times[j]=b;if(range>oldSpread+.00001)return;bestGain=gain;best=action;};
  for(let i=0;i<projects.length;i++)for(let j=i+1;j<projects.length;j++){
   if(j%8===0)await new Promise(r=>setImmediate(r));const a=projects[i],b=projects[j];for(let ai=o.mixHook?0:1;ai<a.editor.blocks.length;ai++)for(let bi=ai===0?0:1;bi<b.editor.blocks.length;bi++){
    if((ai===0)!==(bi===0))continue;const ab=a.editor.blocks[ai],bb=b.editor.blocks[bi];for(let slot=0;slot<Math.min(ab.units.length,bb.units.length);slot++){const u=ab.units[slot],v=bb.units[slot];if(u.empty||v.empty||!legal(u,bi,slot)||!legal(v,ai,slot)||contains(a,v,u)||contains(b,u,v))continue;const delta=length(u)-length(v);consider(i,j,delta,()=>{ab.units[slot]=v;bb.units[slot]=u;times[i]-=delta;times[j]+=delta;swaps++;});}
   }
  }
  if(!best)for(let i=0;i<projects.length;i++)for(let j=0;j<projects.length;j++)if(i!==j&&times[i]>times[j]){
   const a=projects[i],b=projects[j];if(a.editor.blocks.length<=2)continue;for(let bi=1;bi<a.editor.blocks.length;bi++){const block=a.editor.blocks[bi],delta=block.units.reduce((n,u)=>n+length(u),0);if(block.units.some(u=>contains(b,u,null)))continue;const left=a.editor.blocks.filter((_,k)=>k!==bi);if(!validBlocks(left))continue;for(let at=1;at<=b.editor.blocks.length;at++){const right=[...b.editor.blocks];right.splice(at,0,block);if(!validBlocks(right))continue;consider(i,j,delta,()=>{a.editor.blocks=left;b.editor.blocks=right;times[i]-=delta;times[j]+=delta;moves++;});}}
  }
  if(!best)break;best();
 }
 const rows=[];let changed=0;
 projects.forEach((p,i)=>{const different=initial[i]!==JSON.stringify(p.editor.blocks.map(b=>b.units.map(u=>u.id)));rows.push({id:p.id,name:p.name,before:before[i],after:times[i],changed:different});if(!different)return;changed++;p.editor.revision++;p.editUndo=[];p.editedAt=new Date().toISOString();p.assignments=[];edit().rebuild(p);const source=batch.sources.find(s=>s.name===p.sourceName);if(source){const hashes=new Set(Object.values(source.fingerprints||{})),body=p.editor.blocks.slice(1).flatMap(b=>b.units).filter(u=>!u.empty);p.reusedPercent=Math.round(body.filter(u=>hashes.has(u.fingerprint)).length*100/Math.max(1,body.length));}batch.projects[batch.projects.findIndex(x=>x.id===p.id)]=p;});
 const report={before:spread(before),after:spread(times),target:o.target,reached:spread(times)<=o.target+.001,changed,swaps,moves,limited,eligible:projects.length,skipped:original.length-projects.length,rows};batch.balanceOptions=o;batch.balanceReport=report;return report;
}
const pending=new Map();
async function preview(store,{id,settings}){const remix=require('./remix.cjs'),b=remix.get(store,id),updated=b.updated,version=JSON.stringify(b),sources=await remix.analyzeSources(b.sources),report=await balance(b,settings,sources),token=uid();for(const [k,v]of pending)if(Date.now()-v.at>600000)pending.delete(k);for(const [k,v]of pending)if(v.store===store&&v.id===id)pending.delete(k);pending.set(token,{store,id,updated,version,b,at:Date.now()});return {token,...report};}
function apply(store,{token}){const item=pending.get(token);if(!item||item.store!==store||Date.now()-item.at>600000)throw Error('Kết quả đã hết hạn. Hãy xem trước lại.');const remix=require('./remix.cjs'),b=remix.get(store,item.id);if(b.updated!==item.updated||JSON.stringify(b)!==item.version)throw Error('Bộ đã thay đổi. Hãy xem trước lại.');for(const p of item.b.projects.filter(p=>item.b.balanceReport.rows.some(r=>r.id===p.id&&r.changed))){const issues=require('./blacklist.cjs').projectIssues(store,p);if(issues.length)throw Error('Có footage bị chặn. Rà soát bản quyền rồi cân bằng lại.');}remix.save(store,item.b);pending.delete(token);return remix.present(item.b);}
module.exports={options,balance,preview,apply};
