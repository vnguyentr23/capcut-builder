const fs=require('node:fs'),path=require('node:path');
function timing(setting,total){
 if(!setting?.enabled)return null;
 if(!Number.isFinite(setting.duration)||setting.duration<=0||setting.duration>60)throw Error('Hiệu ứng kết thúc cần thời lượng lớn hơn 0 và tối đa 60 giây.');
 const r=setting.resource;
 if(!r?.effectId||r.effectType!==7||!r.path||!fs.existsSync(path.join(r.path,'config.json')))throw Error('Hiệu ứng kết thúc chưa được chọn hoặc đã mất gói tải. Hãy quét lại CapCut.');
 if(!(total>0))throw Error('Chưa có video để thêm hiệu ứng kết thúc.');
 const duration=Math.min(setting.duration,total);return {resource:r,start:total-duration,duration};
}
function append(d,e,uid){
 if(!e)return;
 const t=require('./end-effect-template.json'),r=e.resource,m=structuredClone(t.material),segment=structuredClone(t.segment),track=structuredClone(t.track);
 const end=d.duration,duration=Math.min(end,Math.round(e.duration*1e6));
 if(duration<=0)throw Error('Hiệu ứng kết thúc quá ngắn.');
 Object.assign(m,{id:uid(),effect_id:r.effectId,resource_id:r.resourceId||r.effectId,path:r.path.replaceAll('\\','/'),name:r.name,category_id:'100000',category_name:'Hiệu ứng video',adjust_params:r.adjustParams||[],request_id:'',apply_target_type:2});
 Object.assign(segment,{id:uid(),material_id:m.id,target_timerange:{start:end-duration,duration},source_timerange:null,extra_material_refs:[],common_keyframes:[],keyframe_refs:[],track_render_index:4});
 Object.assign(track,{id:uid(),type:'effect',name:'Hiệu ứng kết thúc',is_default_name:false,segments:[segment]});
 (d.materials.video_effects||=[]).push(m);d.tracks.push(track);
}
module.exports={timing,append};
