const {test}=require('node:test');const assert=require('node:assert/strict');const d=require('../src/domain.cjs');
function fixture(){const draft=d.defaults();draft.transition.type='fade';draft.pattern=['A','B','C','D'];draft.hook=[{id:'h1'},{id:'h2'},{id:'h3'},{id:'h4'}];draft.body=Array.from({length:8},(_,i)=>({id:'b'+i}));draft.blockSize=4;const media=new Map([...draft.hook,...draft.body].map(c=>[c.id,{id:c.id,path:c.id,duration:10,width:1920,height:1080,fingerprint:c.id}]));return {draft,media};}
test('Bốn Hook vẫn một bài; End nối block cuối, fade ở cuối End, block4 đồng bộ nhạc và chuyển cảnh',()=>{
 const {draft,media}=fixture();draft.end={id:'end',path:'end',kind:'image',duration:5,width:1920,height:1080};const tl=d.timeline(draft,media),slots=d.musicSlots(draft,tl);
 assert.equal(slots.filter(s=>s.pool==='hook').length,1);assert.equal(slots[0].start,3);assert.equal(slots[0].duration,37);assert.equal(slots.length,3);assert.equal(slots.at(-1).duration,45);
 draft.assignments=Object.fromEntries(slots.map((s,i)=>[s.key,{path:'song'+i,fingerprint:'song'+i,duration:100}]));const m=d.manifest(draft,{id:'n'},media);assert.equal(m.audio.at(-1).start,80);assert.equal(m.audio.at(-1).duration,45);assert.equal(m.audio.at(-1).fadeOut,4);assert.equal(m.audio.filter(a=>a.pool==='hook').length,1);assert.deepEqual(tl.transitions.map(t=>t.at),[40,80]);
});
test('Chọn nhạc đủ dài, giữ khóa hợp lệ và thay khóa quá ngắn; thiếu bài dài phải báo lỗi',()=>{
 const {draft,media}=fixture(),tl=d.timeline(draft,media);const song=(id,duration)=>({id,path:id,fingerprint:id,duration});const hook=song('hook',60),short=song('short',20),one=song('one',80),two=song('two',90);
 draft.assignments={hook,'body-block:0':short,'body-block:1':two};const result=d.assignMusic(draft,tl,{hook:[hook],body:[short,one,two]});assert.equal(result.hook.id,'hook');assert.equal(result['body-block:1'].id,'two');assert.equal(result['body-block:0'].id,'one');assert.throws(()=>d.assignMusic(draft,tl,{hook:[hook],body:[short]},true),/đủ dài/);
});
test('Timeline căn khung 30fps giữ nhạc và chuyển cảnh trên cùng biên',()=>{
 const {draft,media}=fixture();for(const m of media.values())m.duration=10.01731;const tl=d.timeline(draft,media);for(const c of tl.clips){assert.ok(Math.abs(c.start*30-Math.round(c.start*30))<1e-6);assert.ok(Math.abs(c.duration*30-Math.round(c.duration*30))<1e-6);}const slots=d.musicSlots(draft,tl);assert.equal(slots[1].start,tl.clips[4].start);assert.equal(slots[2].start,tl.clips[8].start);
});
test('Migration v2 giữ bài Hook/Body, bỏ bài End riêng, không làm mất block đã khóa',()=>{const {draft}=fixture();draft.musicVersion=2;draft.assignments={hook:{id:'h'},'body-block:0':{id:'b'},end:{id:'e'}};d.migratePresets(draft);assert.deepEqual(draft.assignments,{hook:{id:'h'},'body-block:0':{id:'b'}});d.migratePresets(draft);assert.equal(draft.assignments['body-block:0'].id,'b');});
