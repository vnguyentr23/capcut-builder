const {uid}=require('./domain.cjs');
function attach(d,s,duration){
 const fades=d.materials.audio_fades||=[],old=new Set(fades.map(f=>f.id));
 const previous=fades.find(f=>(s.extra_material_refs||[]).includes(f.id));
 s.extra_material_refs=(s.extra_material_refs||[]).filter(id=>!old.has(id));
 const f={id:uid(),type:'audio_fade',fade_type:0,fade_in_duration:previous?.fade_in_duration||0,fade_out_duration:Math.min(duration,s.target_timerange.duration)};
 fades.push(f);s.extra_material_refs.push(f.id);
}
function remix(project,d){
 const rows=new Map();for(const r of project.ledger||[]){const prev=rows.get(r.block);if(!prev||r.newStart+r.duration>prev.newStart+prev.duration)rows.set(r.block,r);}
 const videos=d.tracks.filter(t=>t.type==='video').flatMap(t=>t.segments);
 const lastVideo=[...videos].sort((a,b)=>(b.target_timerange.start+b.target_timerange.duration)-(a.target_timerange.start+a.target_timerange.duration))[0];
 if(project.editor?.ending&&lastVideo&&![...rows.values()].some(r=>(r.segmentIds||[]).includes(lastVideo.id)))rows.set('ending',{segmentIds:[lastVideo.id]});
 // Old/imported drafts can lack complete ledger IDs. Resolve actual block ends too.
 for(const block of project.blocks||[]){
  if(!(block.duration>0))continue;
  const boundary=block.start+block.duration;
  const last=videos.filter(s=>s.target_timerange.start>=block.start&&s.target_timerange.start+s.target_timerange.duration<=boundary+2).sort((a,b)=>(b.target_timerange.start+b.target_timerange.duration)-(a.target_timerange.start+a.target_timerange.duration))[0];
  if(last&&!Array.from(rows.values()).some(r=>(r.segmentIds||[]).includes(last.id)))rows.set('boundary:'+boundary,{segmentIds:[last.id]});
 }
 const attached=new Set();
 for(const row of rows.values()){
  const clips=videos.filter(s=>row.segmentIds.includes(s.id)),last=clips.sort((a,b)=>(b.target_timerange.start+b.target_timerange.duration)-(a.target_timerange.start+a.target_timerange.duration))[0];
  if(!last||attached.has(last.id))continue;attached.add(last.id);attach(d,last,3000000);
  const end=last.target_timerange.start+last.target_timerange.duration;
  for(const t of d.tracks.filter(t=>t.type==='audio'&&t.name!=='Nhạc nhân bản'&&!require('./sound-effects.cjs').isTrack(t)))for(const s of t.segments)if(s.target_timerange.start>=last.target_timerange.start&&Math.abs(s.target_timerange.start+s.target_timerange.duration-end)<2)attach(d,s,3000000);
 }
}
module.exports={attach,remix};
