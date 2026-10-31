const {blockIndices}=require('./ui/body-layout.js');
const crypto = require('node:crypto');
const path = require('node:path');
const uid = () => crypto.randomUUID();
function defaults() {
  return {id:uid(), name:'Dự án mới', target:58, pinPriority:true, spreadScarce:true, pattern:[], hook:[], body:[], intro:null, end:null,
    introPosition:'afterHook', introAfterBlocks:1, blockSize:3, blockVersion:1, shortClipFill:{enabled:false,threshold:5}, music:{hook:'',body:'',end:''}, assignments:{},
    endEffect:{enabled:false,duration:3,resource:null}, transition:{type:'none',duration:0.35}, vertical:{scale:1.4},
    text:{font:'Arial',size:15,scale:0.2,marginLeft:50,marginBottom:50,color:'#ffffff',opacity:1,stroke:2,strokeColor:'#000000',shadow:true,alignment:'left'},
    musicAlignment:'start', hookDelay:3, fade:4, destination:'', mode:'capcut', ducking:require('./ducking.cjs').defaults(),audioVolumeDb:-10,musicAudioMode:'removeVocals',presetVersion:3,writerVersion:1,musicVersion:3};
}
function migratePresets(draft){
  draft.musicAlignment??='start';
  draft.pinPriority??=true;
  draft.spreadScarce??=true;
  draft.endEffect={enabled:false,duration:3,resource:null,...draft.endEffect};
  draft.ducking={...require('./ducking.cjs').defaults(),...draft.ducking};
  draft.musicAudioMode??='removeVocals';
  draft.shortClipFill={enabled:false,threshold:5,...draft.shortClipFill};
  if((draft.musicVersion||0)<2){
    const assignments={};for(const key of ['hook','end'])if(draft.assignments?.[key])assignments[key]=draft.assignments[key];
    const length=Math.max(1,draft.pattern?.length||1);
    (draft.body||[]).forEach((b,i)=>{const key='body-block:'+Math.floor((b.slotIndex??i)/length);if(!assignments[key]&&draft.assignments?.['body:'+b.id])assignments[key]=draft.assignments['body:'+b.id];});
    draft.assignments=assignments;draft.musicVersion=2;
  }
  if((draft.musicVersion||0)<3){delete draft.assignments.end;draft.musicVersion=3;}
  if(!draft.writerVersion){draft.mode='capcut';draft.writerVersion=1;}
  draft.transition??=defaults().transition;
  if(!draft.blockVersion){
    draft.blockSize=Number.isInteger(draft.transition.everyN)&&draft.transition.everyN>0?draft.transition.everyN:3;
    draft.introAfterBlocks=1;
    if(draft.introPosition==='afterClips')draft.introPosition='afterBlocks';
    delete draft.introAfter;delete draft.transition.everyN;draft.blockVersion=1;
  }
  if(draft.presetVersion>=3)return draft;
  if(!(draft.presetVersion>=2)){
    draft.vertical={scale:1.4};
    draft.text={...defaults().text,...draft.text,size:15,scale:0.2,marginLeft:50,marginRight:50};
    delete draft.audioVolume;draft.audioVolumeDb=-10;
  }
  draft.text.marginBottom=draft.text.marginBottom??draft.text.marginRight??50;
  draft.text.marginLeft=draft.text.marginLeft??50;
  draft.text.alignment='left';
  delete draft.text.x;delete draft.text.y;delete draft.text.marginRight;
  draft.presetVersion=3;return draft;
}
const dbToGain=db=>10**(db/20);
function textLayout(preset){return {...structuredClone(preset),alignment:'left',bounds:{left:preset.marginLeft,bottom:1080-preset.marginBottom,maxWidth:1920-preset.marginLeft,maxHeight:1080-preset.marginBottom,anchor:'bottom-left',unit:'canvas-px',overflow:'wrap-up'}};}
function nameErrors(name) {
  const errors=[];
  if (!name?.trim()) errors.push('Tên dự án không được rỗng.');
  if (name !== name?.trim() || /[. ]$/.test(name||'')) errors.push('Tên có dấu chấm hoặc khoảng trắng ở đầu/cuối.');
  if (/[<>:"/\\|?*\x00-\x1f]/.test(name||'')) errors.push('Tên chứa ký tự Windows không hợp lệ.');
  if (/^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(name||'')) errors.push('Tên dành riêng của Windows.');
  if ((name||'').length>100) errors.push('Tên tối đa 100 ký tự.');
  return errors;
}
function fixName(name, exists=()=>false) {
  let s=(name||'').replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').trim().replace(/[. ]+$/g,'').slice(0,90).replace(/[. ]+$/g,'')||'Dự án mới';
  if (/^(CON|PRN|AUX|NUL|COM[1-9¹²³]|LPT[1-9¹²³])(?:\.|$)/i.test(s)) s='Dự án '+s;
  let result=s,n=2; while(exists(result)) result=`${s} (${n++})`; return result;
}
function generate(draft,groups,media,used) {
  const result=require('./selection.cjs').selectBody(draft,groups,media,used,{partial:true});if(!result.body.length)throw Error('Không còn footage hợp lệ để tạo Body.');draft.bodyPattern=[...draft.pattern];return result.body;
}
function clipRange(draft,m){
  const trim=draft.trims?.[m.id],fps=30;
  if(!trim||m.kind==='image')return {sourceStart:0,duration:Number(m.duration)>0?Math.max(1,Math.round(Number(m.duration)*fps))/fps:0};
  const {start,end}=trim;
  if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>m.duration+1e-7||end<=start)throw Error('Điểm cắt không hợp lệ: '+(m.name||m.path));
  const first=Math.round(start*fps),last=Math.min(Math.floor(m.duration*fps+1e-7),Math.round(end*fps));
  if(last<=first)throw Error('Đoạn cắt phải dài ít nhất 1 khung hình: '+(m.name||m.path));
  return {sourceStart:first/fps,duration:(last-first)/fps};
}
function timeline(draft,media) {
  let clips=[], time=0,frames=0;const fps=30,bodyBlocks=blockIndices(draft);
  const add=(m,role,index)=>{
    if(!m) throw Error('Footage đã mất khỏi thư viện. Hãy quét lại và tạo lại Body.');
    const range=clipRange(draft,m),duration=range.duration,frameCount=Math.round(duration*fps);
    const vertical=m.width>0&&m.height>0&&Math.abs(m.width/m.height-9/16)<0.02;
    clips.push({key:role==='body'?`body:${m.id}`:`${role}:${index}`,role,mediaId:m.id,path:m.path,fingerprint:m.fingerprint,
      audioMode:draft.audioModes?.[m.id]||'original',kind:m.kind||'video',start:time,duration,sourceStart:range.sourceStart,sourceDuration:m.duration,width:m.width,height:m.height,source:m.source||'',
      transform:vertical?structuredClone(draft.vertical):null,text:m.source?textLayout(draft.text):null});frames+=frameCount;time=frames/fps;
  };
  if(draft.intro&&draft.introPosition==='beforeHook') add(draft.intro,'intro',0);
  draft.hook.forEach((h,i)=>add(media.get(h.id),'hook',i));
  if(draft.intro&&draft.introPosition==='afterHook') add(draft.intro,'intro',0);
  draft.body.forEach((b,i)=>{add(media.get(b.id),'body',i);if(draft.intro&&draft.introPosition==='afterBlocks'&&bodyBlocks[i]===draft.introAfterBlocks-1&&(i===draft.body.length-1||bodyBlocks[i+1]!==bodyBlocks[i])) add(draft.intro,'intro',0);});
  if(draft.end) add(draft.end,'end',0);
  const body=clips.filter(c=>c.role==='body'), transitions=[];
  if(draft.transition.type!=='none'&&Number.isInteger(draft.blockSize)&&draft.blockSize>0) body.forEach((c,i)=>{
    if(i+1<body.length&&bodyBlocks[i+1]!==bodyBlocks[i]) {
      const next=clips[clips.indexOf(c)+1];
      if(next) transitions.push({after:c.key,before:next.key,at:c.start+c.duration,type:draft.transition.type,duration:draft.transition.duration,...(draft.transition.type==='local'?{resource:structuredClone(draft.transition.resource)}:{})});
    }
  });
  const lastHook=clips.findLast(c=>c.role==='hook');
  if(draft.transition.type!=='none'&&lastHook){const next=clips[clips.indexOf(lastHook)+1];if(next)transitions.unshift({after:lastHook.key,before:next.key,at:lastHook.start+lastHook.duration,type:draft.transition.type,duration:draft.transition.duration,...(draft.transition.type==='local'?{resource:structuredClone(draft.transition.resource)}:{})});}
  return {clips,transitions,duration:time};
}
function musicSlots(draft,tl) {
  const slots=[],hook=tl.clips.filter(c=>c.role==='hook');
  if(hook.length) {
    const duration=hook.reduce((n,c)=>n+c.duration,0)-draft.hookDelay;
    if(duration>0) slots.push({key:'hook',pool:'hook',start:hook[0].start+draft.hookDelay,duration});
  }
  const blocks=new Map(),bodyBlocks=blockIndices(draft);
  tl.clips.filter(c=>c.role==='body').forEach((c,i)=>{
    const index=bodyBlocks[i],key='body-block:'+index;
    if(!blocks.has(key))blocks.set(key,{key,pool:'body',start:c.start,duration:0,windows:[]});
    const b=blocks.get(key),last=b.windows.at(-1);
    if(last&&Math.abs(last.start+last.duration-c.start)<1e-7)last.duration+=c.duration;
    else b.windows.push({start:c.start,duration:c.duration,sourceStart:b.duration});
    b.duration+=c.duration;
  });
  const ending=tl.clips.find(c=>c.role==='end');
  if(ending){
    let b=[...blocks.values()].at(-1);
    if(!b){b={key:'body-block:0',pool:'body',start:ending.start,duration:0,windows:[]};blocks.set(b.key,b);}
    const last=b.windows.at(-1);
    if(last&&Math.abs(last.start+last.duration-ending.start)<1e-7)last.duration+=ending.duration;
    else b.windows.push({start:ending.start,duration:ending.duration,sourceStart:b.duration});
    b.duration+=ending.duration;
  }
  slots.push(...blocks.values());
  return slots;
}
function assignMusic(draft,tl,pools,rerandom=false) {
  const slots=musicSlots(draft,tl), result={}, claimed=new Map(), byKey=new Map(slots.map(s=>[s.key,s]));
  if(!rerandom) for(const s of slots) {
    const old=draft.assignments[s.key];
    if(old&&!(draft.musicExcluded||[]).includes(old.fingerprint)&&old.duration+1e-7>=s.duration) { if(claimed.has(old.fingerprint)) throw Error('Nhạc đã khóa bị trùng. Hãy bấm random lại.');result[s.key]=old;claimed.set(old.fingerprint,s.key); }
  }
  const locked=new Set(Object.keys(result));
  const shuffle=items=>{for(let i=items.length-1;i>0;i--){const j=crypto.randomInt(i+1);[items[i],items[j]]=[items[j],items[i]];}return items;};
  const candidates=new Map(slots.map(s=>[s.key,shuffle([...new Map((pools[s.pool]||[]).filter(m=>m.duration+1e-7>=s.duration&&!m.error&&!(draft.musicExcluded||[]).includes(m.fingerprint)).map(m=>[m.fingerprint,m])).values()])]));
  function match(key,seen) {
    for(const m of candidates.get(key)||[]) {
      if(seen.has(m.fingerprint)) continue; seen.add(m.fingerprint);
      const owner=claimed.get(m.fingerprint);
      if(owner&&locked.has(owner)) continue;
      if(!owner||match(owner,seen)) {claimed.set(m.fingerprint,key);result[key]=m;return true;}
    } return false;
  }
  for(const s of slots.filter(s=>!locked.has(s.key)).sort((a,b)=>candidates.get(a.key).length-candidates.get(b.key).length))
    if(!match(s.key,new Set())) throw Error(`Không đủ nhạc khác nhau và đủ dài cho ${slots.length} đoạn. Thiếu tại ${byKey.get(s.key).pool}. Không tự lặp bài.`);
  return result;
}
function manifest(draft,niche,media) {
  const tl=timeline(draft,media);
  return {format:'ccb-manifest',version:1,mode:'dry-run',capcutCompatible:false,projectId:draft.id,name:draft.name,nicheId:niche.id,nicheName:niche.name,
    endEffect:require('./end-effect.cjs').timing(draft.endEffect,tl.duration),
    canvas:{width:1920,height:1080,fps:30},timeUnit:'seconds',...tl,
    audio:musicSlots(draft,tl).flatMap(s=>{
      const m=draft.assignments[s.key],total=Math.min(s.duration,m?.duration||0);
      return (s.windows||[{start:s.start,duration:s.duration,sourceStart:0}]).flatMap(w=>{
        const duration=Math.min(w.duration,total-w.sourceStart);if(duration<=0)return [];
        return [{key:s.key,pool:s.pool,path:m?.path||'',fingerprint:m?.fingerprint||'',start:w.start,sourceStart:w.sourceStart,duration,fadeOut:w.sourceStart+duration>=total-1e-7?Math.min(draft.fade,duration):0,volume:dbToGain(draft.audioVolumeDb),volumeDb:draft.audioVolumeDb,audioMode:draft.musicAudioMode??'removeVocals'}];
      });
    }),draft:structuredClone(draft),createdAt:new Date().toISOString()};
}
function swapMusicHook(draft, slots, key, excluded=[]) {
  const hook=slots.find(s=>s.key==='hook'),body=slots.find(s=>s.key===key);
  if(!key.startsWith('body-block:')||!body||!hook)throw Error('Cần có Hook và block Body để đổi nhạc.');
  const a=draft.assignments.hook,b=draft.assignments[key];
  if(!a||!b)throw Error('Hãy gán nhạc cho cả Hook và block trước khi đổi.');
  if(a.fingerprint===b.fingerprint||[a,b].some(m=>excluded.includes(m.fingerprint)))throw Error('Bài nhạc bị trùng hoặc đã bị loại khỏi ngách.');
  if(!Number.isFinite(b.duration)||b.duration+1e-7<hook.duration)throw Error('Bài của block không đủ dài cho Hook. Giữ nguyên hai bài.');
  if(!Number.isFinite(a.duration)||a.duration+1e-7<body.duration)throw Error('Bài của Hook không đủ dài cho block này. Giữ nguyên hai bài.');
  return {...draft.assignments,hook:b,[key]:a};
}
module.exports={swapMusicHook,uid,defaults,migratePresets,dbToGain,textLayout,nameErrors,fixName,generate,clipRange,timeline,musicSlots,assignMusic,manifest};
