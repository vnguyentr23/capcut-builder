const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const writer=require('../src/capcut-writer.cjs');const domain=require('../src/domain.cjs');
function fixture(root){
  const video=path.join(root,'clip.mp4'),audio=path.join(root,'song.mp3');fs.writeFileSync(video,'fixture');fs.writeFileSync(audio,'fixture');
  const draft=domain.defaults();draft.target=2;draft.blockSize=1;draft.pattern=['A'];draft.transition.type='none';draft.hook=[{id:'h'}];draft.body=[{id:'b'},{id:'c'}];
  const media=new Map(['h','b','c'].map((id,i)=>[id,{id,path:video,duration:5,width:i===1?1080:1920,height:i===1?1920:1080,fingerprint:id,source:'Nguồn tiếng Việt '+id}]));
  draft.assignments={hook:{path:audio,duration:20},'body-block:0':{path:audio,duration:20},'body-block:1':{path:audio,duration:20}};
  return domain.manifest(draft,{id:'test',name:'Test'},media);
}
test('Draft editable: timeline liền, scale chỉ 9:16, credit, volume, nhạc source0 và fade clamp',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-writer-'));try{
    const m=fixture(root),d=writer.build(m);writer.validate(d);const [video,text,audio]=d.tracks;
    assert.equal(d.version,360000);assert.equal(video.segments[1].clip.scale.x,1.4);assert.equal(video.segments[0].clip.scale.x,1);
    assert.deepEqual(video.segments.map(s=>s.target_timerange.start),[0,5000000,10000000]);
    assert.equal(text.segments.length,3);assert.equal(d.materials.texts[0].font_size,15);assert.equal(text.segments[0].clip.scale.x,.2);
    assert.ok(JSON.parse(d.materials.texts[0].content).text.includes('tiếng Việt'));
    assert.equal(audio.segments[0].target_timerange.start,3000000);assert.equal(audio.segments[1].target_timerange.start,5000000);
    assert.ok(audio.segments.every(s=>s.source_timerange.start===0&&s.volume===10**(-10/20)));
    assert.deepEqual(d.materials.audio_fades.map(f=>f.fade_out_duration),[2000000,4000000,4000000]);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Chuyển cảnh local gắn clip đi ra, không làm lệch nhạc/timeline',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-transition-'));try{const m=fixture(root);fs.writeFileSync(path.join(root,'config.json'),'{}');m.transitions=[{type:'local',after:'body:b',before:'body:c',duration:.35,resource:{path:root,name:'Mờ',effectId:'123'}}];const d=writer.build(m);assert.equal(d.materials.transitions[0].duration,350000);assert.ok(d.tracks[0].segments[1].extra_material_refs.includes(d.materials.transitions[0].id));assert.equal(d.duration,15000000);assert.throws(()=>writer.resolveTransition({type:'wipe'},[]),/Chưa có tài nguyên/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Cài draft: backup index nguyên vẹn, hai bản timeline giống nhau, trùng tên bị chặn',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-install-'));try{
  const m=fixture(root),index={all_draft_store:[{draft_id:'existing',draft_name:'Giữ nguyên'}],draft_ids:1};fs.writeFileSync(path.join(root,'root_meta_info.json'),JSON.stringify(index));
  const r=await writer.install(m,root,[],async()=>false);assert.equal(path.basename(r.path),m.name);assert.deepEqual(JSON.parse(fs.readFileSync(r.backup)),index);
  const after=JSON.parse(fs.readFileSync(path.join(root,'root_meta_info.json')));assert.equal(after.all_draft_store.length,2);assert.deepEqual(after.all_draft_store[1],index.all_draft_store[0]);
  const d=JSON.parse(fs.readFileSync(path.join(r.path,'draft_content.json')));assert.deepEqual(JSON.parse(fs.readFileSync(path.join(r.path,'Timelines',d.id,'draft_content.json'))),d);
  assert.equal(JSON.parse(fs.readFileSync(path.join(r.path,'Timelines','project.json'))).main_timeline_id,d.id);
  await assert.rejects(()=>writer.install(m,root,[],async()=>false),/đã có/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('CapCut đang mở hoặc index thay đổi: không commit, không đụng project cũ',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-race-'));try{const m=fixture(root),file=path.join(root,'root_meta_info.json');fs.writeFileSync(file,'{"all_draft_store":[],"draft_ids":0}');const original=fs.readFileSync(file);await assert.rejects(()=>writer.install(m,root,[],async()=>true),/đang mở/);assert.ok(fs.readFileSync(file).equals(original));let calls=0;await assert.rejects(()=>writer.install(m,root,[],async()=>{if(++calls===2)fs.appendFileSync(file,' ');return false;}),/vừa thay đổi/);assert.ok(!fs.readdirSync(root).some(n=>n===m.name||n.startsWith('.ccb-stage-')));}finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('Tiếng nhúng: không kế thừa cờ đã tách tiếng từ template',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-embedded-')),template=require('../src/capcut-template.json'),old=template.videoMaterial.extra_type_option;
 try{template.videoMaterial.extra_type_option=1;const m=fixture(root);m.clips[0].hasAudio=false;const d=writer.build(m);assert.ok(d.materials.videos.every(v=>v.extra_type_option===0&&v.has_sound_separated===false));assert.equal(d.materials.videos[0].has_audio,false);assert.equal(d.materials.videos[1].has_audio,true);assert.ok(d.tracks[0].segments.every(s=>s.volume===1));assert.equal(d.config.video_mute,false);assert.ok(!d.tracks.some(t=>t.name==='Âm thanh footage'));}finally{template.videoMaterial.extra_type_option=old;fs.rmSync(root,{recursive:true,force:true});}
});

