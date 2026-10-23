const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..','test-output','fixtures');
fs.mkdirSync(root,{recursive:true});
for(const f of ['footage/A','footage/B','music/hook','music/body','music/end','extras'])fs.mkdirSync(path.join(root,f),{recursive:true});
const ff='C:\\ffmpeg\\bin\\ffmpeg.exe';
const colors=['red','green','blue','yellow','purple','orange','cyan','white'];
for(let i=0;i<8;i++){
  const dest=i<4?`footage/A/A${i+1}.mp4`:i<6?`footage/B/B${i-3}.mp4`:i===6?'extras/intro.mp4':'extras/end.mp4';
  execFileSync(ff,['-y','-v','error','-f','lavfi','-i',`color=c=${colors[i]}:s=${i%2?'320x180':'180x320'}:d=5:r=10`,'-c:v','libx264','-pix_fmt','yuv420p',path.join(root,dest)],{windowsHide:true});
  fs.writeFileSync(path.join(root,dest).replace('.mp4','.txt'),'Nguồn thử nghiệm '+(i+1),'utf8');
}
for(let i=0;i<6;i++)execFileSync(ff,['-y','-v','error','-f','lavfi','-i',`sine=frequency=${220+i*80}:duration=40`,'-c:a','pcm_s16le',path.join(root,i===0?'music/hook/nhac.wav':i===5?'music/end/nhac.wav':`music/body/nhac${i}.wav`)],{windowsHide:true});
console.log(root);
execFileSync(ff,['-y','-v','error','-f','lavfi','-i','testsrc2=size=180x320:rate=30','-t','5','-c:v','libx264','-pix_fmt','yuv420p',path.join(root,'extras/seek-motion.mp4')],{windowsHide:true});
