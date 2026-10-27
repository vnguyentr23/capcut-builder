const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {extractTransitions,localResource}=require('../src/transitions.cjs');
const {defaults,timeline}=require('../src/domain.cjs');
test('Danh sách chỉ nhận metadata chuyển cảnh type 19 và gói đã tải, chặn đường dẫn bất thường',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-trans-'));
  try{const a={effect_type:19,effect_id:'123',id:'456',title:'Chớp',md5:'a'.repeat(32),extra:'{"is_vip":true}'};
    const list=extractTransitions({data:{effect_item_list:[{common_attr:a},{common_attr:{...a,effect_type:97}}]}});assert.equal(list.length,1);assert.equal(localResource(a,root),null);
    const folder=path.join(root,a.effect_id,a.md5);fs.mkdirSync(folder,{recursive:true});fs.writeFileSync(path.join(folder,'config.json'),'{}');
    const r=localResource(a,root);assert.equal(r.name,'Chớp');assert.equal(r.isPro,true);assert.equal(r.path,folder);assert.equal(localResource({...a,effect_id:'../x'},root),null);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Khoảng N dựa trên số slot Body, local resource đi theo transition; không thêm ở cuối khi không còn clip',()=>{
 const d=defaults();d.pattern=['A','B'];d.body=Array.from({length:5},(_,i)=>({id:''+i,groupId:'A'}));
 const m=new Map(d.body.map(b=>[b.id,{...b,duration:5,width:1920,height:1080,path:b.id}]));
 d.blockSize=2;d.transition={type:'local',duration:.35,resource:{effectId:'123',name:'Chớp',path:'cache',effectType:19}};
 let t=timeline(d,m);d.pattern=['A','A','B'];assert.deepEqual(timeline(d,m).transitions,t.transitions);assert.deepEqual(t.transitions.map(x=>x.at),[10,20]);assert.equal(t.transitions[0].resource.effectId,'123');
 d.body.pop();t=timeline(d,m);assert.equal(t.transitions.length,1);d.end={id:'e',duration:3,path:'outro'};t=timeline(d,m);assert.equal(t.transitions.length,1);
});

test('New machine resolves old effect paths and discovers downloaded transitions without HTTP cache',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-new-machine-'));try{const effect=path.join(root,'Cache','effect','123','a'.repeat(32));fs.mkdirSync(effect,{recursive:true});fs.writeFileSync(path.join(effect,'config.json'),'{}');const project=path.join(root,'Projects','com.lveditor.draft','sample');fs.mkdirSync(project,{recursive:true});fs.writeFileSync(path.join(project,'draft_content.json'),JSON.stringify({materials:{transitions:[{effect_id:'123',name:'Warm',path:'Z:/old-machine/effect/123/old'}]}}));const {resolveEffect,scanTransitions}=require('../src/transitions.cjs');assert.equal(resolveEffect({effectId:'123',path:'Z:/missing'},root).path,effect);const result=await scanTransitions(root);assert.equal(result.items.length,1);assert.equal(result.items[0].path,effect);assert.equal(result.items[0].name,'Warm');assert.equal(resolveEffect({effectId:'../bad',path:'missing'},root).path,'missing');}finally{fs.rmSync(root,{recursive:true,force:true});}
});
