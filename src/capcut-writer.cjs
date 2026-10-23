// Schema 360000, derived from local CapCut 9.6 samples and XAO_VIDEO's
// engine/export/capcut-install modules. No source projects are modified.
const fs=require('node:fs');const path=require('node:path');
const {execFile}=require('node:child_process');const {promisify}=require('node:util');
const {uid,nameErrors}=require('./domain.cjs');const template=require('./capcut-template.json');
const clone=structuredClone,us=x=>Math.round(x*1e6),slash=p=>p.replaceAll('\\','/');
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function write(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v));}
async function isRunning(){if(process.platform!=='win32')return false;const {stdout}=await promisify(execFile)('tasklist.exe',['/FI','IMAGENAME eq CapCut.exe','/FO','CSV','/NH'],{windowsHide:true});return /"CapCut\.exe"/i.test(stdout);}
function resolveTransition(t,catalog){
  if(t.type==='local')return t.resource;
  const names={fade:['Mờ','Fade','Dissolve'],flash:['Chớp sáng','Flash'],wipe:['Wipe','Quét']};
  const r=catalog.find(r=>(names[t.type]||[]).includes(r.name));
  if(!r)throw Error('Chưa có tài nguyên cho chuyển cảnh '+t.type+'. Hãy chọn chuyển cảnh đã tải trong Thiết lập hoặc chọn Không.');
  return r;
}
function fontFile(name){
  const dir=path.join(process.env.WINDIR||'C:/Windows','Fonts');
  const known={arial:'arial.ttf','times new roman':'times.ttf',calibri:'calibri.ttf','segoe ui':'segoeui.ttf',tahoma:'tahoma.ttf',verdana:'verdana.ttf'};
  const candidate=path.join(dir,known[name.toLowerCase()]||name+'.ttf');
  if(!fs.existsSync(candidate))throw Error('Không tìm thấy font '+name+'. Hãy dùng Arial hoặc font Windows đã cài.');
  return candidate;
}
const fontCache=new Map();
function makeText(c,segment){
  const p=c.text,fontPath=fontFile(p.font),font=fontCache.get(fontPath)||require('fontkit').openSync(fontPath);fontCache.set(fontPath,font);
  // XAO_VIDEO's calibrated text geometry: font size 15 / scale 0.2 = 33.333 px per em.
  const em=p.size*p.scale*(100/9),maxWidth=1920-p.marginLeft;
  const width=s=>font.layout(s).positions.reduce((n,x)=>n+x.xAdvance,0)/font.unitsPerEm*em;
  const lines=[];for(const raw of c.source.split('\n')){let line='';for(const ch of raw){if(line&&width(line+ch)>maxWidth){lines.push(line);line='';}line+=ch;}lines.push(line);}
  const text=lines.join('\n'),w=Math.max(...lines.map(width)),h=em*(1+(lines.length-1)*1.2);
  if(h>1080-p.marginBottom)throw Error('Credit quá dài để đặt trong khung hình: '+path.basename(c.path));
  const m=clone(template.textMaterial);Object.assign(m,{id:uid(),font_path:slash(fontPath),font_name:p.font,font_size:p.size,text_color:p.color,text_alpha:1,alignment:0,border_color:p.strokeColor,border_width:p.stroke/100,has_shadow:!!p.shadow,shadow_alpha:p.shadow?0.9:0,shadow_color:'#000000',shadow_distance:p.shadow?5:0});
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const style={fill:{content:{render_type:'solid',solid:{color:rgb(p.color)}}},font:{path:slash(fontPath),id:''},size:p.size,range:[0,text.length]};
  if(p.stroke>0)style.strokes=[{content:{render_type:'solid',solid:{color:rgb(p.strokeColor)}},width:p.stroke/100}];
  m.content=JSON.stringify({text,styles:[style]});m.words={start_time:[],end_time:[],text:[]};m.current_words=clone(m.words);m.text_to_audio_ids=[];m.relevance_segment=[];
  segment.clip={scale:{x:p.scale,y:p.scale},rotation:0,transform:{x:-1+2*(p.marginLeft+w/2)/1920,y:-1+2*(p.marginBottom+h/2)/1080},flip:{horizontal:false,vertical:false},alpha:p.opacity};
  return m;
}
function build(manifest,catalog=[]){
  if(nameErrors(manifest.name).length)throw Error('Tên dự án không hợp lệ.');
  const d=clone(template.base);Object.assign(d,{id:uid(),name:manifest.name,duration:us(manifest.duration),create_time:0,update_time:0,tracks:[],relationships:[],group_container:null,time_marks:null,keyframe_graph_list:[],cover:null,retouch_cover:null,extra_info:null,path:''});
  d.canvas_config={width:1920,height:1080,ratio:'16:9',background:null};d.config.video_mute=false;
  const tracks={};for(const type of ['video','text','audio'])tracks[type]={...clone(template[type+'Track']),id:uid(),type,name:type==='video'?'Footage':type==='text'?'Nguồn / Credit':'Nhạc',is_default_name:false,segments:[]};
  const add=(type,m,c,target=tracks[type])=>{
    const s=clone(template[type+'Segment']);Object.assign(s,{id:uid(),material_id:m.id,source_timerange:type==='text'?null:{start:us(c.sourceStart||0),duration:us(c.duration)},target_timerange:{start:us(c.start),duration:us(c.start+c.duration)-us(c.start)},render_timerange:{start:0,duration:0},extra_material_refs:[],common_keyframes:[],keyframe_refs:[],group_id:'',raw_segment_id:'',speed:1,reverse:false,is_loop:false});
    for(const k of Object.keys(s))if(k.startsWith('enable_'))s[k]=false;
    s.render_index=type==='text'?14000:0;s.track_render_index=type==='video'?0:type==='text'?1:2;
    target.segments.push(s);return s;
  };
  const byKey=new Map();
  for(const c of manifest.clips){
    const m=clone(template.videoMaterial);Object.assign(m,{id:uid(),unique_id:uid(),path:slash(c.path),material_name:path.basename(c.path),duration:us(c.sourceDuration||c.duration),width:c.width,height:c.height,type:c.kind==='image'?'photo':'video',has_audio:c.kind!=='image'&&(c.hasAudio??true),has_sound_separated:false,extra_type_option:0});d.materials.videos.push(m);
    const s=add('video',m,c),scale=c.transform?.scale||1;s.clip={scale:{x:scale,y:scale},rotation:0,transform:{x:0,y:0},flip:{horizontal:false,vertical:false},alpha:1};s.uniform_scale={on:true,value:1};s.volume=1;s.last_nonzero_volume=1;byKey.set(c.key,s);
    const mode=c.audioMode||'original';if(!['original','removeVocals','keepVocals','mute'].includes(mode))throw Error('Chế độ âm thanh footage không hợp lệ.');
    if(mode==='mute')s.volume=0;
    if(['removeVocals','keepVocals'].includes(mode)&&m.has_audio){const vocal={id:uid(),type:'vocal_separation',choice:mode==='removeVocals'?1:2,removed_sounds:[],time_range:{start:us(c.sourceStart||0),duration:us(c.duration)},production_path:'',final_algorithm:'vocal_separate',enter_from:'timeline_menu'};(d.materials.vocal_separations||=[]).push(vocal);s.extra_material_refs.push(vocal.id);}
    if(c.source&&c.text){const textSegment=add('text',{id:''},c),text=makeText(c,textSegment);textSegment.material_id=text.id;d.materials.texts.push(text);}
  }
  const originalAudio={...clone(template.audioTrack),id:uid(),type:'audio',name:'Âm thanh footage',is_default_name:false,attribute:0,flag:0,segments:[]};
  for(const a of manifest.footageAudio||[]){
    const video=byKey.get(a.videoKey);if(!video)throw Error('Âm thanh gốc không khớp footage.');
    const m=clone(template.audioMaterial);Object.assign(m,{id:uid(),unique_id:uid(),type:'extract_music',path:slash(a.path),name:a.name,duration:us(a.sourceDuration)});d.materials.audios.push(m);
    const s=add('audio',m,a,originalAudio);s.volume=manifest.clips.find(c=>c.key===a.videoKey)?.audioMode==='mute'?0:(a.volume??1);s.last_nonzero_volume=s.volume;s.clip=null;s.uniform_scale=null;s.track_render_index=3;
    video.volume=0;video.last_nonzero_volume=1;const videoMaterial=d.materials.videos.find(m=>m.id===video.material_id);videoMaterial.extra_type_option=1;videoMaterial.has_sound_separated=true;
  }
  for(const a of manifest.audio){
    const m=clone(template.audioMaterial);Object.assign(m,{id:uid(),unique_id:uid(),type:'extract_music',path:slash(a.path),name:path.basename(a.path),duration:us(manifest.draft.assignments[a.key]?.duration||a.duration)});d.materials.audios.push(m);
    const s=add('audio',m,a);s.volume=a.volume;s.last_nonzero_volume=a.volume;s.clip=null;s.uniform_scale=null;
    const mode=a.audioMode??manifest.draft.musicAudioMode??'removeVocals';
    if(!['original','removeVocals','keepVocals'].includes(mode))throw Error('Chế độ âm thanh nhạc không hợp lệ.');
    if(mode!=='original'){const vocal={id:uid(),type:'vocal_separation',choice:mode==='removeVocals'?1:2,removed_sounds:[],time_range:{start:us(a.sourceStart||0),duration:us(a.duration)},production_path:'',final_algorithm:'vocal_separate',enter_from:'timeline_menu'};(d.materials.vocal_separations||=[]).push(vocal);s.extra_material_refs.push(vocal.id);}
    const fade={id:uid(),type:'audio_fade',fade_type:0,fade_in_duration:0,fade_out_duration:us(Math.min(a.fadeOut,a.duration))};(d.materials.audio_fades||=[]).push(fade);s.extra_material_refs.push(fade.id);
  }
  for(const t of manifest.transitions){
    const r=resolveTransition(t,catalog);if(!r?.path||!fs.existsSync(path.join(r.path,'config.json')))throw Error('Tài nguyên chuyển cảnh đã mất. Hãy quét lại.');
    const m={id:uid(),type:'transition',name:r.name,effect_id:r.effectId,resource_id:r.resourceId||r.effectId,third_resource_id:'0',source_platform:1,path:slash(r.path),duration:us(t.duration),is_overlap:true,platform:'all',category_id:'100000',category_name:'',request_id:'',is_ai_transition:false,video_path:'',task_id:''};
    (d.materials.transitions||=[]).push(m);byKey.get(t.after).extra_material_refs.push(m.id);
  }
  d.tracks=[...Object.values(tracks),originalAudio].filter(t=>t.segments.length);require('./end-effect.cjs').append(d,require('./end-effect.cjs').timing(manifest.draft.endEffect,manifest.duration),uid);validate(d);return d;
}
function validate(d){
  const ids=new Set(),materials=new Map();for(const a of Object.values(d.materials))for(const m of a){if(!m.id||ids.has(m.id))throw Error('ID material trùng.');ids.add(m.id);materials.set(m.id,m);}
  let cursor=0;for(const t of d.tracks){if(ids.has(t.id))throw Error('ID track trùng.');ids.add(t.id);for(const s of t.segments){
    if(ids.has(s.id)||!materials.has(s.material_id)||s.extra_material_refs.some(id=>!materials.has(id)))throw Error('Tham chiếu CapCut không hợp lệ.');ids.add(s.id);
    const r=s.target_timerange;if(!Number.isSafeInteger(r.start)||!Number.isSafeInteger(r.duration)||r.start<0||r.duration<=0||r.start+r.duration>d.duration)throw Error('Thời gian CapCut không hợp lệ.');
    if(t.type==='video'){if(r.start!==cursor)throw Error('Timeline footage bị hở/chồng.');cursor+=r.duration;}
  }}if(cursor!==d.duration)throw Error('Sai tổng thời lượng.');
  for(const m of [...d.materials.videos,...d.materials.audios])if(!fs.existsSync(m.path))throw Error('Media đã mất: '+m.path);
}
async function install(manifest,root,catalog=[],running=isRunning){
  if(await running())throw Error('CapCut đang mở. Hãy lưu và đóng CapCut, rồi bấm TẠO DỰ ÁN CAPCUT lại.');
  root=path.resolve(root);const indexPath=path.join(root,'root_meta_info.json'),original=fs.readFileSync(indexPath),index=JSON.parse(original.toString('utf8').replace(/^\uFEFF/,''));
  if(!Array.isArray(index.all_draft_store))throw Error('Danh sách dự án CapCut không hợp lệ.');
  if(index.all_draft_store.some(p=>!p.tm_draft_removed&&p.draft_name?.toLocaleLowerCase()===manifest.name.toLocaleLowerCase()))throw Error('Tên dự án đã có trong CapCut. Hãy tự sửa tên.');
  const d=build(manifest,catalog),projectId=uid(),folder=path.join(root,manifest.name),stage=path.join(root,'.ccb-stage-'+uid());
  if(fs.existsSync(folder))throw Error('Thư mục dự án đã tồn tại.');
  const now=Date.now()*1000;d.path=slash(folder);
  const materialEntry=(m,type)=>({id:uid(),file_Path:m.path,extra_info:m.material_name||m.name,metetype:type===0?(m.type==='photo'?'photo':'video'):'audio',type,duration:m.duration,width:m.width||0,height:m.height||0,import_time:Math.floor(now/1e6),import_time_ms:now,create_time:Math.floor(now/1e6),roughcut_time_range:{start:0,duration:m.duration},sub_time_range:{start:-1,duration:-1}});
  const meta={draft_new_version:'',draft_type:'video',draft_is_invisible:false,draft_is_from_deeplink:false,draft_need_rename_folder:false,draft_timeline_materials_size_:0,draft_removable_storage_device:'',draft_id:projectId,draft_name:manifest.name,draft_fold_path:slash(folder),draft_root_path:root,draft_json_file:slash(path.join(folder,'draft_content.json')),tm_duration:d.duration,tm_draft_create:now,tm_draft_modified:now,tm_draft_removed:0,cloud_draft_sync:false,draft_is_cloud_temp_draft:false,draft_cover:'',draft_segment_extra_info:[],draft_materials_copied_info:[],draft_materials:[{type:0,value:d.materials.videos.map(m=>materialEntry(m,0))},{type:1,value:d.materials.audios.map(m=>materialEntry(m,1))}],draft_timeline_materials_size:0,streaming_edit_draft_ready:true};
  const timeline={version:0,id:uid(),create_time:now,update_time:now,config:{color_space:-1,mixed_track_mode_on:false,render_index_track_mode_on:false,use_float_render:false},main_timeline_id:d.id,timelines:[{id:d.id,name:'Dòng thời gian 01',is_marked_delete:false,create_time:now,update_time:now}]};
  fs.mkdirSync(stage);let moved=false,committed=false;
  try{
    const projectStage=path.join(stage,'project');write(path.join(projectStage,'draft_content.json'),d);write(path.join(projectStage,'draft_meta_info.json'),meta);write(path.join(projectStage,'Timelines','project.json'),timeline);write(path.join(projectStage,'Timelines',d.id,'draft_content.json'),d);write(path.join(projectStage,'ccb_manifest.json'),manifest);
    validate(read(path.join(projectStage,'draft_content.json')));
    if(await running())throw Error('CapCut vừa mở. Hãy đóng CapCut rồi thử lại.');
    if(!fs.readFileSync(indexPath).equals(original))throw Error('Danh sách CapCut vừa thay đổi. Hãy thử lại.');
    const backup=path.join(root,'root_meta_info.json.ccb-backup-'+Date.now()+'-'+projectId.slice(0,8)+'.json');fs.writeFileSync(backup,original,{flag:'wx'});
    index.all_draft_store.unshift(meta);index.draft_ids=Array.isArray(index.draft_ids)?index.all_draft_store.map(p=>p.draft_id):(Number(index.draft_ids)||0)+1;
    write(path.join(stage,'index.json'),index);fs.renameSync(projectStage,folder);moved=true;fs.renameSync(path.join(stage,'index.json'),indexPath);committed=true;
    return {kind:'capcut',compatible:true,verified:true,verification:'schema-and-readback',path:folder,backup,projectId};
  }finally{
    if(moved&&!committed)fs.renameSync(folder,path.join(stage,'project'));
    // This is a freshly created, fixed-prefix child of root, never user media.
    if(path.dirname(stage)===root&&path.basename(stage).startsWith('.ccb-stage-'))fs.rmSync(stage,{recursive:true,force:true});
  }
}
module.exports={build,validate,install,isRunning,resolveTransition,fontFile};
