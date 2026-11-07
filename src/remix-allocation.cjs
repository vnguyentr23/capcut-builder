// Reserve Body footage across the whole batch; empty slots have no timeline duration.
const {uid}=require('./domain.cjs');
function empty(reason){return {id:uid(),empty:true,reason,name:'Vị trí trống',fingerprint:null,materials:{},segments:[],texts:[]};}
function bodyHashes(p){return p.editor?p.editor.blocks.slice(1).flatMap(b=>b.units.filter(u=>!u.empty).map(u=>u.fingerprint)):p.blocks.filter(b=>!b.hook).flatMap(b=>b.clips.map(c=>c.fingerprint));}
function others(batch,id){return new Set(batch.projects.filter(p=>p.id!==id).flatMap(bodyHashes).filter(Boolean));}
function reconcile(store,batch,projectIds){
 const edit=require('./remix-editor.cjs'),blocked=require('./blacklist.cjs').matcher(store);
 let count=0;
 for(const project of batch.projects){
  if(project.locked||(project.installed&&!project.mixUnlocked)||(projectIds&&!projectIds.has(project.id)))continue;
  const hadEditor=!!project.editor;
  const editor=edit.init(project);
  let changed=false;
  for(const block of editor.blocks){
   block.units=block.units.map(unit=>{
    if(unit.empty||!blocked(unit))return unit;
    changed=true;
    return {...empty('Footage bị chặn'),removedFootage:unit};
   });
  }
  if(changed){editor.revision++;edit.rebuild(project);count++;}
  else if(!hadEditor)delete project.editor;
 }
 return count;
}
module.exports={empty,bodyHashes,others,reconcile};
