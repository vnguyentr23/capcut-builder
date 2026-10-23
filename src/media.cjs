const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const crypto=require('node:crypto');
const {execFile}=require('node:child_process');
const videoExt=new Set(['.mp4','.mov','.mkv','.avi','.webm','.m4v','.mts']);
const audioExt=new Set(['.mp3','.wav','.m4a','.aac','.flac','.ogg','.wma']);
const ffprobe=fs.existsSync('C:\\ffmpeg\\bin\\ffprobe.exe')?'C:\\ffmpeg\\bin\\ffprobe.exe':'ffprobe';
async function walk(folder,kind='video') {
  const out=[],ext=kind==='audio'?audioExt:videoExt;
  async function visit(p){for(const e of await fsp.readdir(p,{withFileTypes:true})){if(e.isSymbolicLink())continue;const full=path.join(p,e.name);if(e.isDirectory())await visit(full);else if(ext.has(path.extname(e.name).toLowerCase()))out.push(full);}}
  await visit(folder);return out.sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
}
function probe(file){return new Promise((resolve,reject)=>execFile(ffprobe,['-v','error','-show_format','-show_streams','-of','json',file],{windowsHide:true,timeout:25000,maxBuffer:4*1024*1024},(e,out)=>{if(e)reject(Error('Không đọc được metadata bằng ffprobe.'));else{try{resolve(JSON.parse(out));}catch{reject(Error('Metadata không hợp lệ.'));}}}));}
function hash(file){return new Promise((resolve,reject)=>{const h=crypto.createHash('sha256'),s=fs.createReadStream(file);s.on('data',b=>h.update(b));s.on('error',reject);s.on('end',()=>resolve(h.digest('hex')));});}
async function inspect(file,store) {
  file=await fsp.realpath(file);const st=await fsp.stat(file),cached=store.cached(file,st.size,st.mtimeMs);if(cached&&!cached.error){if(cached.createdAt!==st.birthtimeMs){cached.createdAt=st.birthtimeMs;store.putMedia(cached);}return cached;}
  const fingerprint=await hash(file);let info,error='';try{info=await probe(file);}catch(e){error=e.message;}
  const v=info?.streams?.find(s=>s.codec_type==='video'),rotation=Number(v?.side_data_list?.find(x=>x.rotation!==undefined)?.rotation||v?.tags?.rotate||0);
  let width=v?.width||0,height=v?.height||0;if(Math.abs(rotation)%180===90)[width,height]=[height,width];
  let source='';try{source=(await fsp.readFile(file.replace(/\.[^.]+$/,'.txt'),'utf8')).trim().slice(0,2000);}catch{}
  const id=crypto.createHash('sha256').update(file.toLowerCase()+'|'+st.size+'|'+fingerprint).digest('hex');
  const previous=store.media(id);
  const kind=['.png','.jpg','.jpeg','.webp','.bmp'].includes(path.extname(file).toLowerCase())?'image':'video';
  const m={kind,id,path:file,name:path.basename(file),size:st.size,mtime:st.mtimeMs,createdAt:st.birthtimeMs,fingerprint,duration:kind==='image'?5:Number(info?.format?.duration||v?.duration||0),width,height,source:previous?.source??source,error};
  store.putMedia(m);return m;
}
async function scan(folder,kind,store,onProgress=()=>{}) {
  const files=await walk(folder,kind),result=new Array(files.length);let next=0,done=0;
  await Promise.all(Array.from({length:Math.min(3,files.length)},async()=>{while(next<files.length){const i=next++;try{result[i]=await inspect(files[i],store);}catch(e){result[i]={path:files[i],error:e.message};}done++;onProgress({done,total:files.length,file:path.basename(files[i])});}}));
  return result;
}
module.exports={walk,inspect,scan,hash,probe};
