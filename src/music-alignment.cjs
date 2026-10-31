const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{execFile}=require('node:child_process');
function endpoint(log,duration){
 const starts=[...log.matchAll(/silence_start:\s*([\d.]+)/g)],ends=[...log.matchAll(/silence_end:\s*([\d.]+)/g)];
 const start=Number(starts.at(-1)?.[1]),end=Number(ends.at(-1)?.[1]);
 if(Number.isFinite(start)&&Number.isFinite(end)&&end>=duration-.15&&duration-start>=.5)return Math.min(duration,start+.08);
 return duration;
}
async function analyze(file,store){
 const st=await fs.promises.stat(file),key='music-end-v1:'+crypto.createHash('sha256').update(JSON.stringify([path.resolve(file),st.size,st.mtimeMs])).digest('hex');
 const cached=store?.pref(key);if(cached)return JSON.parse(cached);
 const info=await require('./media.cjs').probe(file),duration=Number(info.format?.duration);if(!Number.isFinite(duration)||duration<=0||!info.streams?.some(s=>s.codec_type==='audio'))throw Error('Không đọc được nhạc: '+path.basename(file));
 const ff=fs.existsSync('C:/ffmpeg/bin/ffmpeg.exe')?'C:/ffmpeg/bin/ffmpeg.exe':'ffmpeg';
 const log=await new Promise((resolve,reject)=>execFile(ff,['-hide_banner','-nostdin','-i',file,'-map','0:a:0','-af','silencedetect=noise=-55dB:d=0.5','-f','null','-'],{windowsHide:true,timeout:180000,maxBuffer:16*1024*1024},(e,out,err)=>e?reject(Error('Không phân tích được cuối bài: '+path.basename(file))):resolve(err)));
 const result={duration,end:endpoint(log,duration)};if(result.end<=.1)throw Error('Bài nhạc gần như im lặng: '+path.basename(file));store?.pref(key,JSON.stringify(result));return result;
}
async function apply(manifest,{store,progress=()=>{},analyzeEnd=analyze}={}){
 const mode=manifest.draft.musicAlignment||'start';if(!['start','audibleEnd'].includes(mode))throw Error('Chế độ căn nhạc không hợp lệ.');if(mode==='start')return manifest;
 const groups=new Map();for(const a of manifest.audio){const key=a.key??a.path;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(a);}
 let done=0;for(const pieces of groups.values()){
  const first=pieces[0],result=await analyzeEnd(first.path,store),span=Math.max(...pieces.map(a=>(a.sourceStart||0)+a.duration));
  if(result.end+1e-6<span)throw Error('Phần nhạc có tiếng của “'+path.basename(first.path)+'” chỉ dài '+result.end.toFixed(1)+' giây, ngắn hơn đoạn cần '+span.toFixed(1)+' giây. Hãy chọn bài khác.');
  const offset=Math.max(0,result.end-span);for(const a of pieces){a.sourceStart=(a.sourceStart||0)+offset;a.audibleEnd=result.end;}
  progress({done:++done,total:groups.size,file:'Căn cuối nhạc: '+path.basename(first.path)});
 }return manifest;
}
module.exports={endpoint,analyze,apply};
