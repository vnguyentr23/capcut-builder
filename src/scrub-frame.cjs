const fs=require('node:fs');const {execFile}=require('node:child_process');
async function scrubFrame(media,time){
 if(!media||!Number.isFinite(time)||time<0||!(media.duration>0))throw Error('Không đọc được vị trí video.');
 const at=Math.min(time,Math.max(0,media.duration-1/30)),ff=fs.existsSync('C:/ffmpeg/bin/ffmpeg.exe')?'C:/ffmpeg/bin/ffmpeg.exe':'ffmpeg';
 const bytes=await new Promise((resolve,reject)=>execFile(ff,['-v','error','-ss',String(at),'-i',media.path,'-frames:v','1','-vf','scale=480:480:force_original_aspect_ratio=decrease','-threads','1','-f','image2pipe','-vcodec','mjpeg','pipe:1'],{windowsHide:true,timeout:10000,maxBuffer:3*1024*1024,encoding:'buffer'},(e,out)=>e?reject(Error('Không đọc được khung hình video.')):resolve(out)));
 if(!bytes.length)throw Error('Không có khung hình tại vị trí này.');return {time:at,url:'data:image/jpeg;base64,'+bytes.toString('base64')};
}
module.exports={scrubFrame};
