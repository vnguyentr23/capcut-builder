import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
// Preserve source credit styles; no dependency on external presets.

export const clone = x => structuredClone(x);
export const uid = () => crypto.randomUUID().toUpperCase();
export const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
export const writeJson = (p, x) => fs.writeFileSync(p, JSON.stringify(x, null, 2));
const norm = p => String(p || '').replaceAll('\\', '/').normalize('NFC').toLowerCase();
const end = s => s.target_timerange.start + s.target_timerange.duration;
const signature = units => crypto.createHash('sha256').update(JSON.stringify(units.map(u => u.identity))).digest('hex');
const isIntro = m => /^(?:\d+-)?intro(?:[ ._-]|$)/i.test(m?.material_name || path.basename(m?.path || ''));
const effectTypes = new Set(['video_effects', 'effects', 'filters', 'adjusts', 'video_trackings']);
const dangerFolderMarker='/youtube/footage_pet/b - nguy hiểm/';
// Normalized music windows distilled from the hand-edited K3-05 and K2-06
// timelines after joining pieces that were split only to duck under narration.
// A block keeps one song; a later window continues the same song timeline.
const bodyMusicWindowProfiles=[
  [[0,.82]],[[.1,.7]],[[0,.35]],[[.25,.55]],[[.5,1]],[[.25,1]],[[0,.75]],[[.5,.8]],
  [[0,.35],[.7,1]],[[0,.2],[.45,1]],[[0,.3],[.55,1]]
];

export function isDangerousFootage(unitOrPath) {
  return (`/${norm(typeof unitOrPath==='string'?unitOrPath:unitOrPath?.path)}/`).includes(dangerFolderMarker);
}

export function normalizeFootageZoom(segment) {
  const scale=segment?.clip?.scale,x=scale?.x,y=scale?.y;
  if(Number.isFinite(x)&&Number.isFinite(y)&&x>=1.3&&x<=2&&y>=1.3&&y<=2) {
    scale.x=1.4;scale.y=1.4;
  }
  return segment;
}

export function analyze(draft, name, sourceId, sourcePath = '') {
  const issues = [], warnings = [];
  const tracks = draft.tracks || [];
  const videoTracks = tracks.filter(t => t.type === 'video' && t.segments.length);
  const materials = new Map();
  for (const [type, list] of Object.entries(draft.materials || {})) {
    if (Array.isArray(list)) for (const m of list) materials.set(m.id, {type, value: m});
  }
  const result = {name, sourceId, sourcePath, draft, materials, issues, warnings, blocks: [], intro: null};
  if (videoTracks.length !== 1) { issues.push('Cần đúng một track video chính; project trống hoặc có nhiều track video.'); return result; }
  const segments = [...videoTracks[0].segments].sort((a,b) => a.target_timerange.start - b.target_timerange.start);
  const units = [];
  let cursor = 0;
  for (const s of segments) {
    const m = materials.get(s.material_id)?.value;
    if (!m?.path) {issues.push(`Không tìm được file nguồn của segment ${s.id}.`); continue;}
    if (Math.abs(s.target_timerange.start - cursor) > 2) issues.push(`Timeline có khoảng trống/chồng đoạn tại ${s.target_timerange.start / 1e6}s.`);
    cursor = end(s);
    const transitionRefs = (s.extra_material_refs || []).filter(id => materials.get(id)?.type === 'transitions');
    const prev = units.at(-1);
    // A split edit of one source is one footage slot; retain every cut and transform.
    if (prev && prev.identity === norm(m.path) && !prev.transitionRefs.length && Math.abs(prev.end - s.target_timerange.start) <= 2) {
      prev.segments.push(s); prev.end = end(s); prev.duration = prev.end - prev.start; prev.transitionRefs = transitionRefs;
    } else {
      units.push({id: `${sourceId}:${s.id}`, sourceId, identity: norm(m.path), path: m.path, name: m.material_name,
        start: s.target_timerange.start, end: end(s), duration: s.target_timerange.duration,
        segments: [s], texts: [], transitionRefs, intro: isIntro(m)});
    }
  }
  let pending = [];
  function flush() {
    if (!pending.length) return;
    result.blocks.push({id: `${sourceId}:block:${result.blocks.length}`, sourceId, units: pending,
      transitionRefs: [...pending.at(-1).transitionRefs]}); pending = [];
  }
  for (const u of units) {
    if (u.intro) {
      flush();
      if (result.intro) issues.push('Có nhiều cụm intro không liền nhau; cần chỉ định intro.');
      result.intro = u;
      result.introAfterBlock=result.blocks.length;
    } else {pending.push(u); if (u.transitionRefs.length) flush();}
  }
  flush();

  if (result.blocks.length < 3) issues.push('Cần ít nhất ba block để giữ hook và đặt intro.');
  for (const [i, b] of result.blocks.entries()) {
    b.hook = i === 0;
    b.units.forEach((u, slot) => {u.slot = slot; u.blockId = b.id; u.hook = b.hook;});
    if (!b.units.length) issues.push(`Block ${i+1} có ${b.units.length} footage, cần kiểm tra ranh giới block.`);
  }
  for (const t of tracks.filter(t => t.type === 'text')) for (const s of t.segments) {
    const candidates = units.filter(u => s.target_timerange.start >= u.start - 2 && end(s) <= u.end + 2);
    if (candidates.length === 1) {candidates[0].texts.push({segment:s,track:t});continue;}
    // One author label can span several clips by that same author. Split its
    // coverage only when every overlapped filename independently matches it.
    const overlaps=units.filter(u=>Math.min(u.end,end(s))-Math.max(u.start,s.target_timerange.start)>2);
    let author='';try{author=JSON.parse(materials.get(s.material_id)?.value.content || '{}').text || '';}catch{}
    const authorKey=x=>x.normalize('NFC').replace(/^@/,'').replace(/\.[^.]+$/,'').replace(/\s*\(\d+\)$/,'').trim().toLowerCase();
    if(overlaps.length>1 && author && overlaps.every(u=>!u.hook&&!u.intro&&authorKey(u.name||'')===authorKey(author))) {
      for(const u of overlaps){const part=clone(s);const start=Math.max(u.start,s.target_timerange.start);
        part.target_timerange={start,duration:Math.min(u.end,end(s))-start};u.texts.push({segment:part,track:t});}
      warnings.push(`Tách chữ ${author} dùng chung thành ${overlaps.length} nhãn đi theo từng footage cùng tác giả.`);continue;
    }
    const close=units.filter(u=>!u.hook && Math.abs(s.target_timerange.start-u.start)<=200000 && Math.abs(end(s)-u.end)<=200000);
    if(close.length===1) {
      const fixed=clone(s);fixed.target_timerange={start:close[0].start,duration:close[0].duration};
      close[0].texts.push({segment:fixed,track:t});
      warnings.push(`Căn chữ ${s.id} lệch dưới 0,2 giây vào đúng đầu/cuối footage ${close[0].name}.`);
    } else issues.push(`Chữ ${s.id} vượt ranh giới footage tại ${s.target_timerange.start / 1e6}s.`);
  }
  const noText = units.filter(u => !u.intro && !u.texts.length);
  if (noText.length) warnings.push(`${noText.length} footage không có chữ tác giả trong nguồn.`);
  for (const t of tracks) if (!['video','text','audio','effect','filter','adjust'].includes(t.type) && t.segments?.length)
    issues.push(`Chưa hỗ trợ track ${t.type}; cần kiểm tra trước khi xuất.`);
  if (Object.values(draft.keyframes || {}).some(a => Array.isArray(a) && a.length))
    issues.push('Project có keyframe ngoài segment; phiên bản này chưa chuyển an toàn.');
  for(const u of units)u.identity=norm(u.path).split('/').at(-1);
  result.signature = signature(result.blocks.slice(1).flatMap(b => b.units));
  result.units = units;
  result.audioCount = tracks.filter(t => t.type === 'audio').reduce((n,t) => n+t.segments.length,0);
  return result;
}

