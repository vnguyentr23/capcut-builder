const {test}=require('node:test');
const assert=require('node:assert/strict');
const {swapMusicHook}=require('../src/domain.cjs');
const slots=[{key:'hook',duration:7},{key:'body-block:0',duration:30}];
const draft={assignments:{hook:{fingerprint:'h',duration:40},'body-block:0':{fingerprint:'b',duration:20},'body-block:1':{fingerprint:'c',duration:60}}};
test('Swap retains other blocks and does not mutate input',()=>{
 const result=swapMusicHook(draft,slots,'body-block:0');
 assert.equal(result.hook,draft.assignments['body-block:0']);
 assert.equal(result['body-block:0'],draft.assignments.hook);
 assert.equal(result['body-block:1'],draft.assignments['body-block:1']);
 assert.equal(draft.assignments.hook.fingerprint,'h');
});
test('Reject short songs in either direction without partial swap',()=>{
 const original=JSON.stringify(draft);
 for(const durations of [[50,30],[7,50]])assert.throws(()=>swapMusicHook(draft,slots.map((s,i)=>({...s,duration:durations[i]})),'body-block:0'),/không đủ dài/);
 assert.equal(JSON.stringify(draft),original);
});
test('Reject missing slots, missing assignments and banned music',()=>{
 assert.throws(()=>swapMusicHook(draft,[], 'body-block:0'));
 assert.throws(()=>swapMusicHook({assignments:{}},slots,'body-block:0'));
 assert.throws(()=>swapMusicHook(draft,slots,'body-block:0',['b']));
});