test('Bỏ lời/Giữ lời gắn đúng clip và source range, giữ tiếng nhúng, không lọc video câm',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-vocal-'));try{const m=fixture(root);m.audio.forEach(a=>a.audioMode='original');m.clips[0].audioMode='removeVocals';m.clips[0].sourceStart=1;m.clips[1].audioMode='keepVocals';m.clips[2].audioMode='keepVocals';m.clips[2].hasAudio=false;const d=writer.build(m),v=d.materials.vocal_separations;assert.deepEqual(v.map(v=>v.choice),[1,2]);assert.deepEqual(v[0].time_range,{start:1000000,duration:5000000});assert.ok(d.tracks[0].segments[0].extra_material_refs.includes(v[0].id));assert.ok(d.tracks[0].segments[1].extra_material_refs.includes(v[1].id));assert.ok(d.materials.videos.every(v=>v.extra_type_option===0));assert.ok(v.every(v=>v.production_path===''&&v.final_algorithm==='vocal_separate'));}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('Nhạc mặc định tách lời, giữ lời và âm gốc bảo toàn timing/fade',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-music-vocal-'));try{assert.equal(domain.defaults().musicAudioMode,'removeVocals');const m=fixture(root);for(const [mode,choice] of [['removeVocals',1],['keepVocals',2],['original',0]]){m.audio.forEach(a=>a.audioMode=mode);m.audio[0].sourceStart=1;const d=writer.build(m),track=d.tracks.find(t=>t.type==='audio');assert.equal(d.materials.vocal_separations.length,choice?m.audio.length:0);track.segments.forEach((s,i)=>{assert.equal(s.source_timerange.start,Math.round(m.audio[i].sourceStart*1e6));assert.equal(s.target_timerange.duration,Math.round(m.audio[i].duration*1e6));if(choice){const v=d.materials.vocal_separations.find(v=>s.extra_material_refs.includes(v.id));assert.equal(v.choice,choice);assert.deepEqual(v.time_range,s.source_timerange);}});assert.equal(d.materials.audio_fades.length,m.audio.length);}}finally{fs.rmSync(root,{recursive:true,force:true});}});
test('Tắt tiếng chỉ clip được chọn, giữ nhạc và khả năng bật lại trong CapCut',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-mute-'));try{const m=fixture(root);m.clips[1].audioMode='mute';const d=writer.build(m),video=d.tracks.find(t=>t.type==='video');assert.deepEqual(video.segments.map(s=>s.volume),[1,0,1]);assert.equal(video.segments[1].last_nonzero_volume,1);assert.equal(d.materials.videos[1].has_audio,true);assert.equal(d.materials.videos[1].extra_type_option,0);assert.ok(!d.materials.vocal_separations.some(v=>video.segments[1].extra_material_refs.includes(v.id)));assert.ok(d.tracks.find(t=>t.type==='audio').segments.every(s=>s.volume>0));writer.validate(d);}finally{fs.rmSync(root,{recursive:true,force:true});}});
