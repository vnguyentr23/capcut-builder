const {uid}=require('./domain.cjs');
const us=n=>Math.round(n*1e6);
function assignments(p,s){return p.assignments.flatMap(a=>{const b=p.blocks?.[a.block];if(!b)return a.block===undefined?[{...a,fadeOut:Math.min(us(s.fade??4),a.duration)}]:[];const delay=b.hook?Math.min(us(s.hookDelay??3),b.duration):0,duration=b.duration-delay;if(duration<=0)return [];return [{...a,start:b.start+delay,duration,fadeOut:Math.min(us(s.fade??4),duration)}];});}
function layout(project,s){
 if(project._introLayout)return project;
 const p=structuredClone(project);p.assignments=assignments(p,s);p._introLayout=true;
 if(!s.intro)return p;
 const body=p.blocks.filter(b=>!b.hook),index=s.introPosition==='afterBlocks'?Math.min(body.length,Math.max(1,s.introAfterBlocks||1))-1:-1;
 const anchor=index>=0?body[index]:p.blocks.find(b=>b.hook);const at=anchor?anchor.start+anchor.duration:0,len=us(s.intro.duration),d=p.draft,t=require('./capcut-template.json');
 // Insert only at block boundaries; no clip or music segment may straddle the insertion.
 for(const track of d.tracks)for(const seg of track.segments){const r=seg.target_timerange;if(r.start<at&&r.start+r.duration>at+1)throw Error('Intro nằm giữa một đoạn nguồn. Hãy kiểm tra ranh giới block.');if(r.start>=at){r.start+=len;if(seg.render_timerange?.duration>0)seg.render_timerange.start+=len;}}
 for(const a of p.assignments)if(a.start>=at)a.start+=len;
 for(const b of p.blocks)if(b.start>=at)b.start+=len;
 for(const r of p.ledger||[])if(r.newStart>=at){r.newStart+=len;if(r.end!==undefined)r.end+=len;}
 const m={...structuredClone(t.videoMaterial),id:uid(),unique_id:uid(),path:s.intro.path,material_name:s.intro.name,duration:len,width:s.intro.width,height:s.intro.height,type:'video',has_audio:s.intro.hasAudio!==false};
 const seg={...structuredClone(t.videoSegment),id:uid(),material_id:m.id,source_timerange:{start:0,duration:len},target_timerange:{start:at,duration:len},extra_material_refs:[],common_keyframes:[],keyframe_refs:[],volume:1,last_nonzero_volume:1,speed:1};
 d.materials.videos.push(m);d.tracks.find(t=>t.type==='video').segments.push(seg);d.tracks.find(t=>t.type==='video').segments.sort((a,b)=>a.target_timerange.start-b.target_timerange.start);d.duration+=len;
 return p;
}
module.exports={assignments,layout};
