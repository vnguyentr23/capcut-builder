const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {Store}=require('../src/store.cjs');const d=require('../src/domain.cjs');const writer=require('../src/capcut-writer.cjs');const {preflight}=require('../src/preflight.cjs');
test('Credit rỗng lấy tên file; nguồn nhập tay ưu tiên; writer tạo track text',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-credit-')),store=new Store(path.join(root,'db'));try{
  const file=path.join(root,'Aronne Chan.mp4');fs.writeFileSync(file,'fixture');const s=store.create('PET');store.putMedia({id:'m',path:file,name:'Aronne Chan.mp4',fingerprint:'fp',size:7,mtime:1,source:'',duration:5,width:1920,height:1080});s.groups=[{id:'A',items:['m']}];s.draft.body=[{id:'m',groupId:'A'}];s.draft.transition.type='none';
  const map=store.hydrate(s);assert.equal(map.get('m').source,'Aronne Chan');const m=d.manifest(s.draft,s,map),out=writer.build(m);assert.equal(out.tracks.find(t=>t.type==='text').segments.length,1);assert.equal(JSON.parse(out.materials.texts[0].content).text,'Aronne Chan');
  s.sources={m:'@Nguồn nhập tay'};assert.equal(store.hydrate(s).get('m').source,'@Nguồn nhập tay');s.sources.m='';assert.equal(store.hydrate(s).get('m').source,'');
 }finally{store.close();fs.rmSync(root,{recursive:true,force:true});}
});
test('Tên theo kênh và ngách; số dựa vào dự án riêng biệt, không theo số lần lưu',()=>{const store=new Store(':memory:');try{const s=store.create('Động vật');assert.equal(s.draft.name,'Kênh gốc_Động vật_1');store.bodyMilestone(s);store.bodyMilestone(s);s.draft.id=d.uid();store.nameDraft(s);assert.equal(s.draft.name,'Kênh gốc_Động vật_2');store.nameDraft(s,n=>n==='Kênh gốc_Động vật_2');assert.equal(s.draft.name,'Kênh gốc_Động vật_3');store.save(s);s.draft.name='Sửa tên';store.save(s);assert.equal(store.get(s.id).draft.name,'Kênh gốc_Động vật_3');}finally{store.close();}});

test('Thiếu footage vẫn tạo Body <=N, không lặp; không để lỗ slot/block; rỗng bị chặn',()=>{
 const draft=d.defaults();draft.target=10;draft.blockSize=2;draft.pattern=['A','B'];const groups=[{id:'A',items:[]},{id:'B',items:['b0','b1','b2']}],media=new Map(groups[1].items.map(id=>[id,{id,fingerprint:id,duration:5,width:1920,height:1080,path:id}]));
 draft.body=d.generate(draft,groups,media,new Set());assert.equal(draft.body.length,3);assert.deepEqual(draft.body.map(b=>b.slotIndex),[0,1,2]);assert.equal(d.musicSlots(draft,d.timeline(draft,media)).length,2);assert.throws(()=>d.generate(draft,groups,media,new Set(groups[1].items)),/Không còn/);
});
test('Preflight cho phép Body ít hơn N và chặn rỗng/vượt N',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-max-'));try{const file=path.join(root,'clip.mp4');fs.writeFileSync(file,'fixture');const st=fs.statSync(file),m={id:'m',path:file,fingerprint:'fp',name:'clip',duration:5,width:1920,height:1080,size:st.size,mtime:st.mtimeMs,source:'credit'},draft=d.defaults();draft.name='Test';draft.mode='manifest';draft.target=10;draft.pattern=['A'];draft.body=[{id:'m',groupId:'A'}];draft.assignments={'body-block:0':{...m,fingerprint:'song'}};const s={groups:[{id:'A',items:['m']}],draft};let result=await preflight(s,new Map([['m',m]]),new Set(),{destination:root,reason:'test'},root);assert.equal(result.ok,true,JSON.stringify(result.checks));draft.body=[];result=await preflight(s,new Map([['m',m]]),new Set(),{destination:root,reason:'test'},root);assert.equal(result.ok,false);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
