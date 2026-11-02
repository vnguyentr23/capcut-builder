const test=require('node:test'),assert=require('node:assert/strict'),promote=require('../src/promote-body.cjs'),{matches}=require('../src/body-pattern.cjs');
test('move into empty Hook preserves remaining pattern and clip edits',()=>{
 const d={hook:[],pattern:['A','B','C'],body:['A','B','C'].map((g,i)=>({id:g,groupId:g,slotIndex:i})),edits:{A:{start:2}}};
 const media=new Map(d.body.map(c=>[c.id,{fingerprint:c.id}]));
 const result=promote(d,media,0);assert.deepEqual(result.hook,[{id:'A',allowBody:false}]);assert.deepEqual(result.body.map(c=>c.id),['B','C']);assert(matches(result,[]));assert.deepEqual(result.edits,d.edits);assert.equal(d.body.length,3);
 d.hook.push({id:'A'});assert.throws(()=>promote(d,media,0),/đã có trong Hook/);
});
