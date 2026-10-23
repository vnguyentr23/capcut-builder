const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {Store}=require('../src/store.cjs');const {inspect}=require('../src/media.cjs');const {importHook}=require('../src/hook-import.cjs');const d=require('../src/domain.cjs');const writer=require('../src/capcut-writer.cjs');
test('Hook ngoài thư viện: nhập, chống trùng bản sao, giữ sau tải lại và cảnh báo lịch sử',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-hook-')),store=new Store(path.join(root,'db'));try{
  const s=store.create('External'),file=path.join(root,'intro.mp4');
  require('node:child_process').execFileSync(fs.existsSync('C:/ffmpeg/bin/ffmpeg.exe')?'C:/ffmpeg/bin/ffmpeg.exe':'ffmpeg',['-v','error','-f','lavfi','-i','color=s=64x64:d=1','-c:v','libx264',file],{windowsHide:true});
  const r=await importHook(s,[file],0,store);assert.equal(r.added,1);assert.equal(s.groups.length,0);store.save(s);assert.equal(store.hydrate(store.get(s.id)).size,1);
  const copy=path.join(root,'copy.mp4');fs.copyFileSync(file,copy);const duplicate=await importHook(s,[copy,'bad.jpg'],0,store);assert.equal(duplicate.added,0);assert.equal(duplicate.warnings.length,2);
  store.archiveDraft(s);const later=store.create('Another');assert.equal(store.blocked(later.id,'later').size,0);s.draft=d.defaults();assert.equal((await importHook(s,[file],0,store)).added,1);assert.ok(store.blocked(s.id,s.draft.id).has(store.media(s.draft.hook[0].id).fingerprint));
 }finally{store.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('Ảnh kết thúc có thời lượng riêng, xuất photo editable đúng thời gian và nhạc End',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-photo-')),store=new Store(path.join(root,'db'));try{
  const file=path.join(root,'end.png');fs.writeFileSync(file,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS1sAAAAASUVORK5CYII=','base64'));
  const photo=await inspect(file,store);assert.equal(photo.kind,'image');assert.equal(photo.duration,5);assert.equal(photo.width,1);
  const draft=d.defaults();draft.end={...photo,duration:8};draft.transition.type='none';draft.assignments['body-block:0']={path:file,duration:20};const m=d.manifest(draft,{id:'n'},new Map());assert.equal(m.duration,8);assert.equal(m.audio[0].duration,8);
  const out=writer.build(m);assert.equal(out.materials.videos[0].type,'photo');assert.equal(out.materials.videos[0].has_audio,false);assert.equal(out.tracks[0].segments[0].target_timerange.duration,8000000);
 }finally{store.close();fs.rmSync(root,{recursive:true,force:true});}
});
