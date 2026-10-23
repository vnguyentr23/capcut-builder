const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const domain=require('../src/domain.cjs'),writer=require('../src/capcut-writer.cjs'),effect=require('../src/end-effect.cjs'),catalog=require('../src/transitions.cjs');
test('Hiệu ứng kết thúc theo schema native, sát cuối video kể cả End và thời lượng lẻ',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-end-effect-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.writeFileSync(path.join(root,'config.json'),'{}');const file=path.join(root,'video.mp4');fs.writeFileSync(file,'fixture');
 const resource={effectId:'123',resourceId:'123',effectType:7,path:root,name:'End',adjustParams:[{name:'speed',value:.3,default_value:.3}]};
 const draft=domain.defaults();draft.body=[{id:'v'}];draft.end={path:file,duration:2.3333333,kind:'image',width:1920,height:1080};draft.endEffect={enabled:true,duration:3,resource};
 const media=new Map([['v',{path:file,duration:10,width:1920,height:1080}]]);
 for(const length of [3,60]){draft.endEffect.duration=length;const m=domain.manifest(draft,{id:'n'},media),d=writer.build(m),s=d.tracks.find(t=>t.type==='effect').segments[0];writer.validate(d);assert.equal(s.target_timerange.start+s.target_timerange.duration,d.duration);assert.equal(s.target_timerange.duration,Math.min(d.duration,Math.round(length*1e6)));assert.equal(s.source_timerange,null);assert.equal(d.materials.video_effects[0].effect_id,'123');assert.deepEqual(d.materials.video_effects[0].adjust_params,resource.adjustParams);}
 draft.endEffect.enabled=false;assert.equal(writer.build(domain.manifest(draft,{id:'n'},media)).tracks.some(t=>t.type==='effect'),false);
 assert.throws(()=>effect.timing({enabled:true,duration:0,resource},10));assert.throws(()=>effect.timing({enabled:true,duration:3,resource:{...resource,effectType:19}},10));assert.throws(()=>effect.timing({enabled:true,duration:3,resource:{...resource,path:root+'/gone'}},10));
});
test('Danh mục hiệu ứng video tách riêng chuyển cảnh và giữ tham số mặc định',()=>{const json={items:[{common_attr:{effect_type:7,effect_id:'7'}},{common_attr:{effect_type:19,effect_id:'19'}}]};assert.equal(catalog.extractTransitions(json,7)[0].effect_id,'7');assert.equal(catalog.extractTransitions(json)[0].effect_id,'19');assert.equal(domain.defaults().transition.type,'none');});
