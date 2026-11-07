// Reserve Body footage across the whole batch; empty slots have no timeline duration.
const {uid}=require('./domain.cjs');
function empty(reason){return {id:uid(),empty:true,reason,name:'Vị trí trống',fingerprint:null,materials:{},segments:[],texts:[]};}
function bodyHashes(p){return p.editor?p.editor.blocks.slice(1).flatMap(b=>b.units.filter(u=>!u.empty).map(u=>u.fingerprint)):p.blocks.filter(b=>!b.hook).flatMap(b=>b.clips.map(c=>c.fingerprint));}
function others(batch,id){return new Set(batch.projects.filter(p=>p.id!==id).flatMap(bodyHashes).filter(Boolean));}
function reconcile(store,batch,sources=null,regenerated=new Set()){
 const edit=require('./remix-editor.cjs'),match=require('./blacklist.cjs').matcher(store),used=require('./remix-used.cjs')(store,batch.channelId),changed=new Set(),cells=[],initialized=new Set();
 const exported=new Set(used),owners=new Map();
 for(const p of batch.projects.filter(p=>p.installed||(regenerated.size&&p.locked&&!regenerated.has(p.id))))for(const hash of bodyHashes(p)){used.add(hash);owners.set(hash,p.name);}
 for(const p of [...batch.projects].sort((a,b)=>Number(regenerated.has(a.id))-Number(regenerated.has(b.id)))){if(p.installed||(regenerated.size&&p.locked&&!regenerated.has(p.id)))continue;if(!p.editor)initialized.add(p);const e=edit.init(p),local=new Set();
  for(let bi=0;bi<e.blocks.length;bi++)for(let slot=0;slot<e.blocks[bi].units.length;slot++){
   let u=e.blocks[bi].units[slot];if(!u.empty){const reason=match(u)?'Footage bị chặn':bi>0&&used.has(u.fingerprint)?(owners.has(u.fingerprint)?'Footage đã có ở Body của '+owners.get(u.fingerprint):exported.has(u.fingerprint)?'Footage đã xuất ở kênh này':'Footage đã được chọn'):local.has(u.fingerprint)?'Footage trùng trong video':null;
    if(reason){u=e.blocks[bi].units[slot]=empty(reason);changed.add(p);}else{local.add(u.fingerprint);if(bi>0){used.add(u.fingerprint);owners.set(u.fingerprint,p.name);}}}
   if(u.empty)cells.push({p,bi,slot});
  }
 }
 // Existing clean footage stays in place. Only unused same-slot source footage can fill gaps.
 if(sources)for(const {p,bi,slot} of cells){const local=new Set(p.editor.blocks.flatMap(b=>b.units.map(u=>u.fingerprint)));let choice;
  for(const source of sources){for(let index=bi===0?0:Math.max(1,bi-1);index<=(bi===0?0:bi+1);index++){const u=source.blocks[index]?.units[slot];if(u&&!match(u)&&!local.has(u.identity)&&(bi===0||!used.has(u.identity))){choice={source,u};break;}}if(choice)break;}
  if(choice){p.editor.blocks[bi].units[slot]=edit.pack(choice.source.draft,choice.u.segments,choice.u.identity,choice.u.name);if(bi>0)used.add(choice.u.identity);changed.add(p);}
 }
 for(const p of changed){p.editor.revision++;p.editUndo=[];edit.rebuild(p);}
 for(const p of initialized)if(!changed.has(p))delete p.editor;
 return changed.size;
}
module.exports={empty,bodyHashes,others,reconcile};
