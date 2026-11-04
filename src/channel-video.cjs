const fs=require('node:fs');
const template=require('./capcut-template.json');
const {uid}=require('./domain.cjs');
const defaults={
 enabled:true,hook:false,flip:true,brightness:-7,exposure:-3,contrast:4,saturation:10,temperature:3,highlight:-5,shadow:-2,sharpen:0,
 logo:true,image:null,size:90,logoFade:0,x:30,y:30,corner:'tl',sections:['hook','body','intro','end'],
 watermark:true,label:'',fontSize:22,color:'#ffffff',textFade:75,gap:10,textPosition:'below',textX:30,textY:30
};
const colors=['brightness','exposure','contrast','saturation','temperature','highlight','shadow','sharpen'];
const warning='Chưa xác minh được cách ghi 8 thông số màu trong draft CapCut trên máy. Tool lưu các giá trị này nhưng chưa áp dụng vào footage.';
function read(store,id){
 const raw=store.pref('channel-video:'+id);
 return {...structuredClone(defaults),...(raw?JSON.parse(raw):{})};
}
function validate(s){
 const bounds={size:[1,1920],logoFade:[0,100],x:[0,1920],y:[0,1080],fontSize:[1,180],textFade:[0,100],gap:[0,1080],textX:[0,1920],textY:[0,1080]};
 for(const key of colors)bounds[key]=[key==='sharpen'?0:-100,100];
 for(const [key,[min,max]] of Object.entries(bounds))if(!Number.isFinite(s[key])||s[key]<min||s[key]>max)throw Error('Giá trị cài đặt video nằm ngoài phạm vi.');
 if(!['tl','tr','bl','br'].includes(s.corner)||!['below','custom'].includes(s.textPosition)||!Array.isArray(s.sections)||s.sections.some(r=>!defaults.sections.includes(r))||!/^#[0-9a-f]{6}$/i.test(s.color)||typeof s.label!=='string')throw Error('Cài đặt logo hoặc tên kênh không hợp lệ.');
 if(s.logo&&s.image&&(!/\.(png|webp)$/i.test(s.image.path)||!fs.existsSync(s.image.path)||!(s.image.width>0&&s.image.height>0)))throw Error('Không đọc được logo. Hãy chọn lại ảnh PNG hoặc WebP.');
}
function profile(store,id){
 const state=store.get(id);
 return {...read(store,id),channel:state.channelName==='Kênh gốc'?state.name:state.channelName||state.name};
}
function overlay(d,type,name,material,segment,ranges){
 if(!ranges.length)return;
 const track={...structuredClone(template[type+'Track']),id:uid(),name,is_default_name:false,segments:[]};
 d.materials[type==='text'?'texts':'videos'].push(material);
 for(const range of ranges){
  track.segments.push({...structuredClone(segment),id:uid(),material_id:material.id,target_timerange:{...range},source_timerange:type==='text'?null:{start:0,duration:range.duration},extra_material_refs:[],common_keyframes:[],keyframe_refs:[],track_render_index:d.tracks.length,render_index:Math.max(15000,...d.tracks.flatMap(t=>t.segments.map(s=>s.render_index||0)))+1});
 }
 d.tracks.push(track);
}
function apply(d,s,roles){
 validate(s);
 const track=d.tracks.find(t=>t.type==='video'),ranges=[];
 for(const seg of track?.segments||[]){
  const role=roles.get(seg.id);
  if(s.enabled&&s.flip&&(role==='body'||(role==='hook'&&s.hook)))seg.clip.flip={...seg.clip.flip,horizontal:true};
  if(s.sections.includes(role)){
   const r=seg.target_timerange,last=ranges.at(-1);
   if(last&&last.start+last.duration===r.start)last.duration+=r.duration;
   else ranges.push({...r});
  }
 }
 const {width:W,height:H}=d.canvas_config;
 const logo=s.logo&&s.image&&ranges.length, right=s.corner.endsWith('r'),bottom=s.corner.startsWith('b');
 let lx=s.x,ly=s.y,lh=0;
 if(logo){
  const m={...structuredClone(template.videoMaterial),id:uid(),unique_id:uid(),type:'photo',path:s.image.path.replaceAll('\\','/'),material_name:require('node:path').basename(s.image.path),width:s.image.width,height:s.image.height,duration:d.duration,has_audio:false};
  lh=s.size*m.height/m.width;lx=right?W-s.x-s.size:s.x;ly=bottom?H-s.y-lh:s.y;
  if(lx<0||ly<0||lx+s.size>W||ly+lh>H)throw Error('Logo vượt khung hình. Giảm kích thước hoặc khoảng cách lề.');
  const seg=structuredClone(template.videoSegment),scale=s.size/Math.min(W,H*m.width/m.height);
  seg.clip={scale:{x:scale,y:scale},transform:{x:2*(lx+s.size/2)/W-1,y:1-2*(ly+lh/2)/H},rotation:0,flip:{horizontal:false,vertical:false},alpha:1-s.logoFade/100};
  overlay(d,'video','Logo kênh',m,seg,ranges);
 }
 if(!s.watermark)return;
 const label=s.label.trim()||s.channel;if(!label)return;
 const seg=structuredClone(template.textSegment),scale=.09;
 const m=require('./capcut-writer.cjs').makeText({path:'Tên kênh',source:label,text:{font:'Arial',size:s.fontSize,scale,color:s.color,stroke:0,strokeColor:'#000000',shadow:false,opacity:1-s.textFade/100,marginLeft:0,marginBottom:0}},seg);
 const w=(seg.clip.transform.x+1)*1920,h=(seg.clip.transform.y+1)*1080;
 let x=s.textX,y=s.textY;
 if(logo&&s.textPosition==='below'){x=right?lx+s.size-w:lx;y=ly+lh+s.gap;if(y+h>H)y=ly-s.gap-h;}
 if(w>W||h>H)throw Error('Tên kênh vượt khung hình. Hãy giảm cỡ chữ.');
 x=Math.max(0,Math.min(W-w,x));y=Math.max(0,Math.min(H-h,y));
 if(logo&&x<lx+s.size&&x+w>lx&&y<ly+lh&&y+h>ly)throw Error('Tên kênh chồng lên logo. Hãy chỉnh vị trí hoặc khoảng cách.');
 seg.clip.transform={x:2*(x+w/2)/W-1,y:1-2*(y+h/2)/H};
 overlay(d,'text','Tên kênh chìm',m,seg,[{start:0,duration:d.duration}]);
}
module.exports={defaults,read,profile,validate,apply,warning};
