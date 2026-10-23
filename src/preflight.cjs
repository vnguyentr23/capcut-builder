const fs=require('node:fs');
const path=require('node:path');
const {nameErrors,timeline,musicSlots,clipRange}=require('./domain.cjs');
async function preflight(state,media,used,capcut,output) {
  const d=state.draft,checks=[],base=require('./ui/body-layout.js').baseBody(d),fill=d.shortClipFill||{enabled:false,threshold:5};
  const add=(level,text)=>checks.push({level,text});
  nameErrors(d.name).forEach(t=>add('error',t));
  if(!nameErrors(d.name).length)add('ok','Tên dự án hợp lệ trên Windows.');
  if(fs.existsSync(path.join(output,d.name)))add('error','Tên đã tồn tại trong thư mục manifest. Bấm “Tự sửa tên”.');
  if(fs.existsSync(path.join(capcut.destination,d.name))||capcut.existingNames?.some(n=>n.toLocaleLowerCase()===d.name.toLocaleLowerCase()))add('error','Tên trùng dự án CapCut. Bấm “Tự sửa tên”.');
  if(!Number.isInteger(d.target)||d.target<1||d.target>2000||base.length<1||base.length>d.target)add('error',`Body cần từ 1 đến ${d.target} footage; hiện có ${base.length} footage gốc.`);
  else add('ok',`Body có ${base.length}/${d.target} footage gốc + ${d.body.length-base.length} footage bù.`);
  if(!d.pattern.length||d.pattern.some(id=>!state.groups.some(g=>g.id===id)))add('error','Pattern rỗng hoặc chứa nhóm đã bị xóa.');
  if(!require('./body-pattern.cjs').matches(d,state.groups))add('error','Body không khớp pattern hiện tại. Hãy tạo lại Body.');
  if(fill.enabled&&(!Number.isFinite(fill.threshold)||fill.threshold<=0||fill.threshold>3600))add('error','Ngưỡng bù clip phải lớn hơn 0 và tối đa 3.600 giây.');
  const filled=new Set();
  for(let i=0;i<d.body.length;i++){const c=d.body[i];if(!c.supplementFor)continue;const parent=d.body[i-1];
    let qualifies=false;try{qualifies=!!parent&&!parent.supplementFor&&parent.id===c.supplementFor&&clipRange(d,media.get(parent.id)).duration<fill.threshold;}catch{}
    if(!fill.enabled||!qualifies||filled.has(c.supplementFor))add('error','Clip bù không khớp thiết lập hoặc clip gốc. Hãy tạo lại Body.');
    filled.add(c.supplementFor);
  }
  if(fill.enabled){let missing=0;for(const b of base){try{if(clipRange(d,media.get(b.id)).duration<fill.threshold&&!filled.has(b.id))missing++;}catch{}}
    if(missing)add('warning',`Còn ${missing} clip ngắn chưa được bù. Bấm Tạo Body để tìm footage; nếu hết clip hợp lệ, vẫn có thể tạo dự án.`);
    add('ok',`${filled.size} clip bù, mỗi clip gốc ngắn hơn ${fill.threshold}s thêm tối đa một clip; cùng nhạc và block.`);
  }
  if(d.end?.kind==='image'&&(!Number.isFinite(d.end.duration)||d.end.duration<0.1||d.end.duration>3600))add('error','Thời lượng ảnh kết thúc phải từ 0,1 đến 3.600 giây.');
  if(d.intro&&d.introPosition==='afterBlocks'&&(!Number.isInteger(d.introAfterBlocks)||d.introAfterBlocks<1||d.introAfterBlocks>Math.ceil(base.length/d.blockSize)))add('error','Vị trí Intro phải nằm trong Body.');
  if(!['beforeHook','afterHook','afterBlocks'].includes(d.introPosition))add('error','Vị trí Intro không hợp lệ.');
  const excluded=new Set([...state.groups.flatMap(g=>g.excluded||[]),...(d.excluded||[])]);
  if(d.body.some(b=>{const g=state.groups.find(g=>g.id===b.groupId);return !g||(g.items&&!g.items.includes(b.id));}))add('error','Body chứa clip không còn trong nhóm đã chọn. Hãy tạo lại Body.');
  if([...d.hook,...d.body].some(c=>excluded.has(media.get(c.id)?.fingerprint)))add('error','Dự án còn footage đã xóa khỏi lựa chọn. Hãy tạo lại Body.');
  if(d.body.some(b=>{const g=state.groups.find(g=>g.id===b.groupId);return g?.lockedOnly&&!(g.pinned||[]).includes(b.id);}))add('error','Body còn footage chưa khóa trong cột bật Chỉ lấy footage đã khóa. Hãy tạo lại Body.');
  const substitutions=base.filter(b=>b.requestedGroupId&&b.groupId!==b.requestedGroupId).length;
  if(substitutions)add('warning',substitutions+' vị trí được bù từ nhóm khác vì nhóm ưu tiên không đủ footage.');
  const hooks=new Set(),body=new Set();
  for(const h of d.hook){const m=media.get(h.id);if(!m){add('error','Hook tham chiếu file không còn trong thư viện.');continue;}if(hooks.has(m.fingerprint))add('error',`Hook trùng: ${m.name}`);hooks.add(m.fingerprint);if(used.has(m.fingerprint))add('warning',`Hook “${m.name}”: đã dùng trước đó, vẫn được phép.`);}
  for(const b of d.body){const m=media.get(b.id);if(!m){add('error','Body tham chiếu file không còn trong thư viện.');continue;}if(body.has(m.fingerprint))add('error',`Body trùng: ${m.name}`);body.add(m.fingerprint);if(used.has(m.fingerprint))add('error',`Body “${m.name}” đã dùng trong ngách này.`);if(hooks.has(m.fingerprint)&&!d.hook.find(h=>media.get(h.id)?.fingerprint===m.fingerprint)?.allowBody)add('error',`“${m.name}” xuất hiện cả Hook và Body nhưng chưa được cho phép.`);}
  let tl;
  try {tl=timeline(d,media);}catch(e){add('error',e.message);return {checks,ok:false};}
  if(tl.clips.some(c=>!['original','removeVocals','keepVocals','mute'].includes(c.audioMode||'original')))add('error','Chế độ âm thanh footage không hợp lệ.');
  const filtered=tl.clips.filter(c=>['removeVocals','keepVocals'].includes(c.audioMode)&&c.kind!=='image');if(filtered.length)add('warning',`${filtered.length} đoạn dùng lọc giọng. CapCut sẽ xử lý khi mở dự án; chờ xử lý xong trước khi xuất. Xem trước trong tool dùng tiếng gốc.`);
  const seen=new Map();
  for(const c of tl.clips){const prior=seen.get(c.fingerprint);if(prior&&!(prior==='hook'&&c.role==='body'&&d.hook.some(h=>h.allowBody&&media.get(h.id)?.fingerprint===c.fingerprint)))add('error',`Lặp footage ngoài ý muốn: ${path.basename(c.path)}`);seen.set(c.fingerprint,c.role);}
  const selected=[...new Map(tl.clips.map(c=>[c.path,c])).values()];
  for(const c of selected){
    if(!fs.existsSync(c.path))add('error',`File không tồn tại: ${c.path}`);
    else {const st=fs.statSync(c.path),m=media.get(c.mediaId)||[d.intro,d.end].find(x=>x?.id===c.mediaId);if(m&&(st.size!==m.size||Math.abs(st.mtimeMs-m.mtime)>1))add('error',`File đã thay đổi, hãy quét/chọn lại: ${path.basename(c.path)}`);}
    if(!Number.isFinite(c.duration)||c.duration<=0)add('error',`Chưa đọc được thời lượng: ${path.basename(c.path)}`);
    if(!(c.width>0&&c.height>0))add('error',`Không có kích thước video hợp lệ: ${path.basename(c.path)}`);
  }
  const slots=musicSlots(d,tl),audioSeen=new Set();
  if(!Number.isFinite(d.hookDelay)||d.hookDelay<0)add('error','Độ trễ nhạc Hook không hợp lệ.');
  else add(d.hookDelay===3?'ok':'warning',`Nhạc Hook bắt đầu sau ${d.hookDelay} giây.`);
  if(d.hook.length&&tl.clips.filter(c=>c.role==='hook').reduce((n,c)=>n+c.duration,0)<=d.hookDelay)add('error','Hook ngắn hơn hoặc bằng độ trễ nhạc. Giảm độ trễ hoặc thêm footage Hook.');
  for(const s of slots){
    const m=d.assignments[s.key];
    if(!m){add('error',`Chưa có nhạc cho ${s.pool==='body'?'Body':s.pool==='hook'?'Hook':'Kết'}: ${s.key}`);continue;}
    if((state.musicExcluded||[]).includes(m.fingerprint))add('error','Bài nhạc đã bị loại vĩnh viễn khỏi ngách: '+m.name);
    if(audioSeen.has(m.fingerprint))add('error',`Nhạc trùng trong dự án: ${m.name}`);audioSeen.add(m.fingerprint);
    if(!fs.existsSync(m.path))add('error',`Mất file nhạc: ${m.path}`);
    else {const st=fs.statSync(m.path);if(st.size!==m.size||Math.abs(st.mtimeMs-m.mtime)>1)add('error',`File nhạc đã đổi, hãy random lại: ${m.name}`);}
    if(!(m.duration>0))add('error',`Nhạc không đọc được thời lượng: ${m.name}`);
    else if(m.duration+1e-7<s.duration)add('error',`Nhạc “${m.name}” chỉ dài ${m.duration.toFixed(1)}s, block cần ${s.duration.toFixed(1)}s. Bấm Gán nhạc còn thiếu để chọn bài đủ dài.`);
  }
  if(slots.every(s=>d.assignments[s.key])&&audioSeen.size===slots.length)add('ok',`${slots.length} bài nhạc riêng biệt; nhạc Body luôn từ 0:00 và cùng thời điểm bắt đầu block.`);
  if(!Number.isFinite(d.fade)||d.fade<0)add('error','Fade out không hợp lệ.');
  else add(d.fade===4?'ok':'warning',`Fade out ${d.fade} giây, tự rút ngắn theo đoạn nhạc.`);
  if(!['none','fade','flash','wipe','local'].includes(d.transition.type))add('error','Loại chuyển cảnh không hợp lệ.');
  if(d.transition.type!=='none'&&(!Number.isFinite(d.transition.duration)||d.transition.duration<=0||d.transition.duration>5))add('error','Chuyển cảnh phải lớn hơn 0 và tối đa 5 giây.');
  if((!Number.isInteger(d.blockSize)||d.blockSize<1||d.blockSize>2000))add('error','Số footage mỗi block phải là số nguyên từ 1 đến 2000.');
  for(const t of tl.transitions){const left=tl.clips.find(c=>c.key===t.after),right=tl.clips.find(c=>c.key===t.before);if(t.duration>Math.min(left.duration,right.duration)/2)add('error','Chuyển cảnh dài hơn nửa clip liền kề.');}
  if(d.transition.type==='local'){
    const r=d.transition.resource;
    if(!r?.effectId||r.effectType!==19||!r.path||!fs.existsSync(path.join(r.path,'config.json')))add('error','Chuyển cảnh CapCut chưa được chọn hoặc tài nguyên đã mất. Hãy quét và chọn lại.');
    else add('ok','Chuyển cảnh đã tải trên máy: '+r.name+(r.isPro?' (CapCut Pro)':''));
  }
  try{const effect=require('./end-effect.cjs').timing(d.endEffect,tl.duration);if(effect)add('ok','Hiệu ứng kết thúc: '+effect.resource.name+' · '+effect.duration+' giây cuối video.');}catch(e){add('error',e.message);}
  const v=d.vertical,txt=d.text;
  if(!Number.isFinite(v.scale)||v.scale<0.01||v.scale>10)add('error','Preset 9:16 không hợp lệ.');
  if(!txt.font.trim()||!(txt.size>0&&txt.size<=300)||!(txt.scale>=0.01&&txt.scale<=10)||!(txt.opacity>=0&&txt.opacity<=1)||!/^#[0-9a-f]{6}$/i.test(txt.color)||!/^#[0-9a-f]{6}$/i.test(txt.strokeColor)||!(txt.stroke>=0&&txt.stroke<=30)||txt.alignment!=='left')add('error','Preset chữ nguồn không hợp lệ.');
  if(!Number.isFinite(txt.marginLeft)||txt.marginLeft<0||txt.marginLeft>=1920||!Number.isFinite(txt.marginBottom)||txt.marginBottom<0||txt.marginBottom>=1080)add('error','Lề chữ không hợp lệ: lề trái từ 0 đến dưới 1920 px, lề dưới từ 0 đến dưới 1080 px.');
  if(!['original','removeVocals','keepVocals'].includes(d.musicAudioMode??'removeVocals'))add('error','Chế độ âm thanh nhạc không hợp lệ.');
  if((d.musicAudioMode??'removeVocals')!=='original')add('warning','Nhạc dùng lọc giọng: CapCut xử lý khi mở dự án. Chờ xử lý xong trước khi xuất.');
  if(!Number.isFinite(d.audioVolumeDb)||d.audioVolumeDb< -60||d.audioVolumeDb>20)add('error','Âm lượng nhạc phải từ −60 đến +20 dB.');
  try{const duck=require('./ducking.cjs').validate(d);if(duck.enabled)add('warning','Tự hạ nhạc theo mức tiếng footage khi tạo dự án. Phân tích tiếng gốc, chưa phân biệt lời nói với tiếng động hoặc nhạc có sẵn trong footage.');}catch(e){add('error',e.message);}
  const missing=tl.clips.filter(c=>['hook','body'].includes(c.role)&&!c.source).length;
  add(missing?'warning':'ok',missing?`${missing} đoạn chưa có credit. Kiểm tra file .txt cùng tên footage.`:'Credit gắn theo đúng footage.');
  add('ok',`Transform chỉ áp cho footage 9:16; ${tl.transitions.length} chuyển cảnh, theo block ${d.blockSize} footage gốc, bao gồm các clip bù.`);
  add(capcut.destinationExists?'ok':'warning',capcut.destinationExists?'Đã tìm thấy thư mục dự án CapCut.':'Chưa tìm thấy thư mục dự án CapCut. Manifest vẫn dùng được.');
  add(capcut.compatible?'ok':'warning',capcut.reason);
  if(d.mode==='capcut'){
    if(!capcut.compatible)add('error',capcut.reason||'Chưa tìm thấy định dạng CapCut tương thích.');
    else {try{
      const writer=require('./capcut-writer.cjs');if(await writer.isRunning())add('error','Hãy lưu và đóng CapCut trước khi tạo dự án.');
      const catalog=(await require('./transitions.cjs').scanTransitions()).items;
      for(const t of tl.transitions)writer.resolveTransition(t,catalog);
      if(tl.clips.some(c=>c.source))writer.fontFile(d.text.font);
    }catch(e){add('error',e.message);}}
  }
  return {checks,ok:!checks.some(c=>c.level==='error'),timeline:tl};
}
module.exports={preflight};
