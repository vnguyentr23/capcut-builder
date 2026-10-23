const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const defaults=()=>({enabled:true,thresholdDb:-32,lowDb:-20,mode:'footage'});
function settings(draft){const s={...defaults(),...draft.ducking,mode:'footage'};delete s.minActive;delete s.hold;return s;}
function validate(draft){const s=settings(draft);if(typeof s.enabled!=='boolean'||!Number.isFinite(s.thresholdDb)||s.thresholdDb< -60||s.thresholdDb> -5||!Number.isFinite(s.lowDb)||s.lowDb< -60||s.lowDb>0)throw Error('Thiết lập tự hạ nhạc không hợp lệ.');return s;}
function merge(ranges){const out=[];for(const r of ranges.filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start)){const last=out.at(-1);if(last&&r.start<=last.end+1/60)last.end=Math.max(last.end,r.end);else out.push({...r});}return out;}
// Read only the selected source range; bounded PCM windows, no rendered video or temp audio.
async function levels(clip){
 const info=await require('./media.cjs').probe(clip.path);if(!info.streams?.some(s=>s.codec_type==='audio'))return [];
 const ff=fs.existsSync('C:/ffmpeg/bin/ffmpeg.exe')?'C:/ffmpeg/bin/ffmpeg.exe':'ffmpeg';
 return new Promise((resolve,reject)=>{const proc=spawn(ff,['-hide_banner','-v','error','-nostdin','-ss',String(clip.sourceStart||0),'-i',clip.path,'-t',String(clip.duration),'-map','0:a:0','-vn','-ac','1','-ar','8000','-c:a','pcm_f32le','-f','f32le','pipe:1'],{windowsHide:true});
  const bins=[];let pending=Buffer.alloc(0),sum=0,count=0,stderr='',timedOut=false;
  const timer=setTimeout(()=>{timedOut=true;proc.kill();},120000);
  proc.stdout.on('data',chunk=>{const bytes=Buffer.concat([pending,chunk]),limit=bytes.length-bytes.length%4;for(let i=0;i<limit;i+=4){const x=bytes.readFloatLE(i);sum+=Number.isFinite(x)?x*x:0;if(++count===800){bins.push(10*Math.log10(Math.max(sum/count,1e-12)));sum=0;count=0;}}pending=bytes.subarray(limit);});
  proc.stderr.on('data',b=>{stderr=(stderr+b.toString()).slice(-1500);});
  proc.on('error',e=>{clearTimeout(timer);reject(e);});proc.on('close',code=>{clearTimeout(timer);if(code!==0||timedOut)return reject(Error('Không phân tích được tiếng footage '+path.basename(clip.path)+': '+(timedOut?'quá thời gian':stderr)));if(count)bins.push(10*Math.log10(Math.max(sum/count,1e-12)));resolve(bins);});
 });
}
function activity(clip,bins,s){
 if(!bins.length)return [];
 const power=bins.reduce((sum,db)=>sum+10**(db/10),0)/bins.length;
 const rmsDb=10*Math.log10(Math.max(power,1e-12));
 return rmsDb>=s.thresholdDb?[{start:clip.start,end:clip.start+clip.duration}]:[];
}
function splitAudio(audio,ranges,s){
 const out=[];for(const a of audio){const finish=a.start+a.duration,fade=Math.min(a.fadeOut||0,a.duration),fadeStart=finish-fade;
  const relevant=ranges.filter(r=>r.start<finish&&r.end>a.start),cuts=new Set([a.start,finish]);if(fade>0)cuts.add(fadeStart);
  for(const r of relevant)for(const t of [r.start,r.end]){const q=Math.round(t*30)/30;if(q>a.start+1e-7&&q<fadeStart-1e-7)cuts.add(q);}
  const points=[...cuts].sort((x,y)=>x-y);
  for(let i=0;i<points.length-1;i++){const start=points[i],end=points[i+1];if(end-start<1e-7)continue;
   // Keep the final fade whole. If speech overlaps it, hold the lower level through the fade.
   const ducked=relevant.some(r=>r.start<end-1e-7&&r.end>start+1e-7),base=a.volumeDb??20*Math.log10(a.volume),db=ducked?Math.min(base,s.lowDb):base;
   out.push({...a,start,duration:end-start,sourceStart:(a.sourceStart||0)+start-a.start,volumeDb:db,volume:10**(db/20),fadeOut:fade>0&&i===points.length-2?fade:0,ducked});
  }
 }
 const compact=[];for(const piece of out){const prev=compact.at(-1);if(prev&&prev.key===piece.key&&prev.path===piece.path&&prev.audioMode===piece.audioMode&&prev.volume===piece.volume&&!prev.fadeOut&&Math.abs(prev.start+prev.duration-piece.start)<1e-7&&Math.abs(prev.sourceStart+prev.duration-piece.sourceStart)<1e-7){prev.duration+=piece.duration;prev.fadeOut=piece.fadeOut;}else compact.push({...piece});}return compact;
}
async function apply(manifest,{analyze=levels,progress=()=>{}}={}){
 const s=validate(manifest.draft);if(!s.enabled||!manifest.audio.length)return manifest;
 const clips=manifest.clips.filter(c=>c.kind!=='image'&&c.audioMode!=='mute'&&c.hasAudio!==false&&manifest.audio.some(a=>a.start<c.start+c.duration&&a.start+a.duration>c.start));
 const results=new Array(clips.length),cache=new Map();let cursor=0,done=0;
 await Promise.all(Array.from({length:Math.min(2,clips.length)},async()=>{while(cursor<clips.length){const index=cursor++,c=clips[index],key=JSON.stringify([c.path,c.sourceStart,c.duration]);if(!cache.has(key))cache.set(key,analyze(c));results[index]=activity(c,await cache.get(key),s);progress({done:++done,total:clips.length,file:'Phân tích tiếng: '+path.basename(c.path)});}}));
 const ranges=merge(results.flat());manifest.audio=splitAudio(manifest.audio,ranges,s);manifest.ducking={method:'footage-rms',settings:s,ranges,analyzedClips:clips.length,filteredClips:clips.filter(c=>['keepVocals','removeVocals'].includes(c.audioMode)).length};return manifest;
}
module.exports={defaults,settings,validate,levels,merge,activity,splitAudio,apply};
