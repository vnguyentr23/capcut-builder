const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFile}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile),{probe}=require('./media.cjs');
const ffmpeg=fs.existsSync('C:/ffmpeg/bin/ffmpeg.exe')?'C:/ffmpeg/bin/ffmpeg.exe':'ffmpeg';
async function prepare(manifest,cache){
  fs.mkdirSync(cache,{recursive:true});const files=new Map(),audio=[];
  for(const c of manifest.clips){
    if(c.kind==='image')continue;
    let entry=files.get(c.path);
    if(entry===undefined){
      const info=await probe(c.path);if(!info.streams?.some(s=>s.codec_type==='audio'))entry=null;
      else {
        const st=fs.statSync(c.path),duration=Number(info.format?.duration||c.sourceDuration);
        if(!(duration>0))throw Error('Không đọc được thời lượng âm thanh gốc: '+c.path);
        const key=crypto.createHash('sha256').update(JSON.stringify([c.path,st.size,st.mtimeMs,duration,'pcm-v1'])).digest('hex'),dest=path.join(cache,key+'.wav');
        if(!fs.existsSync(dest)){
          const temp=path.join(cache,key+'-'+crypto.randomUUID()+'.wav');
          try{await run(ffmpeg,['-hide_banner','-v','error','-nostdin','-copyts','-start_at_zero','-i',c.path,'-map','0:a:0','-vn','-af','aresample=async=1:first_pts=0,apad','-t',String(duration),'-ar','48000','-ac','2','-c:a','pcm_s16le',temp],{windowsHide:true,timeout:600000,maxBuffer:2*1024*1024});const check=await probe(temp);if(!check.streams?.some(s=>s.codec_type==='audio')||Number(check.format?.duration)<duration-.05)throw Error('Âm thanh trích xuất không đủ thời lượng.');fs.renameSync(temp,dest);}catch(e){throw Error('Không chuẩn bị được tiếng gốc “'+path.basename(c.path)+'”: '+e.message);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
        }
        entry={path:dest,sourceDuration:duration};
      }
      files.set(c.path,entry);
    }
    if(entry)audio.push({...entry,videoKey:c.key,name:'Tiếng gốc · '+path.basename(c.path),start:c.start,sourceStart:c.sourceStart||0,duration:c.duration,volume:1});
  }
  return {...manifest,footageAudio:audio};
}
module.exports={prepare};