export function loadSources(root) {
  const meta = readJson(path.join(root, 'root_meta_info.json'));
  return meta.all_draft_store.map(d => {
    const snap = path.join(root, 'sources', d.draft_id);
    const a = analyze(readJson(path.join(snap, 'draft_content.json')), d.draft_name, d.draft_id, d.draft_fold_path);
    a.meta = readJson(path.join(snap, 'draft_meta_info.json')); a.snapshotPath = snap;
    return a;
  });
}

export function duplicateReport(sources, aliases = {}) {
  const occurrences = new Map();
  for (const s of sources) for (const b of s.blocks) for (const u of b.units) {
    const key = aliases[u.identity] || u.identity;
    const rows = occurrences.get(key) || [];
    rows.push({project:s.name, block:s.blocks.indexOf(b)+1, slot:u.slot+1, hook:b.hook, name:u.name, path:u.path, unitId:u.id});
    occurrences.set(key, rows);
  }
  return [...occurrences.entries()].filter(([,rows]) => rows.length > 1).map(([identity,occurrences]) => ({identity,occurrences}));
}

export function publicReport(sources) {
  return {projects:sources.map(s => ({id:s.sourceId,name:s.name,duration:s.draft.duration/1e6,
    blocks:s.blocks.map((b,i)=>({index:i+1,hook:b.hook,footages:b.units.map(u=>({id:u.id,name:u.name,path:u.path,duration:u.duration/1e6,parts:u.segments.length,texts:u.texts.length}))})),
    intro:s.intro?.path,issues:s.issues,warnings:s.warnings,audioCount:s.audioCount})),duplicates:duplicateReport(sources)};
}

