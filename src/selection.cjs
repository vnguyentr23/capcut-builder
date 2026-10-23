const {randomInt}=require('node:crypto');
function sortGroup(group,media,mode=group.sort||'createdAsc',visibleIds=null){
  const valid=['createdAsc','createdDesc','nameAsc','nameDesc','manual','random'];
  if(!valid.includes(mode))throw Error('Cách sắp xếp không hợp lệ.');
  group.sort=mode;group.orderVersion=1;group.excluded??=[];
  if(mode==='manual'||mode==='random')return;
  const scope=visibleIds?new Set(visibleIds):null,pinned=new Set(group.items.filter(id=>(group.pinned||[]).includes(id)||(scope&&!scope.has(id)))),movable=group.items.filter(id=>!pinned.has(id));
  movable.sort((a,b)=>{
    const x=media.get(a)||{},y=media.get(b)||{};
    const names=(x.name||x.path||a).localeCompare(y.name||y.path||b,'vi',{numeric:true})||(x.path||a).localeCompare(y.path||b);
    if(mode.startsWith('name'))return mode==='nameDesc'?-names:names;
    const tx=x.createdAt>0?x.createdAt:null,ty=y.createdAt>0?y.createdAt:null;
    if(tx===null||ty===null)return tx===ty?names:tx===null?1:-1;
    return (mode==='createdDesc'?ty-tx:tx-ty)||names;
  });
  let cursor=0;group.items=group.items.map(id=>pinned.has(id)?id:movable[cursor++]);rememberTop(group,visibleIds);
}
function rememberTop(group,visibleIds=null){
  const scope=visibleIds?new Set(visibleIds):null,items=new Set(group.items);
  const top=group.items.filter(id=>!scope||scope.has(id)).slice(0,5);
  group.discoverySeen=[...new Set([...(group.discoverySeen||[]).filter(id=>items.has(id)),...top])];
  return top;
}
function randomizeGroup(group,visibleIds=null){
  const scope=visibleIds?new Set(visibleIds):null,locked=new Set(group.pinned||[]);
  const visible=group.items.filter(id=>!scope||scope.has(id)),top=rememberTop(group,visibleIds),recent=new Set(top);
  const movable=visible.filter(id=>!locked.has(id)),seen=new Set(group.discoverySeen),chosen=[];
  const slots=top.filter(id=>!locked.has(id)).length;
  const shuffle=arr=>{for(let i=arr.length-1;i>0;i--){const j=randomInt(i+1);[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;};
  const candidates=shuffle([...movable]);
  for(let i=0;i<slots;i++){
    let pool=candidates.filter(id=>!seen.has(id)&&!chosen.includes(id));
    if(!pool.length){seen.clear();pool=candidates.filter(id=>!chosen.includes(id));}
    const next=pool.find(id=>!recent.has(id))??pool[0];
    if(next===undefined)break;chosen.push(next);seen.add(next);
  }
  const tail=shuffle(movable.filter(id=>!chosen.includes(id))),ordered=[...chosen,...tail];
  if(ordered.length>1&&ordered.every((id,i)=>id===movable[i]))ordered.push(ordered.shift());
  let cursor=0;group.items=group.items.map(id=>locked.has(id)||(scope&&!scope.has(id))?id:ordered[cursor++]);
  group.discoverySeen=[...seen];rememberTop(group,visibleIds);
  group.sort='random';group.orderVersion=1;
}
function selectBody(draft,groups,media,used,{repair=false,partial=false}={}){
  if(!Number.isInteger(draft.target)||draft.target<1||draft.target>2000)throw Error('Target phải là số nguyên từ 1 đến 2.000 footage.');
  if(!draft.pattern.length)throw Error('Hãy thêm ít nhất một nhóm vào pattern.');
  const fill=draft.shortClipFill||{enabled:false,threshold:5};
  if(fill.enabled&&(!Number.isFinite(fill.threshold)||fill.threshold<=0||fill.threshold>3600))throw Error('Ngưỡng bù clip phải lớn hơn 0 và tối đa 3.600 giây.');
  const durations=new Map();const duration=m=>{if(!m)return 0;if(!durations.has(m.id)){try{durations.set(m.id,require('./domain.cjs').clipRange(draft,m).duration);}catch{durations.set(m.id,0);}}return durations.get(m.id);};
  const groupMap=new Map(groups.map(g=>[g.id,g]));
  if(draft.pattern.some(id=>!groupMap.has(id)))throw Error('Pattern tham chiếu nhóm đã bị xóa.');
  const excluded=new Set([...groups.flatMap(g=>g.excluded||[]),...(draft.excluded||[])]);
  const blocked=new Set([...excluded,...draft.hook.filter(h=>!h.allowBody).map(h=>media.get(h.id)?.fingerprint),draft.intro?.fingerprint,draft.end?.fingerprint]);
  const selected=new Set(),counts=new Map(groups.map(g=>[g.id,0])),result=new Array(draft.target),preferred=new Array(draft.target);
  const eligible=(m,g)=>m?.duration>0&&(!g?.lockedOnly||(g.pinned||[]).includes(m.id))&&m.width>0&&m.height>0&&!m.error&&!used.has(m.fingerprint)&&!blocked.has(m.fingerprint)&&!selected.has(m.fingerprint);
  const place=(m,g,i)=>{selected.add(m.fingerprint);counts.set(g.id,counts.get(g.id)+1);result[i]={id:m.id,groupId:g.id,requestedGroupId:preferred[i]?.id||draft.pattern[i%draft.pattern.length],slotIndex:i};};
  const scarce=new Set();
  if(draft.spreadScarce)for(const g of groups){const demand=Array.from({length:draft.target},(_,i)=>draft.pattern[i%draft.pattern.length]).filter(id=>id===g.id).length;const available=new Set(g.items.map(id=>media.get(id)).filter(m=>eligible(m,g)).map(m=>m.fingerprint)).size;if(available<demand)scarce.add(g.id);}
  const oldSlots=new Map((repair?draft.body.filter(b=>!b.supplementFor):[]).map((b,i)=>[b.slotIndex??i,b]));
  for(let i=0;i<draft.target;i++){
    const old=oldSlots.get(i),g=groupMap.get(old?.groupId),m=media.get(old?.id);
    preferred[i]=g||groupMap.get(draft.pattern[i%draft.pattern.length]);
    if(g&&g.items.includes(old.id)&&eligible(m,g)){place(m,g,i);result[i].requestedGroupId=old.requestedGroupId||old.groupId;if(old.priority)result[i].priority=true;}
  }
  if(!repair){let slot=0;const active=new Set(draft.pattern);for(const id of (draft.pinPriority===false?[]:require('./ui/pin-order.js').ordered(draft,groups))){if(slot>=draft.target)break;const g=groups.find(g=>active.has(g.id)&&g.items.includes(id)&&(g.pinned||[]).includes(id)),m=media.get(id);if(g&&!scarce.has(g.id)&&eligible(m,g)){preferred[slot]=g;place(m,g,slot);result[slot].priority=true;slot++;}}for(let i=slot;i<draft.target;i++)preferred[i]=groupMap.get(draft.pattern[(i-slot)%draft.pattern.length]);}
  const positions=new Map();
  function take(g){let p=positions.get(g.id)||0;while(p<g.items.length){const m=media.get(g.items[p++]);positions.set(g.id,p);if(eligible(m,g))return m;}return null;}
  // Reserve every normal pattern slot before distributing shortages. This keeps
  // fallback balanced against the final counts, not an incomplete prefix.
  if(draft.spreadScarce&&!repair){
    for(const g of groups){
      const slots=preferred.map((v,i)=>v.id===g.id&&!result[i]?i:-1).filter(i=>i>=0);
      const available=new Set(g.items.map(id=>media.get(id)).filter(m=>eligible(m,g)).map(m=>m.fingerprint)).size;
      const count=Math.min(slots.length,available);
      const targets=count===1?[slots[Math.floor((slots.length-1)/2)]]:Array.from({length:count},(_,i)=>slots[Math.round(i*(slots.length-1)/(count-1))]);
      for(const i of targets){const m=take(g);if(m)place(m,g,i);}
    }
  }else for(let i=0;i<draft.target;i++)if(!result[i]){const m=take(preferred[i]);if(m)place(m,preferred[i],i);}
  for(let i=0;i<draft.target;i++)if(!result[i]){
    for(const g of [...groups].sort((a,b)=>counts.get(a.id)-counts.get(b.id)||groups.indexOf(a)-groups.indexOf(b))){const m=take(g);if(m){place(m,g,i);break;}}
  }
  const body=result.filter(Boolean),missing=draft.target-body.length;
  if(missing&&partial)body.forEach((b,i)=>{b.slotIndex=i;b.requestedGroupId=draft.pattern[i%draft.pattern.length];});
  if(missing&&!partial)throw Error(`Toàn bộ thư viện thiếu footage hợp lệ: còn thiếu ${missing}/${draft.target}. Không tự lặp footage.`);
  let supplementMissing=0;const expanded=[],kept=new Map();
  const shortBases=new Set(fill.enabled?body.filter(b=>duration(media.get(b.id))>0&&duration(media.get(b.id))<fill.threshold).map(b=>b.id):[]);
  // Preserve valid supplements during replacement before choosing new ones.
  if(repair&&fill.enabled)for(const extra of draft.body.filter(c=>c.supplementFor)){
    const g=groupMap.get(extra.groupId),m=media.get(extra.id);
    if(shortBases.has(extra.supplementFor)&&!kept.has(extra.supplementFor)&&g?.items.includes(extra.id)&&eligible(m,g)&&duration(m)>0){kept.set(extra.supplementFor,{m,g});selected.add(m.fingerprint);counts.set(g.id,counts.get(g.id)+1);}
  }
  for(const base of body){
    expanded.push(base);if(!shortBases.has(base.id))continue;
    let chosen=kept.get(base.id);
    const ordered=[groupMap.get(base.groupId),...groups.filter(g=>g.id!==base.groupId).sort((a,b)=>counts.get(a.id)-counts.get(b.id)||groups.indexOf(a)-groups.indexOf(b))];
    if(!chosen)for(const shortOnly of [true,false]){
      for(const g of ordered){const m=g.items.map(id=>media.get(id)).find(m=>eligible(m,g)&&duration(m)>0&&(!shortOnly||duration(m)<fill.threshold));if(m){chosen={m,g};break;}}
      if(chosen)break;
    }
    if(!chosen){supplementMissing++;continue;}
    const {m,g}=chosen;if(!kept.has(base.id)){selected.add(m.fingerprint);counts.set(g.id,counts.get(g.id)+1);}
    expanded.push({id:m.id,groupId:g.id,slotIndex:base.slotIndex,supplementFor:base.id});
  }
  return {body:expanded,missing,supplementMissing,counts:Object.fromEntries(counts),substitutions:body.filter(b=>b.groupId!==b.requestedGroupId).length};
}
function removeFootage(state,groupId,mediaId,media,used,scope='permanent'){return removeFootages(state,groupId,[mediaId],media,used,scope);}
function removeFootages(state,groupId,mediaIds,media,used,scope='permanent'){
  if(!['permanent','project'].includes(scope))throw Error('Phạm vi xóa không hợp lệ.');
  const g=state.groups.find(g=>g.id===groupId),ids=[...new Set(mediaIds||[])];
  if(!g||!ids.length||ids.some(id=>!media.has(id)||!g.items.includes(id)))throw Error('Footage không còn trong nhóm này.');
  const fingerprints=new Set(ids.map(id=>media.get(id).fingerprint));
  const owner=scope==='project'?state.draft:g;
  owner.excluded=[...new Set([...(owner.excluded||[]),...fingerprints])];
  const old=state.draft.body,hadBody=old.length>0;
  const removedHooks=state.draft.hook.filter(h=>fingerprints.has(media.get(h.id)?.fingerprint)).length;
  state.draft.hook=state.draft.hook.filter(h=>!fingerprints.has(media.get(h.id)?.fingerprint));
  const result=hadBody?selectBody(state.draft,state.groups,media,used,{repair:true,partial:true}):{body:[],missing:0,substitutions:0};
  const blockAssignments=Object.fromEntries(Object.entries(state.draft.assignments).filter(([key])=>key.startsWith('body-block:')));
  const oldBySlot=new Map(old.map((b,i)=>[b.slotIndex??i,b])),nextAssignments={};
  for(const key of ['hook','end'])if(state.draft.assignments[key])nextAssignments[key]=state.draft.assignments[key];
  if(!state.draft.hook.length)delete nextAssignments.hook;
  for(const b of result.body){const prev=oldBySlot.get(b.slotIndex),song=state.draft.assignments['body:'+b.id]||state.draft.assignments['body:'+prev?.id];if(song)nextAssignments['body:'+b.id]=song;}
  state.draft.body=result.body;state.draft.assignments={...nextAssignments,...blockAssignments};
  return {...result,removedHooks,removedCount:ids.length};
}
module.exports={sortGroup,randomizeGroup,selectBody,removeFootage,removeFootages};

