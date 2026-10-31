const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {execFile}=require('node:child_process');
class Thumbnails{
  constructor(folder){this.folder=folder;this.pending=new Map();this.cache=new Map();this.cacheBytes=0;this.queue=[];this.active=0;fs.mkdirSync(folder,{recursive:true});}
  get(m){
    const key=crypto.createHash('sha256').update([m.fingerprint,m.size,m.mtime].join(':')).digest('hex');
    if(this.cache.has(key)){const value=this.cache.get(key);this.cache.delete(key);this.cache.set(key,value);return Promise.resolve(value);}
    if(this.pending.has(key))return this.pending.get(key);
    const file=path.join(this.folder,key+'.jpg');
    const promise=new Promise((resolve,reject)=>{this.queue.push({m,file,resolve,reject});this.pump();}).then(value=>{this.cache.set(key,value);this.cacheBytes+=value.length*2;while(this.cacheBytes>24*1024*1024&&this.cache.size){const oldest=this.cache.keys().next().value;this.cacheBytes-=this.cache.get(oldest).length*2;this.cache.delete(oldest);}return value;}).finally(()=>this.pending.delete(key));
    this.pending.set(key,promise);return promise;
  }
  pump(){while(this.active<2&&this.queue.length){const task=this.queue.shift();this.active++;this.make(task.m,task.file).then(task.resolve,task.reject).finally(()=>{this.active--;this.pump();});}}
  async make(m,file){
    try{return 'data:image/jpeg;base64,'+(await fs.promises.readFile(file)).toString('base64');}catch{}
    const ffmpeg=fs.existsSync('C:/ffmpeg/bin/ffmpeg.exe')?'C:/ffmpeg/bin/ffmpeg.exe':'ffmpeg';
    const bytes=await new Promise((resolve,reject)=>execFile(ffmpeg,['-v','error',...(m.kind==='image'?[]:['-ss',String(Math.min(1,(m.duration||1)/4))]),'-i',m.path,'-frames:v','1','-vf','scale=320:180:force_original_aspect_ratio=decrease','-threads','1','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{windowsHide:true,timeout:20000,maxBuffer:2*1024*1024,encoding:'buffer'},(e,out)=>e?reject(Error('Không tạo được thumbnail.')):resolve(out)));
    if(!bytes.length)throw Error('Không có thumbnail.');await fs.promises.writeFile(file,bytes);return 'data:image/jpeg;base64,'+bytes.toString('base64');
  }
}
module.exports={Thumbnails};