function rng(seed) {
  let state = crypto.createHash('sha256').update(String(seed)).digest().readUInt32LE();
  return () => {state += 0x6D2B79F5; let t=state; t=Math.imul(t ^ t>>>15,t|1); t^=t+Math.imul(t ^ t>>>7,t|61); return ((t ^ t>>>14)>>>0)/4294967296;};
}
function shuffled(a,r) {a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(r()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a;}
export function planChannel(sources, {seed, history=[], aliases={}, hookSources=[]} = {}) {
  if(!sources.length) throw new Error('Chưa chọn project nguồn.');
  const invalid=sources.filter(s=>s.issues.length);
  if(invalid.length) throw new Error('Project cần xử lý trước: '+invalid.map(s=>`${s.name}: ${s.issues.join(' ')}`).join('\n'));
  const identity=u=>aliases[u.identity]||u.identity;
  for(const source of hookSources.length?hookSources:sources) {
    const hook=source.blocks[0]?.units.map(identity)||[];
    if(!hook.length)throw new Error('Không đọc được hook của '+source.name+'.');
    if(new Set(hook).size!==hook.length) throw new Error('Hook của '+source.name+' có footage trùng bên trong.');
  }
  const occurrences=new Map();
  for(const source of sources)for(const block of source.blocks.slice(1))for(const unit of block.units)
    occurrences.set(identity(unit),(occurrences.get(identity(unit))||0)+1);
  for(const [id,count] of occurrences) {
    const eligible=hookSources.length?sources.length:sources.filter(source=>!source.blocks[0].units.some(u=>identity(u)===id)).length;
    if(count>eligible)throw new Error('Không đủ video để phân bổ footage trùng mà vẫn giữ hook: '+id+' ('+count+' lần, '+eligible+' video phù hợp). Chọn thêm nguồn hoặc giảm footage lặp trong phần thân.');
  }
  const known=new Set([...(sources.length>1?sources.map(s=>s.signature):[]),...history.map(h=>h.signature)]);
  const bodyIndexByUnit=new Map();
  for(const source of sources)source.blocks.slice(1).forEach((block,blockIndex)=>block.units.forEach(unit=>bodyIndexByUnit.set(unit,blockIndex)));
  for(let attempt=0;attempt<1000;attempt++) {
    const random=rng(`${seed}:${attempt}`);
    // A body footage may stay in its block or move exactly one block left or
    // right. Each unit participates in at most one swap, so it cannot drift.
    const assigned=new Map(),maxBody=Math.max(...sources.map(s=>s.blocks.length-1));
    const allCells=[];
    for(const source of sources)for(let blockIndex=0;blockIndex<maxBody;blockIndex++)if(source.blocks[blockIndex+1])
      allCells.push({source,blockIndex,block:{...source.blocks[blockIndex+1],units:[...source.blocks[blockIndex+1].units],shuffleIndex:blockIndex}});
    const maxSlots=Math.max(...allCells.map(cell=>cell.block.units.length));
    for(let slot=0;slot<maxSlots;slot++) {
      const slotCells=allCells.filter(cell=>cell.block.units.length>slot),remaining=shuffled(slotCells.map((_,index)=>index),random);
      while(remaining.length>1) {
        const aIndex=remaining.pop(),a=slotCells[aIndex];
        const choices=remaining.filter(index=>Math.abs(slotCells[index].blockIndex-a.blockIndex)<=1);
        if(!choices.length)continue;
        const bIndex=choices[Math.floor(random()*choices.length)],position=remaining.indexOf(bIndex);remaining.splice(position,1);
        const b=slotCells[bIndex];[a.block.units[slot],b.block.units[slot]]=[b.block.units[slot],a.block.units[slot]];
      }
    }
    for(const cell of allCells)assigned.set(`${cell.source.sourceId}:${cell.blockIndex}`,cell.block);
    const used=new Set(known), plans=[]; let valid=true;
    for(const s of sources) {
      const body=s.blocks.slice(1).map((_,index)=>assigned.get(`${s.sourceId}:${index}`));
      const bs=hookSources.length?body:[s.blocks[0],...body];
      const sig=signature(body.flatMap(b=>b.units));
      if(used.has(sig)){valid=false;break;} used.add(sig);
      plans.push({source:s,blocks:bs,signature:sig,body});
    }
    if(valid) {
      // Repair collisions without moving either unit farther than one block.
      const counts=plans.map(p=>{const m=new Map();for(const b of p.blocks)for(const u of b.units)m.set(identity(u),(m.get(identity(u))||0)+1);return m;});
      const cells=plans.flatMap((p,v)=>p.body.flatMap((b,blockIndex)=>b.units.map((u,slot)=>({v,b,slot,blockIndex}))));
      const get=c=>identity(c.b.units[c.slot]);
      const add=(v,id,n)=>counts[v].set(id,(counts[v].get(id)||0)+n);
      const canSwap=(a,b)=>Math.abs(bodyIndexByUnit.get(a.b.units[a.slot])-b.blockIndex)<=1&&Math.abs(bodyIndexByUnit.get(b.b.units[b.slot])-a.blockIndex)<=1;
      for(let step=0;step<cells.length*2;step++) {
        const bad=cells.filter(c=>counts[c.v].get(get(c))>1);
        if(!bad.length)break;
        const a=bad[Math.floor(random()*bad.length)],x=get(a);
        const candidates=cells.filter(b=>b.v!==a.v&&b.slot===a.slot&&canSwap(a,b)&&
          get(b)!==x&&!(counts[b.v].get(x)>0)&&!(counts[a.v].get(get(b))>0));
        if(!candidates.length){valid=false;break;}
        const b=candidates[Math.floor(random()*candidates.length)],y=get(b);
        [a.b.units[a.slot],b.b.units[b.slot]]=[b.b.units[b.slot],a.b.units[a.slot]];
        add(a.v,x,-1);add(a.v,y,1);add(b.v,y,-1);add(b.v,x,1);
      }
      if(counts.some(m=>[...m.values()].some(n=>n>1)))valid=false;
      // Redistribute dangerous footage while retaining adjacency,
      // footage slot and per-video uniqueness constraints.
      const dangerous=cell=>isDangerousFootage(cell.b.units[cell.slot]);
      const dangerCounts=new Map(plans.flatMap(plan=>plan.body).map(block=>[block,block.units.filter(isDangerousFootage).length]));
      for(let step=0;valid&&step<cells.length*4;step++) {
        const badBlocks=[...dangerCounts].filter(([,count])=>count>2).map(([block])=>block);
        if(!badBlocks.length)break;
        const aChoices=cells.filter(cell=>badBlocks.includes(cell.b)&&dangerous(cell));
        const a=aChoices[Math.floor(random()*aChoices.length)],x=get(a);
        const candidates=cells.filter(b=>b.b!==a.b&&b.slot===a.slot&&canSwap(a,b)&&
          !dangerous(b)&&(dangerCounts.get(b.b)||0)<2&&(b.v===a.v||(!(counts[b.v].get(x)>0)&&!(counts[a.v].get(get(b))>0))));
        if(!candidates.length){valid=false;break;}
        const b=candidates[Math.floor(random()*candidates.length)],y=get(b);
        [a.b.units[a.slot],b.b.units[b.slot]]=[b.b.units[b.slot],a.b.units[a.slot]];
        dangerCounts.set(a.b,dangerCounts.get(a.b)-1);dangerCounts.set(b.b,dangerCounts.get(b.b)+1);
        if(a.v!==b.v){add(a.v,x,-1);add(a.v,y,1);add(b.v,y,-1);add(b.v,x,1);}
      }
      if([...dangerCounts.values()].some(count=>count>2))valid=false;
      if(valid&&!balanceBodyBlocks(plans,identity,random,bodyIndexByUnit,!hookSources.length))valid=false;
      if(valid)plans.forEach(plan=>{plan.blocks=hookSources.length?plan.body:[plan.source.blocks[0],...plan.body];});
      if(valid&&hookSources.length) {
        const hooks=planMixedHooks(plans,hookSources,random,identity);
        if(!hooks)valid=false;
        else plans.forEach((plan,index)=>{plan.blocks=[hooks[index],...plan.body];});
      }
      if(valid)optimizeVideoDurations(plans,identity,bodyIndexByUnit);
      const signatures=new Set(known);
      for(const p of plans){p.signature=signature(p.body.flatMap(b=>b.units));if(signatures.has(p.signature))valid=false;signatures.add(p.signature);}
      if(valid&&plans.some(p=>{const ids=p.blocks.flatMap(b=>b.units.map(identity));return new Set(ids).size!==ids.length;}))valid=false;
      if(valid&&plans.some(plan=>plan.blocks.some((block,index)=>(hookSources.length||index>0)&&block.units.filter(isDangerousFootage).length>2)))valid=false;
      if(valid)return plans;
    }
  }
  throw new Error('Không tìm được tổ hợp mới thỏa quy tắc lệch tối đa một block, không trùng footage và tối đa hai footage nguy hiểm mỗi block; cần kiểm tra lại nguồn.');
}

function balanceBodyBlocks(plans,identity,random,bodyIndexByUnit,keepSourceHook) {
  const idsFor=(plan,body)=>[
    ...(keepSourceHook?plan.source.blocks[0].units:[]),
    ...body.flatMap(block=>block.units)
  ].map(identity);
  const validBody=body=>body.every((block,index)=>block.units.every(unit=>Math.abs(bodyIndexByUnit.get(unit)-index)<=1));
  const reindex=body=>body.forEach((block,index)=>{block.shuffleIndex=index;});
  const blockDuration=block=>block.units.reduce((sum,unit)=>sum+unit.duration,0);
  const bodyDuration=body=>body.reduce((sum,block)=>sum+blockDuration(block),0);
  for(let step=0;step<plans.reduce((sum,plan)=>sum+plan.body.length,0);step++) {
    const lengths=plans.map(plan=>plan.body.length),max=Math.max(...lengths),min=Math.min(...lengths);
    if(max-min<=1){plans.forEach(plan=>reindex(plan.body));return true;}
    const donors=plans.filter(plan=>plan.body.length===max),receivers=plans.filter(plan=>plan.body.length===min),options=[];
    const durations=new Map(plans.map(plan=>[plan,bodyDuration(plan.body)]));
    for(const donor of donors)for(const receiver of receivers) {
      for(const candidateIndex of donor.body.map((_,index)=>index)) {
        const block=donor.body[candidateIndex],nextDonor=donor.body.filter((_,index)=>index!==candidateIndex),nextReceiver=[...receiver.body,block];
        const donorIds=idsFor(donor,nextDonor),receiverIds=idsFor(receiver,nextReceiver);
        if(new Set(donorIds).size!==donorIds.length||new Set(receiverIds).size!==receiverIds.length)continue;
        if(!validBody(nextDonor)||!validBody(nextReceiver))continue;
        const movedDuration=blockDuration(block),after=plans.map(plan=>plan===donor?durations.get(plan)-movedDuration:plan===receiver?durations.get(plan)+movedDuration:durations.get(plan));
        options.push({donor,receiver,nextDonor,nextReceiver,spread:Math.max(...after)-Math.min(...after),tie:random()});
      }
    }
    if(!options.length)return false;
    options.sort((a,b)=>a.spread-b.spread||a.tie-b.tie);
    const choice=options[0];choice.donor.body=choice.nextDonor;choice.receiver.body=choice.nextReceiver;reindex(choice.donor.body);reindex(choice.receiver.body);
  }
  return false;
}

function optimizeVideoDurations(plans,identity,bodyIndexByUnit) {
  const duration=plan=>plan.blocks.flatMap(block=>block.units).reduce((sum,unit)=>sum+unit.duration,0);
  const totals=new Map(plans.map(plan=>[plan,duration(plan)]));
  const identities=new Map(plans.map(plan=>[plan,new Set(plan.blocks.flatMap(block=>block.units.map(identity))) ]));
  const dangerCounts=new Map(plans.flatMap(plan=>plan.body).map(block=>[block,block.units.filter(isDangerousFootage).length]));
  const metrics=values=>{const mean=values.reduce((sum,value)=>sum+value,0)/values.length;return {spread:Math.max(...values)-Math.min(...values),deviation:values.reduce((sum,value)=>sum+Math.abs(value-mean),0)};};
  for(let step=0;step<500;step++) {
    const values=plans.map(plan=>totals.get(plan)),current=metrics(values),max=Math.max(...values),min=Math.min(...values);
    if(max-min<=1000000)break;
    const longPlans=plans.filter(plan=>totals.get(plan)===max),shortPlans=plans.filter(plan=>totals.get(plan)===min),options=[];
    for(const longer of longPlans)for(const shorter of shortPlans) {
      const longCells=longer.body.flatMap((block,blockIndex)=>block.units.map((unit,slot)=>({block,blockIndex,unit,slot})));
      const shortCells=shorter.body.flatMap((block,blockIndex)=>block.units.map((unit,slot)=>({block,blockIndex,unit,slot})));
      for(const a of longCells)for(const b of shortCells) {
        if(a.slot!==b.slot||a.unit.duration<=b.unit.duration)continue;
        if(Math.abs(bodyIndexByUnit.get(a.unit)-b.blockIndex)>1||Math.abs(bodyIndexByUnit.get(b.unit)-a.blockIndex)>1)continue;
        const aId=identity(a.unit),bId=identity(b.unit);
        if(aId===bId||identities.get(longer).has(bId)||identities.get(shorter).has(aId))continue;
        const nextDangerA=dangerCounts.get(a.block)-Number(isDangerousFootage(a.unit))+Number(isDangerousFootage(b.unit));
        const nextDangerB=dangerCounts.get(b.block)-Number(isDangerousFootage(b.unit))+Number(isDangerousFootage(a.unit));
        if(nextDangerA>2||nextDangerB>2)continue;
        const delta=a.unit.duration-b.unit.duration,nextValues=plans.map(plan=>plan===longer?totals.get(plan)-delta:plan===shorter?totals.get(plan)+delta:totals.get(plan));
        const next=metrics(nextValues);
        if(next.spread>current.spread||(next.spread===current.spread&&next.deviation>=current.deviation))continue;
        options.push({a,b,longer,shorter,aId,bId,delta,nextDangerA,nextDangerB,...next});
      }
    }
    if(!options.length)break;
    options.sort((a,b)=>a.spread-b.spread||a.deviation-b.deviation);
    const choice=options[0];
    [choice.a.block.units[choice.a.slot],choice.b.block.units[choice.b.slot]]=[choice.b.unit,choice.a.unit];
    totals.set(choice.longer,totals.get(choice.longer)-choice.delta);totals.set(choice.shorter,totals.get(choice.shorter)+choice.delta);
    identities.get(choice.longer).delete(choice.aId);identities.get(choice.longer).add(choice.bId);
    identities.get(choice.shorter).delete(choice.bId);identities.get(choice.shorter).add(choice.aId);
    dangerCounts.set(choice.a.block,choice.nextDangerA);dangerCounts.set(choice.b.block,choice.nextDangerB);
  }
}

function planMixedHooks(plans,hookSources,random,identity) {
  const fixed=hookSources.find(s=>s.templateIndex===6);
  const donors=hookSources.filter(s=>s.templateIndex!==6&&s.blocks[0]?.units.length);
  if(!fixed?.blocks[0])throw new Error('Không tìm thấy hook video số 6 để giữ nguyên.');
  const slots=fixed.blocks[0].units.length;
  if(donors.some(s=>s.blocks[0].units.length!==slots))throw new Error('13 hook không có cùng số vị trí footage.');
  for(let attempt=0;attempt<300;attempt++) {
    const lastUsed=new Map(),result=[];let valid=true;
    for(let videoIndex=0;videoIndex<plans.length;videoIndex++) {
      const body=new Set(plans[videoIndex].body.flatMap(b=>b.units.map(identity))),chosen=[];
      if(videoIndex===5)chosen.push(...fixed.blocks[0].units);
      else for(let slot=0;slot<slots;slot++) {
        const candidates=shuffled(donors.map(s=>s.blocks[0].units[slot]),random).filter(u=>{
          const id=identity(u),last=lastUsed.get(id),dangerCount=chosen.filter(isDangerousFootage).length;
          return !body.has(id)&&!chosen.some(x=>identity(x)===id)&&(last===undefined||videoIndex-last>=3)&&(!isDangerousFootage(u)||dangerCount<2);
        });
        if(!candidates.length){valid=false;break;}chosen.push(candidates[0]);
      }
      if(!valid||chosen.some(u=>body.has(identity(u)))||new Set(chosen.map(identity)).size!==chosen.length){valid=false;break;}
      if(chosen.some(u=>lastUsed.has(identity(u))&&videoIndex-lastUsed.get(identity(u))<3)){valid=false;break;}
      chosen.forEach(u=>lastUsed.set(identity(u),videoIndex));
      const owner=videoIndex===5?fixed:hookSources.find(s=>s.sourceId===chosen[0].sourceId);
      result.push({id:`mixed-hook:${videoIndex}:${attempt}`,sourceId:owner.sourceId,units:chosen,transitionRefs:[...owner.blocks[0].transitionRefs],hook:true,shuffleIndex:-1});
    }
    if(valid)return result;
  }
  return null;
}

export function assignMusic(plans,library,random) {
  const songs=new Map((library.songs||[]).map(song=>[song.identity,song]));
  const pools=Object.fromEntries(['hook','body','end'].map(zone=>[zone,(library.pools?.[zone]||[]).map(id=>songs.get(id)).filter(Boolean)]));
  if(!pools.hook.length||!pools.body.length||!pools.end.length)throw new Error('Chưa phân loại đủ nhạc hook, thân và cuối từ 12 project mẫu. Hãy quét lại CapCut.');
  for(const plan of plans) {
    const used=new Set();let previousProfile=-1;
    for(const [index,block] of plan.blocks.entries()) {
      const zone=index===0?'hook':index===plan.blocks.length-1?'end':'body';
      const candidates=shuffled(pools[zone],random).filter(song=>!used.has(song.identity));
      if(!candidates.length)throw new Error(`Không đủ bài nhạc ${zone} khác nhau cho ${plan.source.name}.`);
      candidates.sort((a,b)=>b.counts[zone]-a.counts[zone]);
      const shortlist=candidates.slice(0,Math.min(5,candidates.length)),song=shortlist[Math.floor(random()*shortlist.length)];
      block.music=song;used.add(song.identity);
      if(index===0||index===plan.blocks.length-1)block.musicWindows=[[0,1]];
      else {
        const choices=bodyMusicWindowProfiles.map((windows,profile)=>({windows,profile})).filter(item=>item.profile!==previousProfile);
        const selected=choices[Math.floor(random()*choices.length)];
        block.musicWindows=selected.windows.map(window=>[...window]);previousProfile=selected.profile;
      }
    }
  }
}

// Rebuild in integer microseconds. CapCut's overlap transition is attached to
// the outgoing segment; it does not subtract duration from target_timerange.
export function buildDraft(plan, allSources, {name, intro=null, authorStyle=null}={}) {
  const byId=new Map(allSources.map(s=>[s.sourceId,s]));
  const original=plan.source, out=clone(original.draft);
  out.id=uid(); out.name=name || original.name; out.create_time=0; out.update_time=0;
  out.tracks=[]; out.materials=Object.fromEntries(Object.keys(out.materials).map(k=>[k,[]]));
  out.group_container=null; out.relationships=[]; out.time_marks=null;
  out.keyframes=Object.fromEntries(Object.keys(out.keyframes || {}).map(k=>[k,[]]));
  out.keyframe_graph_list=[];
  const videoTrack={...clone(original.draft.tracks.find(t=>t.type==='video')),id:uid(),segments:[]};
  const textTracks=new Map(), importCache=new Map(), ledger=[];
  function importMaterial(source,id) {
    const key=`${source.sourceId}:${id}`;
    if(importCache.has(key)) return importCache.get(key);
    const entry=source.materials.get(id);
    if(!entry) throw new Error(`Thiếu material ${id} trong ${source.name}.`);
    const m=clone(entry.value), newId=uid(); m.id=newId; importCache.set(key,newId);
    (out.materials[entry.type] ||= []).push(m);
    return newId;
  }
  function copySegment(source,s,offset,isText=false,normalizeZoom=false) {
    const c=clone(s); c.id=uid(); c.material_id=importMaterial(source,s.material_id);
    c.target_timerange.start+=offset;
    if(c.render_timerange?.duration>0)c.render_timerange.start+=offset;
    c.group_id=''; c.raw_segment_id='';
    c.extra_material_refs=(s.extra_material_refs||[]).filter(id=>{
      const type=source.materials.get(id)?.type;
      return type!=='transitions';
    }).map(id=>importMaterial(source,id));
    if(c.keyframe_refs?.length) throw new Error('Chưa hỗ trợ keyframe_refs ngoài segment.');
    // common_keyframes are clip-local; never shift their internal time_offset.
    // Keep clip-local color/effect/animation settings with the selected footage.
    // Preserve the source transform exactly in the Builder remix flow.
    return c;
  }
  let cursor=0;
  function appendUnit(u,blockIndex,slot) {
    const source=byId.get(u.sourceId), offset=cursor-u.start, newStart=cursor;
    const newSegments=[];
    for(const s of u.segments) {const c=copySegment(source,s,offset,false,blockIndex>=0);videoTrack.segments.push(c);newSegments.push(c);}
    for(const {segment,track} of u.texts) {
      const key=`${u.sourceId}:${track.id}`;
      if(!textTracks.has(key)) textTracks.set(key,{...clone(track),id:uid(),segments:[]});
      const c=copySegment(source,segment,offset,true);

      textTracks.get(key).segments.push(c);
      if(c.target_timerange.start<newStart-2 || end(c)>newStart+u.duration+2)throw new Error('Chữ vượt ra khỏi footage sau khi xào.');
    }
    cursor+=u.duration;
    ledger.push({unitId:u.id,sourceProject:source.name,sourceBlock:source.blocks.findIndex(b=>b.id===u.blockId)+1,
      sourceSlot:u.slot+1,block:blockIndex+1,slot:slot+1,hook:blockIndex===0,identity:u.identity,
      dangerous:isDangerousFootage(u),oldStart:u.start,newStart,duration:u.duration,end:cursor,segmentIds:newSegments.map(s=>s.id),textCount:u.texts.length});
    return newSegments.at(-1);
  }
  let introRange;const blockRanges=[];
  for(let bi=0;bi<plan.blocks.length;bi++) {
    const b=plan.blocks[bi],blockStart=cursor; let last;
    b.units.forEach((u,slot)=>{if(u.slot!==slot)throw new Error('Sai vị trí footage.');last=appendUnit(u,bi,slot);});
    blockRanges.push({start:blockStart,duration:cursor-blockStart,music:b.music,musicWindows:b.musicWindows});
    if(bi<plan.blocks.length-1) {
      const owner=byId.get(b.sourceId);
      // Blocks originally at a video's end have no outgoing transition.
      // Use a real boundary transition from the receiving project in that case.
      const refs=b.transitionRefs.length?b.transitionRefs:original.blocks.find(x=>x.transitionRefs.length)?.transitionRefs || [];
      const refOwner=b.transitionRefs.length?owner:original;
      for(const ref of refs) {
        const material=clone(refOwner.materials.get(ref).value);material.id=uid();
        material.duration=2000000;
        (out.materials.transitions ||= []).push(material);last.extra_material_refs.push(material.id);
      }
    }
    if(bi===(original.introAfterBlock||2)-1 && (intro || original.intro)) {
      const start=cursor;
      if(intro) {
        const template=original.intro, s=copySegment(original,template.segments[0],cursor-template.start);
        const m=clone(original.materials.get(template.segments[0].material_id).value);m.id=uid();m.path=intro.path;
        m.material_name=path.basename(intro.path);m.duration=intro.duration;m.width=intro.width;m.height=intro.height;
        m.local_material_id='';m.material_id='';
        (out.materials.videos ||= []).push(m);s.material_id=m.id;
        s.source_timerange={start:0,duration:intro.duration};s.target_timerange={start:cursor,duration:intro.duration};s.speed=1;
        s.common_keyframes=[];s.keyframe_refs=[];s.clip={scale:{x:1,y:1},rotation:0,transform:{x:0,y:0},flip:{horizontal:false,vertical:false},alpha:1};
        s.extra_material_refs=s.extra_material_refs.filter(id=>!(out.materials.speeds||[]).some(m=>m.id===id));
        s.volume=1;s.last_nonzero_volume=1;videoTrack.segments.push(s);cursor+=intro.duration;
      } else {
        // Diagnostic build only: preserve source intro as an intact edited unit.
        appendUnit(original.intro,-1,0);
      }
      introRange={start,duration:cursor-start};
    }
  }
  if(original.ending){const start=cursor;appendUnit(original.ending,-2,0);if(blockRanges.length)blockRanges.at(-1).duration+=cursor-start;}
  // Merge source text lanes by interval coloring to avoid dozens of UI tracks.
  const textSegments=[...textTracks.values()].flatMap(t=>t.segments).sort((a,b)=>a.target_timerange.start-b.target_timerange.start);
  const lanes=[];
  for(const s of textSegments) {
    let lane=lanes.find(t=>end(t.segments.at(-1))<=s.target_timerange.start+2);
    if(!lane){lane={...clone([...textTracks.values()][0]),id:uid(),segments:[]};lanes.push(lane);}lane.segments.push(s);
  }
  const audioTrack=buildMusicTrack(plan,blockRanges,byId,out,importMaterial);
  out.tracks=[videoTrack,...lanes,...(audioTrack?[audioTrack]:[])];out.duration=cursor;
  const used=new Set(out.tracks.flatMap(t=>t.segments.flatMap(s=>[s.material_id,...s.extra_material_refs])));
  for(const [key,list] of Object.entries(out.materials))out.materials[key]=list.filter(m=>used.has(m.id));
  validateOutput(out,ledger,plan,byId,blockRanges);
  return {draft:out,ledger,introRange,signature:plan.signature};
}

function buildMusicTrack(plan,blockRanges,byId,out,importMaterial) {
  if(!blockRanges.some(range=>range.music))return null;
  let trackTemplate=null;
  for(const range of blockRanges) {
    const source=byId.get(range.music?.ref?.sourceId);
    trackTemplate ||= source?.draft.tracks.find(track=>track.type==='audio');
  }
  const track=trackTemplate?{...clone(trackTemplate),id:uid(),segments:[]}:{id:uid(),type:'audio',segments:[],flag:0,attribute:0,name:'',is_default_name:true};
  for(const [index,range] of blockRanges.entries()) {
    const song=range.music;if(!song)continue;
    const source=byId.get(song.ref.sourceId);
    const originalTrack=source?.draft.tracks.find(t=>t.type==='audio'&&t.segments.some(s=>s.id===song.ref.segmentId));
    const original=originalTrack?.segments.find(s=>s.id===song.ref.segmentId);
    if(!source||!original)throw new Error('Không tìm được đoạn nhạc mẫu: '+song.name);
    const windows=musicWindowsForRange(range,index),firstStart=windows[0].start;
    for(const window of windows) {
      const segment=clone(original);segment.id=uid();segment.material_id=importMaterial(source,original.material_id);
      const material=out.materials.audios.find(item=>item.id===segment.material_id);material.duration=song.duration;material.path=song.path;material.name=song.name;
      const sourceStart=window.start-firstStart,duration=window.duration;
      segment.source_timerange={start:sourceStart,duration};segment.target_timerange={start:range.start+window.start,duration};
      segment.render_timerange={start:0,duration:0};segment.speed=1;segment.reverse=false;segment.is_loop=sourceStart+duration>song.duration;
      segment.volume=10**(-10/20);segment.last_nonzero_volume=1;segment.group_id='';segment.raw_segment_id='';segment.keyframe_refs=[];segment.common_keyframes=[];
      segment.extra_material_refs=(original.extra_material_refs||[]).filter(id=>source.materials.get(id)?.type!=='audio_fades').map(id=>importMaterial(source,id));
      const fade={id:uid(),type:'audio_fade',fade_type:0,fade_in_duration:Math.min(2000000,duration),fade_out_duration:Math.min(4000000,duration)};
      (out.materials.audio_fades ||= []).push(fade);segment.extra_material_refs.push(fade.id);track.segments.push(segment);
    }
  }
  return track;
}

export function musicWindowsForRange(range,index) {
  if(index===0) {
    const start=Math.min(1500000,Math.max(0,range.duration-1));
    return [{start,duration:range.duration-start}];
  }
  return (range.musicWindows?.length?range.musicWindows:[[0,1]]).map(([from,to])=>{
    const start=Math.round(range.duration*from),finish=Math.max(start+1,Math.round(range.duration*to));
    return {start,duration:Math.min(range.duration,finish)-start};
  }).filter(window=>window.duration>0);
}

export function validateOutput(out,ledger,plan,byId,blockRanges=[]) {
  const video=out.tracks.find(t=>t.type==='video').segments;
  let cursor=0;
  for(const s of video){if(Math.abs(s.target_timerange.start-cursor)>2)throw new Error('Timeline đầu ra bị hở/chồng.');cursor=end(s);}
  if(cursor!==out.duration)throw new Error('Sai tổng thời lượng.');
  const ids=out.tracks.flatMap(t=>[t.id,...t.segments.map(s=>s.id)]).concat(Object.values(out.materials).flat().map(m=>m.id));
  if(new Set(ids).size!==ids.length)throw new Error('Trùng ID CapCut.');
  const identities=ledger.filter(r=>r.block>0).map(r=>r.identity);
  if(new Set(identities).size!==identities.length)throw new Error('Video đầu ra có footage trùng, kể cả hook.');
  const vm=new Map(video.map(s=>[s.id,s]));
  for(const row of ledger.filter(r=>r.block>0)) {
    const source=[...byId.values()].find(s=>s.name===row.sourceProject);
    const u=source.units.find(u=>u.id===row.unitId);
    row.segmentIds.forEach((id,i)=>{
      const actual=vm.get(id),old=u.segments[i];
      for(const key of ['source_timerange','speed','uniform_scale','common_keyframes','volume','reverse'])
        if(JSON.stringify(actual[key])!==JSON.stringify(old[key]))throw new Error(`Sai ${key} của ${u.name}.`);
      const expectedClip=old.clip;
      if(JSON.stringify(actual.clip)!==JSON.stringify(expectedClip))throw new Error(`Sai clip/zoom của ${u.name}.`);
      if(actual.target_timerange.duration!==old.target_timerange.duration)throw new Error('Thời lượng đã cắt bị thay đổi.');
    });
    if(row.sourceSlot!==row.slot)throw new Error('Hoán đổi sai slot.');
    if(row.block>1&&Math.abs(row.sourceBlock-row.block)>1)throw new Error('Footage đã di chuyển quá một block liền kề.');
  }
  for(const block of new Set(ledger.filter(row=>row.block>1).map(row=>row.block)))
    if(plan.enforceDangerLimit&&ledger.filter(row=>row.block===block&&row.dangerous).length>2)throw new Error('Một block có quá hai footage từ B - NGUY HIỂM.');
  if(out.tracks.some(t=>t.type==='effect'))throw new Error('Chưa xóa effect track.');
  if((out.materials.transitions||[]).some(transition=>transition.duration!==2000000))throw new Error('Transition giữa các block không đúng 2 giây.');
  const audio=out.tracks.filter(t=>t.type==='audio');
  if(plan.blocks.some(b=>b.music)) {
    const expected=blockRanges.flatMap((range,index)=>musicWindowsForRange(range,index).map((window,windowIndex)=>({range,window,windowIndex})));
    if(audio.length!==1||audio[0].segments.length!==expected.length)throw new Error('Sai số cửa sổ nhạc theo block.');
    for(const [segmentIndex,segment] of audio[0].segments.entries()) {
      const {range,window,windowIndex}=expected[segmentIndex];
      if(Math.abs(segment.volume-10**(-10/20))>1e-9)throw new Error('Sai âm lượng nhạc -10 dB.');
      const first=musicWindowsForRange(range,blockRanges.indexOf(range))[0];
      if(segment.source_timerange.start!==window.start-first.start)throw new Error('Sai điểm tiếp tục của bài hát.');
      if(windowIndex===0&&segment.source_timerange.start!==0)throw new Error('Cửa sổ nhạc đầu không bắt đầu từ đầu bài hát.');
      if(segment.target_timerange.start!==range.start+window.start||segment.target_timerange.duration!==window.duration)throw new Error('Sai cửa sổ phát nhạc theo block.');
      const fades=(out.materials.audio_fades||[]).filter(m=>segment.extra_material_refs.includes(m.id));
      if(fades.length!==1||fades[0].fade_in_duration!==Math.min(2000000,window.duration)||fades[0].fade_out_duration!==Math.min(4000000,window.duration))throw new Error('Sai fade-in 2 giây hoặc fade-out 4 giây.');
    }
  } else if(audio.length)throw new Error('Có audio ngoài kế hoạch.');
  return true;
}
