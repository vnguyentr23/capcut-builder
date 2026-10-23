const {test}=require('node:test'),assert=require('node:assert/strict');
const d=require('../src/domain.cjs'),s=require('../src/selection.cjs'),writer=require('../src/capcut-writer.cjs');
test('Khóa nhiều vị trí: random và mọi cách sắp xếp chỉ thay các ô không khóa',()=>{
 const group={items:['c','b','a','d','e'],pinned:['b','e']},media=new Map(group.items.map((id,i)=>[id,{name:id,createdAt:i+1}]));
 for(const mode of ['createdAsc','createdDesc','nameAsc','nameDesc','manual','random']){s.sortGroup(group,media,mode);assert.equal(group.items[1],'b');assert.equal(group.items[4],'e');}
 for(let i=0;i<20;i++){s.randomizeGroup(group);assert.equal(group.items[1],'b');assert.equal(group.items[4],'e');assert.deepEqual([...group.items].sort(),['a','b','c','d','e']);}
 group.pinned=[...group.items];const old=[...group.items];s.randomizeGroup(group);assert.deepEqual(group.items,old);
 group.pinned=group.items.slice(1);s.randomizeGroup(group);assert.deepEqual(group.items,old);
 group.pinned=[];s.sortGroup(group,media,'nameAsc');assert.deepEqual(group.items,['a','b','c','d','e']);
});
test('Cắt 1–4 giây: writer giữ file gốc, sourceStart đúng; nhạc, credit và chuyển cảnh theo đoạn cắt',t=>{
 const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-trim-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const file=path.join(root,'fixture.mp4');fs.writeFileSync(file,'fixture');
 const draft=d.defaults();draft.transition.type='fade';draft.name='Trim test';draft.pattern=['A'];draft.blockSize=1;draft.hook=[{id:'h'}];draft.body=[{id:'a'},{id:'b'}];draft.trims={a:{start:1,end:4},h:{start:2,end:8}};
 const media=new Map(['h','a','b'].map(id=>[id,{id,path:file,duration:10,width:1920,height:1080,source:'credit'}]));
 draft.assignments=Object.fromEntries(['hook','body-block:0','body-block:1'].map(key=>[key,{path:file,duration:100}]));
 const manifest=d.manifest(draft,{id:'n'},media);assert.deepEqual(manifest.clips.map(c=>[c.start,c.sourceStart,c.duration]),[[0,2,6],[6,1,3],[9,0,10]]);
 assert.deepEqual(manifest.audio.map(a=>[a.start,a.duration]),[[3,3],[6,3],[9,10]]);assert.deepEqual(manifest.transitions.map(t=>t.at),[6,9]);
 manifest.transitions=[];const project=writer.build(manifest),video=project.tracks.find(t=>t.type==='video'),text=project.tracks.find(t=>t.type==='text');writer.validate(project);
 assert.deepEqual(video.segments[1].source_timerange,{start:1000000,duration:3000000});assert.equal(project.materials.videos[1].duration,10000000);assert.equal(text.segments[1].target_timerange.duration,3000000);
 assert.equal(media.get('a').duration,10);
});
test('Cắt căn khung hình; chặn đoạn rỗng, âm, vượt cuối và NaN',()=>{
 const draft=d.defaults(),m={id:'a',duration:10.017,name:'clip'};draft.trims={a:{start:1.019,end:10.017}};assert.deepEqual(d.clipRange(draft,m),{sourceStart:31/30,duration:269/30});
 for(const trim of [{start:3,end:2},{start:-1,end:2},{start:0,end:11},{start:1,end:1.001},{start:NaN,end:2}]){draft.trims.a=trim;assert.throws(()=>d.clipRange(draft,m));}
});

test('Khóa giữ vị trí nhìn thấy khi random/sort có file đã dùng, bị loại và tìm kiếm',()=>{
 const group={items:['hidden1','a','hidden2','locked','b','hidden3','c'],pinned:['locked']},visible=['a','locked','b','c'],media=new Map(group.items.map((id,i)=>[id,{name:id,createdAt:8-i}]));
 for(let i=0;i<30;i++){s.randomizeGroup(group,visible);assert.equal(group.items.filter(id=>visible.includes(id)).indexOf('locked'),1);assert.equal(group.items[0],'hidden1');assert.equal(group.items[2],'hidden2');assert.equal(group.items[5],'hidden3');}
 for(const mode of ['nameAsc','nameDesc','createdAsc','createdDesc']){s.sortGroup(group,media,mode,visible);assert.equal(group.items.filter(id=>visible.includes(id)).indexOf('locked'),1);assert.equal(group.items[2],'hidden2');}
 assert.equal(group.orderVersion,1);
});
