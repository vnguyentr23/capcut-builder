const {test}=require('node:test'),assert=require('node:assert/strict'),d=require('../src/domain.cjs');
test('Pattern sáu bước độc lập block ba: nhạc/chuyển cảnh chung biên, Intro sau block, End nối cuối',()=>{
 const draft=d.defaults();draft.transition.type='fade';draft.pattern=['A','B','C','D','E','F'];draft.body=Array.from({length:8},(_,i)=>({id:String(i),slotIndex:i+10}));
 const media=new Map(draft.body.map(b=>[b.id,{id:b.id,path:b.id,duration:5,width:1920,height:1080}]));
 draft.intro={id:'intro',path:'intro',duration:2};draft.introPosition='afterBlocks';draft.end={id:'end',path:'end',duration:4};
 const tl=d.timeline(draft,media),slots=d.musicSlots(draft,tl);
 assert.deepEqual(slots.map(s=>[s.start,s.duration]),[[0,15],[17,15],[32,14]]);
 assert.deepEqual(tl.transitions.map(t=>t.at),[15,32]);assert.equal(tl.clips[3].role,'intro');
 draft.pattern=['F','A'];assert.deepEqual(d.musicSlots(draft,d.timeline(draft,media)),slots);
 draft.introAfterBlocks=3;assert.equal(d.timeline(draft,media).clips.at(-2).role,'intro');
});
test('Migration block giữ khoảng chuyển cảnh cũ, Intro mặc định một block, chạy một lần',()=>{
 const draft=d.defaults();draft.transition.type='fade';delete draft.blockVersion;delete draft.blockSize;draft.transition.everyN=2;draft.introPosition='afterClips';draft.introAfter=7;
 d.migratePresets(draft);assert.equal(draft.blockSize,2);assert.equal(draft.introAfterBlocks,1);assert.equal(draft.introPosition,'afterBlocks');assert.equal(draft.transition.everyN,undefined);
 draft.blockSize=5;d.migratePresets(draft);assert.equal(draft.blockSize,5);
});
