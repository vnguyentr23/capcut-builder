'use strict';
const $=s=>document.querySelector(s);
const api=(action,payload)=>window.ccb.call(action,payload);
let transitionCatalog=[],effectCatalog=[];
let state,media=new Map(),used=new Set(),history=[],niches=[],drag=null,busy=false,saveTimer,toastTimer,bodyPage=0;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=seconds=>{const n=Math.max(0,Math.round(seconds||0));return `${String(Math.floor(n/60)).padStart(2,'0')}:${String(n%60).padStart(2,'0')}`;};
const shortPath=p=>(p||'').split(/[\\/]/).filter(Boolean).pop()||'Chưa chọn';
const uuid=()=>crypto.randomUUID();
function toast(message,error=false){clearTimeout(toastTimer);$('#toast').textContent=message;$('#toast').className=error?'error':'';$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,error?9000:5500);}
function accept(v){closeTrim();transitionCatalog=v.transitionCatalog||transitionCatalog;state=v.state;state.draft.endEffect??={enabled:false,duration:3,resource:null};effectCatalog=v.effectCatalog||effectCatalog;if(['fade','flash','wipe'].includes(state.draft.transition.type)){const names={fade:['Mờ','Fade','Dissolve'],flash:['Chớp sáng','Flash'],wipe:['Wipe','Quét']},r=transitionCatalog.find(r=>names[state.draft.transition.type].includes(r.name));state.draft.transition.resource=r||null;state.draft.transition.type=r?'local':'none';}media=new Map(v.media.map(m=>[m.id,m]));used=new Set(v.used);history=v.history;niches=v.niches;window.remixChannels=v.channels||[];$('#checkPanel').hidden=true;render();if(v.scanErrors?.length)toast(`${v.scanErrors.length} file không đọc được. Các file này sẽ bị loại khi sinh Body.`,true);}
async function run(title,fn){if(busy)return;busy=true;clearTimeout(saveTimer);if(state)await save();$('#busyText').textContent=title;$('#progress').removeAttribute('value');$('#busy').hidden=false;$('main').inert=true;$('footer').inert=true;$('#settingsSidebar').inert=true;try{return await fn();}catch(e){toast(e.message,true);}finally{busy=false;$('#busy').hidden=true;$('main').inert=false;$('footer').inert=false;$('#settingsSidebar').inert=false;}}
async function save(){if(!state)return;try{await api('save',state);$('#saveStatus').textContent='Đã lưu trên máy';}catch(e){$('#saveStatus').textContent='Lưu thất bại';toast(e.message,true);}}
function changed(){if(busy)return;$('#saveStatus').textContent='Đang lưu…';clearTimeout(saveTimer);saveTimer=setTimeout(save,220);$('#checkPanel').hidden=true;updateSummary();}
window.addEventListener('beforeunload',()=>{if(state)window.ccb.flush(state);});
window.addEventListener('error',e=>{window.__lastError=e.message;toast(e.message,true);});
window.ccb.onProgress(p=>{$('#busyText').textContent=`Đang đọc ${p.done}/${p.total}: ${p.file}`;$('#progress').max=p.total||1;$('#progress').value=p.done;});
async function ask(title,value='',note=''){const d=$('#promptDialog'),form=d.querySelector('form');$('#promptTitle').textContent=title;$('#promptValue').value=value;$('#promptNote').textContent=note;d.showModal();$('#promptValue').focus();return new Promise(resolve=>{const finish=result=>{form.onsubmit=null;d.oncancel=null;resolve(result);};form.onsubmit=e=>{e.preventDefault();const result=e.submitter?.value==='ok'?$('#promptValue').value:null;d.close();finish(result);};d.oncancel=()=>finish(null);});}

function setSetting(key,value){const parts=key.split('.');let obj=state.draft;for(const p of parts.slice(0,-1))obj=obj[p];obj[parts.at(-1)]=value;}
function getSetting(key){return key.split('.').reduce((o,k)=>o[k],state.draft);}
function bodyCountText(){const d=state.draft,base=CCBBody.baseBody(d).length,extra=d.body.length-base;return `${base}/${d.target} gốc${extra?' + '+extra+' bù':''}`;}
function shortFillStatus(){const d=state.draft,fill=d.shortClipFill,base=CCBBody.baseBody(d),extra=d.body.filter(c=>c.supplementFor),filled=new Set(extra.map(c=>c.supplementFor));const missing=fill?.enabled?base.filter(c=>displayRange(c.id).duration<fill.threshold&&!filled.has(c.id)).length:0;$('#shortFillStatus').textContent=fill?.enabled?`${extra.length} clip đã bù${missing?' · '+missing+' clip ngắn chưa được bù':''}. Bấm Tạo Body để áp dụng khi đổi thiết lập hoặc điểm cắt.`:'Đang tắt bù clip ngắn.';return missing;}
function updateSummary(){if(!state)return;$('#footerMode').textContent=state.draft.mode==='capcut'?'Tạo project editable trong CapCut':'Bản kế hoạch · Không phải project CapCut';$('#footerSummary').textContent=`${state.draft.hook.length} Hook · ${bodyCountText()} · ${state.draft.body.length} clip Body · ${Object.keys(state.draft.assignments).length} nhạc đã khóa`;}
function applyPreviewScale(){
  const scale=Math.min(200,Math.max(100,Number(state.previewScale)||100));
  document.documentElement.style.setProperty('--preview-h',160*scale/100+'px');
  document.documentElement.style.setProperty('--preview-w',90*scale/100+'px');
  $('#previewScale').value=scale;$('#previewScaleValue').textContent=scale+'%';
}
$('#previewScale').oninput=e=>{state.previewScale=Number(e.target.value);applyPreviewScale();renderGroups();renderBody();changed();};
function applyBodyVisibility(){const hidden=!!state.bodyHidden;$('#bodyPanel').hidden=hidden;$('.editingDeck').classList.toggle('bodyHidden',hidden);$('#toggleBody').textContent=hidden?'Hiện Hook & Body':'Ẩn Hook & Body';$('#toggleBody').setAttribute('aria-expanded',String(!hidden));}
$('#toggleBody').onclick=()=>{state.bodyHidden=!state.bodyHidden;applyBodyVisibility();changed();};
function render(){
  applyPreviewScale();applyBodyVisibility();window.renderChannels?.();
  $('#niche').innerHTML=niches.map(n=>`<option value="${esc(n.id)}">${esc(n.name)}</option>`).join('');$('#niche').value=state.rootNicheId||state.id;$('#settingsNiche').textContent='Ngách: '+state.name;
  $('#projectName').value=state.draft.name;$('#target').value=state.draft.target;
  if(document.body.classList.contains('remixMode')){stopFootage();$('#groups').querySelectorAll('.pool').forEach(p=>p._resizeObserver?.disconnect());thumbObserver.disconnect();return;}
  $('#parentPath').textContent=state.parent||'Chọn thư mục cha để lưu theo ngách';$('#parentPath').title=state.parent;
  $('#introFile').textContent=shortPath(state.draft.intro?.path);$('#introFile').title=state.draft.intro?.path||'';
  $('#endFile').textContent=shortPath(state.draft.end?.path);$('#endFile').title=state.draft.end?.path||'';$('#endDurationLabel').hidden=state.draft.end?.kind!=='image';$('#endDuration').value=state.draft.end?.duration||5;
  $('#introPosition').value=state.draft.introPosition;$('#introAfter').value=state.draft.introAfterBlocks;$('#introAfter').hidden=state.draft.introPosition!=='afterBlocks';
  for(const id of ['hookDelay','fade','audioVolumeDb','musicAudioMode','mode'])$('#'+id).value=state.draft[id];
  document.querySelectorAll('[data-setting]').forEach(e=>{if(e.type==='checkbox')e.checked=getSetting(e.dataset.setting);else e.value=e.dataset.percent?Math.round(getSetting(e.dataset.setting)*100):getSetting(e.dataset.setting);});
  $('#destination').textContent=state.draft.destination||'Tự phát hiện thư mục CapCut trên máy';
  renderHook();renderPattern();renderBody();renderMusic();renderHistory();renderLocalTransitions();renderEndEffects();updateSummary();
}
function renderLocalTransitions(){
  $('#localTransitionPicker').hidden=state.draft.transition.type!=='local';
  const q=$('#transitionSearch').value.toLocaleLowerCase('vi'),chosen=state.draft.transition.resource;
  const list=transitionCatalog.filter(r=>(r.name+' '+r.effectId).toLocaleLowerCase('vi').includes(q));
  if(chosen&&!list.some(r=>r.effectId===chosen.effectId))list.unshift(chosen);
  $('#localTransition').innerHTML='<option value="">Chọn chuyển cảnh đã tải…</option>'+list.map(r=>'<option value="'+esc(r.effectId)+'">'+esc(r.name)+(r.isPro?' · Pro':'')+'</option>').join('');
  $('#localTransition').value=chosen?.effectId||'';
  $('#transitionResource').textContent=chosen?chosen.name+' · Mã '+chosen.effectId+' · Áp vào project CapCut khi tạo.':'Chọn tài nguyên, sau đó chỉnh thời lượng ở trên.';
  $('#transitionScanStatus').textContent=transitionCatalog.length+' chuyển cảnh có gói tải trên máy. Quét lại sau khi tải thêm trong CapCut.';
}
function renderEndEffects(){
 const chosen=state.draft.endEffect.resource,q=$('#effectSearch').value.toLocaleLowerCase('vi'),list=effectCatalog.filter(r=>r.name.toLocaleLowerCase('vi').includes(q));
 if(chosen&&!list.some(r=>r.effectId===chosen.effectId))list.unshift(chosen);
 $('#endEffectPicker').innerHTML='<option value="">Chọn hiệu ứng đã tải…</option>'+list.map(r=>`<option value="${esc(r.effectId)}">${esc(r.name)}${r.isPro?' · Pro':''}</option>`).join('');
 $('#endEffectPicker').value=chosen?.effectId||'';$('#effectStatus').textContent=effectCatalog.length+' hiệu ứng đã tải trên máy.';
}
$('#scanEffects').onclick=()=>run('Đọc hiệu ứng CapCut…',async()=>{const r=await api('effects');effectCatalog=r.items;renderEndEffects();toast('Tìm thấy '+r.items.length+' hiệu ứng.'+(r.warnings.length?' '+r.warnings.join(' '):''));});
$('#effectSearch').oninput=renderEndEffects;
$('#endEffectPicker').onchange=e=>{const r=effectCatalog.find(r=>r.effectId===e.target.value)||null;state.draft.endEffect.resource=r;if(r){state.draft.endEffect.enabled=true;state.draft.endEffect.duration=Math.min(60,Math.max(.1,r.duration||3));}changed();render();};
function renderHook(){
  $('#hook').querySelectorAll('[data-thumb]').forEach(img=>thumbObserver.unobserve(img));
  const el=$('#hook');el.innerHTML=state.draft.hook.length?state.draft.hook.map((h,i)=>{const m=media.get(h.id),old=used.has(m?.fingerprint),inBody=state.draft.body.some(b=>media.get(b.id)?.fingerprint===m?.fingerprint);return `<article class="hookCard" data-index="${i}">${thumb(h.id,m?.duration)}<button class="mediaTitle" data-watch="${esc(h.id)}" title="Xem footage">${i+1}. ${esc(m?.name||'File không còn trong thư viện')}</button><div class="hookStatus"><span class="hookStatusDot ${old?'used':'fresh'}"></span><span>${old?'Đã dùng trước đó':'Chưa dùng'}${inBody?' · Có trong Body':''}</span></div><div class="row hookActions"><label class="check hookRepeat" title="Cho phép footage này xuất hiện lại trong Body"><input type="checkbox" aria-label="Cho phép lặp ở Body" data-allow="${i}" ${h.allowBody?'checked':''}><span aria-hidden="true">↻</span></label><button data-hook-move="-1" data-index="${i}" title="Đưa Hook lên trước" ${i===0?'disabled':''}>↑</button><button data-hook-move="1" data-index="${i}" title="Đưa Hook xuống sau" ${i===state.draft.hook.length-1?'disabled':''}>↓</button><button data-remove-hook="${i}" title="Bỏ khỏi Hook">×</button></div></article>`;}).join(''):'<div class="empty">Bấm “Chọn video” hoặc ＋ Hook để thêm đoạn mở đầu</div>';
  bindThumbs(el);
  el.querySelectorAll('.hookCard').forEach(card=>{const rail=card.querySelector('.hookActions');rail.prepend(card.querySelector('.trimFootage'));rail.querySelectorAll('button').forEach(b=>b.setAttribute('aria-label',b.title));});
  el.querySelectorAll('[data-watch]').forEach(b=>b.onclick=()=>showFootage(b.dataset.watch,b.closest('article').querySelector('[data-preview]')));
  el.querySelectorAll('[data-hook-move]').forEach(b=>b.onclick=()=>{const i=Number(b.dataset.index),next=i+Number(b.dataset.hookMove);if(next<0||next>=state.draft.hook.length)return;[state.draft.hook[i],state.draft.hook[next]]=[state.draft.hook[next],state.draft.hook[i]];changed();renderHook();renderBody();});
  el.querySelectorAll('[data-remove-hook]').forEach(b=>b.onclick=()=>{state.draft.hook.splice(Number(b.dataset.removeHook),1);changed();renderHook();renderGroups();renderBody();});
  el.querySelectorAll('[data-allow]').forEach(c=>c.onchange=()=>{state.draft.hook[Number(c.dataset.allow)].allowBody=c.checked;changed();});
}
async function importHookFiles(files,index){if(busy||!files.length)return;drag=null;await run('Đọc video vào Hook…',async()=>{const v=await api('importHook',{state,files,index});accept(v);toast('Đã thêm '+v.hookImport.added+' video vào Hook.'+(v.hookImport.warnings.length?' '+v.hookImport.warnings.join(' '):''),!!v.hookImport.warnings.length);});}
$('#pickHook').onclick=async()=>{const files=await api('chooseHooks');await importHookFiles(files,state.draft.hook.length);};
document.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});
document.addEventListener('drop',e=>{if(e.dataTransfer?.files.length)e.preventDefault();});
function addHook(id){if(busy)return;const m=media.get(id);if(state.draft.hook.some(h=>media.get(h.id)?.fingerprint===m?.fingerprint)){toast('Footage này đã có trong Hook.');return;}state.draft.hook.push({id,allowBody:false});changed();renderHook();renderGroups();renderBody();}
function excludedFootage(){return new Set([...state.groups.flatMap(g=>g.excluded||[]),...(state.draft.excluded||[])]);}
async function deleteFootage(groupId,mediaId,mediaIds=null){
  if(busy)return;
  const dialog=$('#deleteFootageDialog');dialog.querySelector('h2').textContent=mediaIds?'Xóa '+mediaIds.length+' footage trong cột':'Xóa footage khỏi lựa chọn';dialog.querySelector('p').textContent=mediaIds?'Áp dụng cho toàn bộ danh sách đang lọc trong cột, kể cả footage ngoài vùng cuộn. Không xóa file gốc; không ảnh hưởng Hook đang ẩn khỏi thư viện. Body tự bù nếu còn footage hợp lệ.':'File gốc trên ổ đĩa vẫn được giữ nguyên. Body tự bù footage nếu còn đủ.';dialog.returnValue='';dialog.showModal();
  const scope=await new Promise(resolve=>{
    const form=dialog.querySelector('form');
    const finish=value=>{form.onsubmit=null;dialog.oncancel=null;resolve(value);};
    form.onsubmit=e=>{e.preventDefault();const value=e.submitter?.value||'cancel';dialog.close(value);finish(value);};
    dialog.oncancel=()=>finish('cancel');
  });
  if(!['permanent','project'].includes(scope))return;
  await run('Xóa khỏi lựa chọn và bù footage…',async()=>{
  const v=await api(mediaIds?'removeFootages':'removeFootage',{state,groupId,mediaId,mediaIds,scope});accept(v);const r=v.replacement;
  toast('Đã xóa '+(r.removedCount||1)+' footage. Body: '+bodyCountText()+'.'+(r.removedHooks?' Đã bỏ khỏi Hook.':''),!state.draft.body.length);
});}
function hookFingerprints(){return new Set(state.draft.hook.map(h=>media.get(h.id)?.fingerprint).filter(Boolean));}
function visibleGroupIds(group){const hook=hookFingerprints(),excluded=excludedFootage(),search=$('#search').value.toLowerCase(),unused=$('#unusedOnly').checked;return group.items.filter(id=>{const m=media.get(id);return m&&!hook.has(m.fingerprint)&&!excluded.has(m.fingerprint)&&(!search||(m.name+' '+m.source).toLowerCase().includes(search))&&(!unused||!used.has(m.fingerprint));});}
function lockedCount(group){const items=new Set(group.items);return new Set((group.pinned||[]).filter(id=>items.has(id))).size;}
function patternGroups(){const byId=new Map(state.groups.map(g=>[g.id,g]));return [...new Set(state.draft.pattern)].map(id=>byId.get(id)).filter(Boolean);}
function renderGroups(){
  const orderedGroups=patternGroups();const pinnedIds=new Set(orderedGroups.flatMap(g=>{const items=new Set(g.items);return (g.pinned||[]).filter(id=>items.has(id));}));$('#totalLocked').textContent='🔒 Đã khóa: '+pinnedIds.size.toLocaleString('vi-VN');$('#scanPattern').disabled=!orderedGroups.length;$('#unlockAllFootage').disabled=!pinnedIds.size;
  const scrolls=new Map([...document.querySelectorAll('.group')].map(g=>[g.dataset.group,g.querySelector('.pool').scrollTop]));
  const hook=hookFingerprints(),excluded=excludedFootage();const target=$('#groups');target.querySelectorAll('.pool').forEach(p=>p._resizeObserver?.disconnect());target.querySelectorAll('[data-thumb]').forEach(img=>thumbObserver.unobserve(img));target.innerHTML='';$('#libraryCount').textContent=orderedGroups.reduce((n,g)=>n+g.items.filter(id=>!hook.has(media.get(id)?.fingerprint)&&!excluded.has(media.get(id)?.fingerprint)&&(!$('#unusedOnly').checked||!used.has(media.get(id)?.fingerprint))).length,0).toLocaleString('vi-VN')+' file';
  const hidden=orderedGroups.filter(g=>g.uiHidden),tray=$('#hiddenGroups');tray.hidden=!hidden.length;tray.innerHTML='<span class="muted">Cột đã ẩn:</span>'+hidden.map(g=>`<button data-show-group="${esc(g.id)}" title="Hiện lại cột">＋ ${esc(g.name)} · 🔒 ${lockedCount(g)}</button>`).join('');tray.querySelectorAll('[data-show-group]').forEach(b=>b.onclick=()=>{const g=state.groups.find(g=>g.id===b.dataset.showGroup);g.uiHidden=false;changed();renderGroups();});
  if(orderedGroups.length&&hidden.length===orderedGroups.length)target.innerHTML='<div class="empty">Tất cả cột đang ẩn. Bấm tên cột phía trên để hiện lại.</div>';
  if(state.groups.length&&!orderedGroups.length){target.innerHTML='<div class="empty">Pattern đang trống. Thêm nhóm vào Pattern trong Thiết lập để hiển thị thư viện.</div>';return;}
  if(!state.groups.length){target.innerHTML='<div class="empty">Thêm nhóm hoặc chọn thư mục cha rồi bấm “Đọc các nhóm con”.</div>';return;}
  for(const group of orderedGroups.filter(g=>!g.uiHidden)){
    const col=document.createElement('div');col.className='group';col.dataset.group=group.id;
    col.innerHTML=`<div class="groupTop"><div class="row"><h3>${esc(group.name)}</h3><span class="badge lockedCount" title="Số footage đã khóa vị trí trong toàn cột">🔒 ${lockedCount(group)}</span><button data-action="hide" title="Tạm ẩn cột" aria-label="Tạm ẩn cột">−</button><button data-action="tools" title="Thao tác nhóm">⋯</button><span class="badge" title="Số clip đang dùng được / tổng file">${group.items.filter(id=>!hook.has(media.get(id)?.fingerprint)&&!excluded.has(media.get(id)?.fingerprint)&&(!$('#unusedOnly').checked||!used.has(media.get(id)?.fingerprint))).length}/${group.items.length}</span></div><div class="groupTools"><button data-action="folder">Thư mục</button><button data-action="scan">Quét lại</button><button data-action="rename">Tên</button><button data-action="delete" title="Xóa nhóm khỏi ứng dụng">×</button></div><div class="groupSort"><select data-sort aria-label="Sắp xếp footage"><option value="createdAsc">Ngày tạo ↑ (cũ trước)</option><option value="createdDesc">Ngày tạo ↓ (mới trước)</option><option value="nameAsc">Tên A → Z</option><option value="nameDesc">Tên Z → A</option><option value="manual">Thủ công</option><option value="random">Thứ tự random đã lưu</option></select><button data-action="random" title="Ưu tiên footage chưa thấy trong 5 ô đầu; giữ nguyên vị trí khóa">Random</button></div><label class="check" title="Khi tạo Body, chỉ lấy clip khóa trong cột này; hết clip khóa thì tự bù từ cột khác"><input type="checkbox" data-locked-only ${group.lockedOnly?'checked':''}> Chỉ lấy footage đã khóa</label><button data-action="unlock" ${lockedCount(group)?'':'disabled'} title="Bỏ khóa tất cả footage trong cột, giữ nguyên thứ tự">Bỏ khóa cột</button><button data-action="clear" title="Xóa toàn bộ footage trong danh sách đang lọc, kể cả ngoài vùng cuộn">Xóa tất cả</button><button class="restoreFootage" data-action="restore" ${group.excluded?.length?'':'hidden'}>Khôi phục ${group.excluded?.length||0} clip đã xóa</button><div class="groupPath" title="${esc(group.folder)}">${esc(group.folder||'Chưa chọn thư mục')}</div></div><div class="pool"><div class="poolSpace"></div></div>`;
    target.append(col);col.querySelector('[data-sort]').value=group.sort||'createdAsc';col.querySelector('[data-sort]').onchange=e=>run('Sắp xếp cột…',async()=>{accept(await api('orderGroup',{state,groupId:group.id,mode:e.target.value,visibleIds:visibleGroupIds(group)}));toast('Đã lưu thứ tự cột. Bấm Tạo Body để áp dụng cho Body mới.');});
    col.querySelector('[data-locked-only]').onchange=e=>{group.lockedOnly=e.target.checked;changed();toast('Đã lưu. Bấm Tạo Body để áp dụng; thiếu clip khóa sẽ tự bù từ cột khác.');};
    col.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>groupAction(group.id,b.dataset.action));
    const pool=col.querySelector('.pool'),space=col.querySelector('.poolSpace');
    const search=$('#search').value.toLowerCase(),unused=$('#unusedOnly').checked;
    const ids=visibleGroupIds(group);
    const rowHeight=156;space.style.height=`${ids.length*rowHeight}px`;pool.scrollTop=scrolls.get(group.id)||0;let start=-1;
    function paint(force=false){if(!pool.isConnected||!pool.clientHeight||document.body.classList.contains('remixMode'))return;const from=Math.max(0,Math.floor(pool.scrollTop/rowHeight)-2);if(!force&&from===start)return;start=from;space.querySelectorAll('[data-thumb]').forEach(img=>thumbObserver.unobserve(img));space.innerHTML='';
      if(!ids.length){space.innerHTML='<div class="empty">Chưa có footage phù hợp</div>';return;}
      const visibleRows=Math.ceil(pool.clientHeight/rowHeight)+4;
      for(let i=from;i<Math.min(ids.length,from+visibleRows);i++){
        const m=media.get(ids[i]),row=document.createElement('div');row.className='mediaRow'+(used.has(m.fingerprint)?' used':'')+((group.pinned||[]).includes(m.id)?' pinned':'');row.style.top=`${i*rowHeight}px`;row.draggable=false;
        row.innerHTML=`${thumb(m.id,m.duration)}<div class="footageRail"><button class="pinFootage" aria-pressed="${(group.pinned||[]).includes(m.id)}" title="${(group.pinned||[]).includes(m.id)?(state.draft.pinPriority===false?'Bỏ khóa vị trí':'Bỏ khóa / bỏ thứ tự ưu tiên Body'):(state.draft.pinPriority===false?'Khóa vị trí trong cột':'Khóa và đánh số ưu tiên Body')}">${(group.pinned||[]).includes(m.id)?(state.draft.pinPriority===false?'🔒':CCBPins.ordered(state.draft,state.groups).indexOf(m.id)+1):'🔓'}</button><button class="mediaTitle" title="${esc(m.path)}">${esc(m.name)}</button><div class="mediaActions"><button data-row="hook" title="Thêm vào Hook" aria-label="Thêm vào Hook">＋</button><button data-row="top" title="Lên đầu">⇈</button><button data-row="up" title="Lên 1 ô" aria-label="Lên 1 ô">↑</button><button data-row="remove" title="Xóa & tự bù">×</button>${used.has(m.fingerprint)?'<span class="badge warn">Đã dùng</span>':''}</div></div>`;
        row.querySelector('.pinFootage').onclick=()=>{group.orderVersion=1;group.pinned??=[];const index=group.pinned.indexOf(m.id);state.draft.pinOrder=CCBPins.ordered(state.draft,state.groups).filter(id=>id!==m.id);if(index<0){group.pinned.push(m.id);state.draft.pinOrder.push(m.id);}else group.pinned.splice(index,1);changed();col.querySelector('.lockedCount').textContent='🔒 '+lockedCount(group);renderGroups();};
        bindThumbs(row);const rail=row.querySelector('.footageRail');row.append(row.querySelector('.mediaTitle'));rail.insertBefore(row.querySelector('.trimFootage'),rail.querySelector('.mediaActions'));rail.querySelectorAll('button').forEach(b=>{if(!b.hasAttribute('aria-label'))b.setAttribute('aria-label',b.title);});row.querySelector('.mediaTitle').onclick=()=>showFootage(m.id,row.querySelector('[data-preview]'));
        row.querySelector('[data-row=remove]').onclick=()=>deleteFootage(group.id,m.id);
        row.querySelector('[data-row=hook]').onclick=()=>addHook(m.id);
        const up=row.querySelector('[data-row=up]');up.disabled=ids.indexOf(m.id)===0;up.onclick=()=>{const visible=visibleGroupIds(group),at=visible.indexOf(m.id);if(at<=0)return;const previous=visible[at-1];if((group.pinned||[]).includes(m.id)||(group.pinned||[]).includes(previous)){toast('Bỏ khóa footage này hoặc ô phía trên trước khi di chuyển.');return;}const from=group.items.indexOf(m.id),to=group.items.indexOf(previous);[group.items[from],group.items[to]]=[group.items[to],group.items[from]];group.sort='manual';group.orderVersion=1;changed();renderGroups();};
        row.querySelector('[data-row=top]').onclick=()=>{if((group.pinned||[]).includes(m.id)){toast('Bỏ khóa trước khi đổi vị trí footage.');return;}const visible=new Set(visibleGroupIds(group)),pinned=new Set(group.items.filter(id=>(group.pinned||[]).includes(id)||!visible.has(id))),movable=group.items.filter(id=>!pinned.has(id));movable.splice(movable.indexOf(m.id),1);movable.unshift(m.id);let cursor=0;group.items=group.items.map(id=>pinned.has(id)?id:movable[cursor++]);group.sort='manual';changed();renderGroups();};
        space.append(row);
      }
    }
    pool.onscroll=()=>requestAnimationFrame(()=>paint());paint();
    let lastPoolHeight=-1;const resize=new ResizeObserver(()=>{const height=pool.clientHeight;if(height===lastPoolHeight)return;lastPoolHeight=height;paint(true);});resize.observe(pool);pool._resizeObserver=resize;
  }
}
function unlockFootage(groups){
 if(busy)return;const count=new Set(groups.flatMap(g=>g.pinned||[])).size;
 for(const g of groups)g.pinned=[];
 state.draft.pinOrder=CCBPins.ordered(state.draft,state.groups);
 changed();renderGroups();toast('Đã bỏ khóa '+count+' footage. Giữ nguyên thứ tự và Body hiện tại.');
}
$('#unlockAllFootage').onclick=()=>unlockFootage(patternGroups());
async function groupAction(id,action){
  if(busy)return;const g=state.groups.find(g=>g.id===id),i=state.groups.indexOf(g);
  if(action==='unlock'){unlockFootage([g]);return;}
  if(action==='clear'){const ids=visibleGroupIds(g);if(!ids.length){toast('Cột không có footage để xóa.');return;}await deleteFootage(id,null,ids);return;}
  if(action==='hide'){g.uiHidden=true;changed();renderGroups();return;}
  if(action==='tools'){document.querySelector('[data-group="'+id+'"]').classList.toggle('toolsOpen');return;}
  if(action==='random'){await run('Random thứ tự cột…',async()=>{const v=await api('orderGroup',{state,groupId:id,mode:'random',visibleIds:visibleGroupIds(g)});accept(v);toast('Đã ưu tiên footage mới ở 5 ô đầu, giữ vị trí khóa. Bấm Tạo Body để áp dụng.');});return;}
  if(action==='restore'){await run('Khôi phục lựa chọn…',async()=>{accept(await api('restoreFootage',{state,groupId:id}));toast('Đã khôi phục các clip bị loại trong cột.');});return;}
  if(action==='rename'){const value=await ask('Đổi tên nhóm',g.name);if(value?.trim()){g.name=value.trim();changed();renderGroups();renderPattern();renderBody();}return;}
  if(action==='delete'){const value=await ask('Xóa nhóm “'+g.name+'”?','', 'Gõ XÓA để bỏ nhóm khỏi ứng dụng. File gốc được giữ lại. Các bước pattern liên quan sẽ bị bỏ.');if(value==='XÓA'){state.groups.splice(i,1);state.draft.pattern=state.draft.pattern.filter(gid=>gid!==id);changed();renderGroups();renderPattern();}return;}
  if(action==='left'||action==='right'){const to=i+(action==='left'?-1:1);if(to>=0&&to<state.groups.length){[state.groups[i],state.groups[to]]=[state.groups[to],state.groups[i]];changed();renderGroups();renderPattern();}return;}
  let folder=g.folder;if(action==='folder')folder=await api('choose','folder');if(!folder)return;
  await run('Đang quét footage…',async()=>{accept(await api('scan',{state,groupId:id,folder}));toast('Đã cập nhật nhóm '+g.name);});
}
function renderPattern(){
  renderGroups();
  $('#patternGroup').innerHTML=state.groups.map(g=>`<option value="${esc(g.id)}">${esc(g.name)}</option>`).join('');
  $('#pattern').innerHTML=state.draft.pattern.map((id,i)=>`<span class="patternChip" draggable="true" data-index="${i}">${esc(state.groups.find(g=>g.id===id)?.name||'Nhóm đã xóa')}<button data-remove="${i}" title="Bỏ bước này">×</button></span>`).join('');
  $('#pattern').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{state.draft.pattern.splice(Number(b.dataset.remove),1);changed();renderPattern();});
  $('#pattern').querySelectorAll('.patternChip').forEach(el=>{el.ondragstart=e=>{if(busy){e.preventDefault();return;}drag={type:'pattern',index:Number(el.dataset.index)};e.dataTransfer.setData('text/plain','ccb');};el.ondragover=e=>e.preventDefault();el.ondrop=e=>{e.preventDefault();if(busy||drag?.type!=='pattern')return;const [id]=state.draft.pattern.splice(drag.index,1);state.draft.pattern.splice(Number(el.dataset.index),0,id);drag=null;changed();renderPattern();};});
}
function renderBody(){
  $('#bodyPreview').querySelectorAll('[data-thumb]').forEach(img=>thumbObserver.unobserve(img));
  const d=state.draft,blocks=CCBBody.blockIndices(d);$('#bodyCount').textContent=bodyCountText();shortFillStatus();
  const total=[...d.body,...d.hook].reduce((n,c)=>n+displayRange(c.id).duration,0)+(d.intro?.duration||0)+(d.end?.duration||0);$('#duration').textContent=fmt(total);
  const pages=Math.max(1,Math.ceil(d.body.length/60));bodyPage=Math.min(bodyPage,pages-1);
  $('#bodyPreview').innerHTML=d.body.length?d.body.slice(bodyPage*60,(bodyPage+1)*60).map((c,j)=>{const i=bodyPage*60+j,m=media.get(c.id),song=d.assignments['body-block:'+blocks[i]],cycle=d.transition.type!=='none'&&Number.isInteger(d.blockSize)&&d.blockSize>0&&i+1<d.body.length&&blocks[i+1]!==blocks[i];return `<article class="bodyCard ${cycle?'cycle':''}">${thumb(c.id,m?.duration)}<span class="number">${String(i+1).padStart(2,'0')} · ${esc(state.groups.find(g=>g.id===c.groupId)?.name||'?')}${c.supplementFor?' · bù clip ngắn':''}${cycle?' · chuyển cảnh':''}${c.requestedGroupId&&c.requestedGroupId!==c.groupId?' · bù nhóm':''}</span><button class="mediaTitle" data-watch="${esc(c.id)}" title="Xem footage">${esc(m?.name||'File không còn trong thư viện')}</button><small title="${esc(song?.path)}">♫ Block ${blocks[i]+1} · ${esc(song?.name||'Chưa gán nhạc')}</small><small title="${esc(m?.source)}">© ${esc(m?.source||'Chưa có nguồn')}</small><div class="footageSwap"><select data-hook-choice="${i}" aria-label="Hook muốn hoán đổi"><option value="">Chọn Hook…</option>${d.hook.map((h,n)=>`<option value="${n}">${n+1}. ${esc(media.get(h.id)?.name||'Hook')}</option>`).join('')}</select><button data-swap-footage="${i}" title="Đổi chỗ footage này với Hook đã chọn" ${d.hook.length?'':'disabled'}>⇄</button></div><button class="removeBody" data-remove-body="${esc(c.id)}" data-group="${esc(c.groupId)}" title="Loại clip và tự bù footage khác">Xóa & thay thế</button></article>`;}).join(''):'<div class="empty">Thiết lập pattern rồi bấm “Tạo Body”.</div>';
  const hookPreview=d.hook.map((h,i)=>{const m=media.get(h.id);return `<article class="bodyCard hookSequence">${thumb(h.id,m?.duration)}<span class="number">Hook ${i+1}</span><button class="mediaTitle" data-watch="${esc(h.id)}">${esc(m?.name||'Không tìm thấy file')}</button></article>`;}).join('');
  $('#bodyPreview').insertAdjacentHTML('afterbegin',`<div class="sequenceLabel">HOOK · ${d.hook.length} footage</div>${hookPreview}<div class="sequenceLabel">BODY · Trang ${bodyPage+1}/${pages}</div>`);
  $('#bodyPreview').querySelectorAll('[data-swap-footage]').forEach(b=>b.onclick=()=>{const bodyIndex=Number(b.dataset.swapFootage),choice=$('#bodyPreview').querySelector('[data-hook-choice="'+bodyIndex+'"]');if(choice.value===''){toast('Chọn footage Hook muốn hoán đổi.');return;}run('Hoán đổi footage…',async()=>{stopFootage();accept(await api('swapFootageHook',{state,bodyIndex,hookIndex:Number(choice.value)}));toast('Đã đổi chỗ footage Hook và Body. Kiểm tra lại nhạc nếu thời lượng thay đổi.');});});
  $('#bodyPreview').querySelectorAll('.bodyCard').forEach(card=>{
    const info=document.createElement('div');info.className='sequenceInfo';
    card.querySelectorAll(':scope > .number,:scope > small').forEach(el=>info.append(el));
    const swap=card.querySelector('.footageSwap'),remove=card.querySelector('.removeBody');
    if(swap&&remove){const actions=document.createElement('div');actions.className='sequenceActions';actions.append(swap.querySelector('select'),swap.querySelector('button'),remove);swap.remove();info.append(actions);}
    card.append(info);
  });
  bindThumbs($('#bodyPreview'));
  $('#bodyPreview').querySelectorAll('.bodyCard').forEach(card=>card.append(card.querySelector('.trimFootage')));
  $('#bodyPreview').querySelectorAll('[data-watch]').forEach(b=>b.onclick=()=>showFootage(b.dataset.watch,b.closest('article').querySelector('[data-preview]')));
  $('#bodyPreview').querySelectorAll('[data-remove-body]').forEach(b=>b.onclick=()=>deleteFootage(b.dataset.group,b.dataset.removeBody));
  $('#bodyPager').innerHTML=pages>1?`<button id="prevPage">← Trước</button><span class="muted">Trang ${bodyPage+1}/${pages} · 60 footage mỗi trang</span><button id="nextPage">Tiếp →</button>`:'';
  if(pages>1){$('#prevPage').disabled=bodyPage===0;$('#nextPage').disabled=bodyPage===pages-1;$('#prevPage').onclick=()=>{bodyPage--;renderBody();};$('#nextPage').onclick=()=>{bodyPage++;renderBody();};}
}
function renderMusic(){
  document.querySelectorAll('#assignedMusic audio').forEach(a=>a.pause());
  const keys=['hook',...new Set(CCBBody.blockIndices(state.draft).map(i=>'body-block:'+i))];if(state.draft.end&&!keys.some(k=>k.startsWith('body-block:')))keys.push('body-block:0');
  $('#assignedMusic').innerHTML='<h3>Nghe và chọn lại từng bài</h3><p class="hint">Nghe bản gốc · Lọc lời xử lý trong CapCut. Loại bài không xóa file.</p>'+keys.filter(k=>k!=='hook'||state.draft.hook.length).map(k=>{const m=state.draft.assignments[k];return `<div class="assignedSong"><b>${k==='hook'?'Hook':'Block '+(Number(k.split(':')[1])+1)}</b><span title="${esc(m?.path||'')}">${esc(m?.name||'Chưa gán nhạc')}</span><div class="row"><button data-listen="${k}" ${m?'':'disabled'}>▶ Nghe</button><button data-song-random="${k}">↻ Đổi bài</button>${k!=='hook'?`<button data-song-swap="${k}" ${m&&state.draft.hook.length&&state.draft.assignments.hook?'':'disabled'} title="Hoán đổi bài này với bài của Hook">⇄ Đổi với Hook</button>`:''}<button data-song-ban="${k}" ${m?'':'disabled'}>Loại vĩnh viễn</button></div><audio controls preload="none" data-song-player="${k}" hidden></audio></div>`;}).join('');
  $('#assignedMusic').querySelectorAll('[data-listen]').forEach(b=>b.onclick=async()=>{try{stopFootage();const player=$('#assignedMusic').querySelector('[data-song-player="'+b.dataset.listen+'"]');if(!player.paused){player.pause();return;}document.querySelectorAll('#assignedMusic audio').forEach(a=>{if(a!==player)a.pause();});if(!player.src){const r=await api('previewMusic',{state,key:b.dataset.listen});if(!player.isConnected)return;player.src=r.url;player.onerror=()=>toast('Không phát được file nhạc này.',true);}player.hidden=false;player.volume=Math.min(1,10**(state.draft.audioVolumeDb/20));await player.play();}catch(e){toast(e.message,true);}});
  $('#assignedMusic').querySelectorAll('[data-song-swap]').forEach(b=>b.onclick=()=>run('Đổi nhạc với Hook…',async()=>{accept(await api('swapMusicHook',{state,key:b.dataset.songSwap}));toast('Đã hoán đổi nhạc của block với Hook.');}));
  const changeSong=(key,exclude)=>run(exclude?'Loại bài và tìm bài thay thế…':'Đổi bài nhạc…',async()=>{const v=await api('musicOne',{state,key,exclude});accept(v);toast(v.musicNote||(exclude?'Đã loại bài khỏi ngách và chọn bài thay thế.':'Đã đổi riêng bài nhạc này.'),!!v.musicNote);});
  $('#assignedMusic').querySelectorAll('[data-song-random]').forEach(b=>b.onclick=()=>changeSong(b.dataset.songRandom,false));
  $('#assignedMusic').querySelectorAll('[data-song-ban]').forEach(b=>b.onclick=()=>changeSong(b.dataset.songBan,true));
  $('#musicFolders').innerHTML=['hook','body'].map(k=>`<div class="musicFolder"><b>${k==='hook'?'Hook':k==='body'?'Body':'Kết'}</b><span title="${esc(state.draft.music[k])}">${esc(state.draft.music[k]||'Chưa chọn thư mục nhạc')}</span><button data-music="${k}">Chọn</button></div>`).join('');
  $('#musicFolders').querySelectorAll('[data-music]').forEach(b=>b.onclick=async()=>{const folder=await api('choose','folder');if(folder){state.draft.music[b.dataset.music]=folder;changed();renderMusic();toast('Đã đổi thư mục. Nhạc cũ vẫn khóa; bấm “Random lại tất cả” nếu muốn thay.');}});
  $('#musicStatus').textContent=`${Object.keys(state.draft.assignments).length} bài đã khóa theo draft. Mỗi block một bài Body, bắt đầu từ 0:00. Hook chỉ một bài; Kết thúc dùng chung bài với block Body cuối. Chỉ chọn bài đủ dài.`;
}
function renderHistory(){
  $('#history').innerHTML=history.length?history.map(p=>`<div class="historyRow"><strong>${esc(p.name)}</strong><span class="badge ${p.status==='CREATED'?'green':'warn'}">${p.status==='REMIX_CREATED'?'Đã tạo (nhân bản)':p.status==='IMPORTED'?'Đã nhập CapCut':p.status==='CREATED'?'Đã tạo CapCut':p.status==='DRAFT'?'Bản nháp':'Bản kế hoạch'}</span><small>${esc(new Date(p.created_at).toLocaleString('vi-VN'))}</small>${['IMPORTED','REMIX_CREATED'].includes(p.status)?`<span class="badge" title="${esc(p.path)}">Chỉnh sửa trong CapCut</span>`:`<button data-restore="${esc(p.id)}">Mở bản lưu</button>`}</div>`).join(''):'<p class="hint">Chưa có dự án. Lưu manifest hoặc tạo draft mới sẽ giữ footage trong lịch sử để Body sau tránh dùng lại.</p>';
  $('#history').querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>run('Mở bản lưu…',async()=>{accept(await api('restore',{state,projectId:b.dataset.restore}));toast('Đã mở bản lưu. Tự sửa tên nếu muốn tạo một bản khác.');}));
}
function showChecks(result){$('#checkPanel').hidden=false;$('#checkCount').textContent=result.ok?'Có thể tạo bản kế hoạch':'Cần xử lý lỗi trước khi tạo';$('#checks').innerHTML=result.checks.map(c=>`<div class="checkRow ${c.level}">${c.level==='error'?'✕':c.level==='warning'?'△':'✓'} ${esc(c.text)}</div>`).join('');$('#checkPanel').scrollTop=0;}
async function detect(){const r=await api('detect',state);$('#adapterSummary').textContent=r.compatible?'CapCut '+r.versions[0]+' · Bộ ghi dự án sẵn sàng':r.reason;$('#adapterDetails').textContent=r.reason;$('#footerMode').textContent=state.draft.mode==='capcut'?'Tạo project editable trong CapCut':'Bản kế hoạch · Không phải project CapCut';if(!state.draft.destination){state.draft.destination=r.destination;$('#destination').textContent=r.destination;await save();}}
let trimEditingId=null;
function displayRange(id,fallback=0){const m=media.get(id),duration=m?.duration||fallback,trim=state?.draft.trims?.[id];if(!trim)return {start:0,end:duration,duration};const start=Math.round(trim.start*30)/30,end=Math.min(Math.floor(duration*30+1e-7),Math.round(trim.end*30))/30;return {start,end,duration:Math.max(0,end-start)};}
function closeTrim(){scrubEpoch++;scrubPending=null;$('#trimVideoHost .scrubFrame')?.remove();trimSeekTarget=null;trimGesture=null;if(trimEditingId)stopFootage();trimEditingId=null;if($('#trimEditor').open)$('#trimEditor').close();$('#trimEditor').hidden=true;}
async function openTrim(id){
  const m=media.get(id);if(!m||!(m.duration>0))return;scrubEpoch++;scrubPending=null;$('#trimVideoHost .scrubFrame')?.remove();trimSeekTarget=null;trimEditingId=id;
  const range=displayRange(id);$('#trimName').textContent=m.name;$('#trimAudioMode').value=state.draft.audioModes?.[id]||'original';$('#trimStart').value=range.start.toFixed(3);$('#trimEnd').value=range.end.toFixed(3);
  for(const key of ['trimStart','trimEnd'])$('#'+key).max=m.duration;
  $('#trimEditor').hidden=false;if(!$('#trimEditor').open)$('#trimEditor').showModal();updateTrimInfo();
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));if(trimEditingId===id){$('#trimVideoHost').dataset.preview=id;await showFootage(id,$('#trimVideoHost'));}
}
function readTrim(){
  const m=media.get(trimEditingId),start=Number($('#trimStart').value),end=Number($('#trimEnd').value);
  if(!m||$('#trimStart').value===''||$('#trimEnd').value===''||!Number.isFinite(start)||!Number.isFinite(end)||start<0||end>m.duration+0.000501||end<=start)throw Error('Nhập 0 ≤ bắt đầu < kết thúc ≤ thời lượng gốc.');
  const first=Math.round(start*30),last=Math.min(Math.floor(m.duration*30+1e-7),Math.round(end*30));
  if(last<=first)throw Error('Đoạn cắt phải dài ít nhất 1 khung hình.');
  return {start:first/30,end:last/30};
}
function updateTrimInfo(){try{const t=readTrim();$('#trimInfo').textContent=(t.end-t.start).toFixed(2)+' giây';$('#applyTrim').disabled=false;drawTrimTimeline(t);}catch(e){$('#trimInfo').textContent=e.message;$('#applyTrim').disabled=true;}}
function drawTrimTimeline(t){
  const duration=media.get(trimEditingId)?.duration;if(!duration)return;
  const left=t.start/duration*100,right=t.end/duration*100;
  $('#trimSelection').style.left=left+'%';$('#trimSelection').style.width=(right-left)+'%';
  for(const [id,value] of [['trimInHandle',t.start],['trimOutHandle',t.end]]){const handle=$('#'+id);handle.style.left=(value/duration*100)+'%';handle.setAttribute('aria-valuemin',0);handle.setAttribute('aria-valuemax',duration);handle.setAttribute('aria-valuenow',value);handle.setAttribute('aria-valuetext',value.toFixed(3)+' giây');}
  $('#trimRuler').innerHTML=Array.from({length:5},(_,i)=>'<span>'+fmt(duration*i/4)+'</span>').join('');updateTrimPlayhead();
}
function updateTrimPlayhead(){if(!trimEditingId)return;const duration=media.get(trimEditingId)?.duration||1;$('#trimPlayhead').style.left=Math.min(100,Math.max(0,($('#trimVideoHost .scrubFrame')&&!$('#trimVideoHost .scrubFrame').hidden?scrubDisplayedTime||0:inlineHost?.dataset.preview===trimEditingId?inlinePlayer?.currentTime||0:0)/duration*100))+'%';}
let scrubPending=null,scrubBusy=false,scrubEpoch=0,scrubDisplayedTime=null;
function queueScrubFrame(time){scrubPending={id:trimEditingId,time,epoch:scrubEpoch};pumpScrubFrame();}
async function pumpScrubFrame(){
 if(scrubBusy||!scrubPending)return;const job=scrubPending;scrubPending=null;scrubBusy=true;
 try{const frame=await api('scrubFrame',{id:job.id,time:job.time});
   if(job.epoch!==scrubEpoch||trimEditingId!==job.id)return;
   let img=$('#trimVideoHost .scrubFrame');if(!img){img=document.createElement('img');img.className='scrubFrame';img.alt='Khung hình tại điểm cắt';$('#trimVideoHost').append(img);}
   img.src=frame.url;img.hidden=false;scrubDisplayedTime=frame.time;updateTrimPlayhead();
 }catch(e){if(job.epoch===scrubEpoch)$('#trimInfo').textContent=e.message;}
 finally{scrubBusy=false;if(scrubPending)pumpScrubFrame();}
}
let trimSeekTarget=null,trimSeekOpening=false;
function flushTrimSeek(){
  const player=inlinePlayer;
  if(trimSeekTarget===null||!trimEditingId||inlineHost?.id!=='trimVideoHost'||!player||player.readyState<1||player.seeking)return;
  // Finish decoding the current seek before requesting the newest pointer position.
  // Replacing currentTime on every pointer event can starve frame presentation.
  const target=Math.max(0,Math.min(trimSeekTarget,Math.max(0,player.duration-1/30)));
  trimSeekTarget=null;player.pause();
  if(Math.abs(player.currentTime-target)>0.0001)player.currentTime=target;
  updateTrimPlayhead();
}
function seekTrim(seconds){
  if(!trimEditingId)return;queueScrubFrame(seconds);trimSeekTarget=seconds;
  if(inlineHost?.id==='trimVideoHost'&&inlineHost.dataset.preview===trimEditingId){inlinePlayer?.pause();flushTrimSeek();return;}
  if(trimSeekOpening)return;trimSeekOpening=true;const id=trimEditingId;
  showFootage(id,$('#trimVideoHost')).finally(()=>{trimSeekOpening=false;if(trimEditingId===id)flushTrimSeek();});
}
function setTrimFrames(first,last,seek){
  $('#trimStart').value=(first/30).toFixed(3);$('#trimEnd').value=(last/30).toFixed(3);updateTrimInfo();
  seekTrim(seek/30);
}
let trimGesture=null;
$('#trimTimeline').onpointerdown=e=>{
  if(e.button!==0||!trimEditingId)return;const rect=e.currentTarget.getBoundingClientRect(),max=Math.floor(media.get(trimEditingId).duration*30+1e-7),t=readTrim(),frame=Math.round(Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*max);
  const kind=e.target.id==='trimInHandle'?'in':e.target.id==='trimOutHandle'?'out':e.target.id==='trimSelection'?'move':'seek';
  trimGesture={kind,x:e.clientX,rect,max,first:Math.round(t.start*30),last:Math.round(t.end*30)};
  e.currentTarget.setPointerCapture(e.pointerId);e.preventDefault();
  seekTrim((kind==='in'?trimGesture.first:kind==='out'?trimGesture.last:frame)/30);
};
$('#trimTimeline').onpointermove=e=>{
  if(!trimGesture)return;const g=trimGesture,delta=Math.round((e.clientX-g.x)/g.rect.width*g.max);let first=g.first,last=g.last;
  if(g.kind==='in')first=Math.min(last-1,Math.max(0,first+delta));
  else if(g.kind==='out')last=Math.max(first+1,Math.min(g.max,last+delta));
  else if(g.kind==='move'){first=Math.max(0,Math.min(g.max-(last-first),first+delta));last=first+g.last-g.first;}
  else {seekTrim(Math.max(0,Math.min(g.max,Math.round((e.clientX-g.rect.left)/g.rect.width*g.max)))/30);return;}
  setTrimFrames(first,last,g.kind==='out'?last:first);
};
$('#trimTimeline').onpointerup=e=>{if(trimGesture?.kind==='move'&&Math.abs(e.clientX-trimGesture.x)<3&&inlinePlayer){seekTrim(Math.max(0,Math.min(trimGesture.max,Math.round((e.clientX-trimGesture.rect.left)/trimGesture.rect.width*trimGesture.max)))/30);}trimGesture=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);};
$('#trimTimeline').onpointercancel=()=>{trimGesture=null;};
for(const id of ['trimInHandle','trimOutHandle'])$('#'+id).onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const t=readTrim(),max=Math.floor(media.get(trimEditingId).duration*30+1e-7),delta=(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?30:1);let first=Math.round(t.start*30),last=Math.round(t.end*30);if(id==='trimInHandle')first=Math.max(0,Math.min(last-1,e.key==='Home'?0:e.key==='End'?last-1:first+delta));else last=Math.max(first+1,Math.min(max,e.key==='Home'?first+1:e.key==='End'?max:last+delta));setTrimFrames(first,last,id==='trimInHandle'?first:last);};
for(const key of ['trimStart','trimEnd'])$('#'+key).oninput=()=>{updateTrimInfo();try{const t=readTrim();seekTrim(key==='trimStart'?t.start:t.end);}catch{}};
$('#previewTrim').onclick=async()=>{try{const t=readTrim();if(!inlinePlayer||inlineHost?.dataset.preview!==trimEditingId)await showFootage(trimEditingId,$('#trimVideoHost'));if(!inlinePlayer)return;const player=inlinePlayer;trimSeekTarget=null;scrubEpoch++;scrubPending=null;$('#trimVideoHost .scrubFrame')?.remove();if(!player.paused){player.pause();return;}if(player.currentTime<t.start||player.currentTime>=t.end)player.currentTime=t.start;player.ontimeupdate=()=>{if(!player.paused&&!trimGesture&&trimSeekTarget===null&&player.currentTime>=readTrim().end){player.pause();}updateTrimPlayhead();};await player.play();}catch(e){toast(e.message,true);}};
$('#trimAudioMode').onchange=()=>{if(inlinePlayer&&inlineHost?.id==='trimVideoHost')inlinePlayer.muted=$('#trimAudioMode').value==='mute';};
$('#applyTrim').onclick=()=>{try{const t=readTrim();state.draft.trims??={};state.draft.trims[trimEditingId]=t;state.draft.audioModes??={};state.draft.audioModes[trimEditingId]=$('#trimAudioMode').value;stopFootage();closeTrim();changed();renderGroups();renderHook();renderBody();toast('Đã lưu chỉnh sửa footage.');}catch(e){toast(e.message,true);}};
$('#resetTrim').onclick=()=>{if(!trimEditingId)return;delete (state.draft.trims||{})[trimEditingId];stopFootage();closeTrim();changed();renderGroups();renderHook();renderBody();toast('Đã khôi phục toàn bộ thời lượng footage.');};
$('#trimVideoHost').onclick=()=>$('#previewTrim').click();
$('#trimVideoHost').title='Bấm để phát / tạm dừng video';
$('#trimEditor').addEventListener('cancel',e=>{e.preventDefault();closeTrim();});
$('#trimEditor').addEventListener('click',e=>{if(e.target!==$('#trimEditor'))return;const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeTrim();});
$('#closeTrim').onclick=()=>{stopFootage();closeTrim();};
let inlinePlayer=null,inlineHost=null,previewRequest=0;
const thumbCache=new Map();
const thumbObserver=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){const img=entry.target;thumbObserver.unobserve(img);api('thumbnail',img.dataset.thumb).then(url=>{if(thumbCache.size>1000)thumbCache.delete(thumbCache.keys().next().value);thumbCache.set(img.dataset.thumb,url);if(img.isConnected)img.src=url;}).catch(()=>{if(img.isConnected)img.alt='Không có ảnh xem trước';});}},{rootMargin:'60px'});
function thumb(id,duration){return `<div class="footageThumb" data-preview="${esc(id)}"><img data-thumb="${esc(id)}" alt="Ảnh xem trước" draggable="false" ${thumbCache.has(id)?'src="'+thumbCache.get(id)+'"':''}><button class="thumbPlay" title="Phát ngay trên thẻ" aria-label="Phát footage">▶</button><span class="thumbDuration">${fmt(displayRange(id,duration).duration)}</span><button class="trimFootage ${(state?.draft.trims?.[id]||(state?.draft.audioModes?.[id]&&state.draft.audioModes[id]!=='original'))?'trimmed':''}" title="Chỉnh sửa điểm cắt và âm thanh" aria-label="Chỉnh sửa footage">✎</button></div>`;}
function bindThumbs(root){root.querySelectorAll('[data-preview]').forEach(host=>{const img=host.querySelector('img');if(!img.getAttribute('src'))thumbObserver.observe(img);host.querySelector('.trimFootage').onclick=()=>openTrim(host.dataset.preview);host.querySelector('.thumbPlay').onclick=()=>showFootage(host.dataset.preview,host);});}
function stopFootage(){previewRequest++;if(inlinePlayer){inlinePlayer.pause();inlinePlayer.removeAttribute('src');inlinePlayer.load();inlinePlayer.remove();inlinePlayer=null;}inlineHost?.classList.remove('playing');inlineHost=null;}
async function showFootage(id,host){document.querySelectorAll('#assignedMusic audio').forEach(a=>a.pause());host||=[...document.querySelectorAll('[data-preview]')].find(el=>el.dataset.preview===id);if(!host)return;
  stopFootage();const request=previewRequest;
  try{const r=await api('preview',id);if(request!==previewRequest||!host.isConnected)return;
    inlineHost=host;host.classList.add('playing');const player=document.createElement('video');inlinePlayer=player;player.controls=host.id!=='trimVideoHost';player.muted=(host.id==='trimVideoHost'?$('#trimAudioMode').value:state.draft.audioModes?.[id])==='mute';player.playsInline=true;player.preload='metadata';player.src=r.url;host.append(player);
    player.ondragstart=e=>e.preventDefault();player.onerror=()=>toast('Không phát được codec này. Hãy dùng file MP4/H.264 để xem trong tool.',true);
    const range=displayRange(id);player.onplay=()=>{if(trimEditingId!==id&&state.draft.trims?.[id]&&(player.currentTime<range.start||player.currentTime>=range.end))player.currentTime=range.start;};player.onloadedmetadata=()=>{player.currentTime=range.start;flushTrimSeek();};player.onseeked=()=>{updateTrimPlayhead();flushTrimSeek();};player.addEventListener('play',()=>{if(host.id==='trimVideoHost')$('#previewTrim').textContent='❚❚ Tạm dừng';});player.addEventListener('pause',()=>{if(host.id==='trimVideoHost')$('#previewTrim').textContent='▶ Xem video';});player.ontimeupdate=()=>{updateTrimPlayhead();if(trimEditingId!==id&&state.draft.trims?.[id]&&player.currentTime>=range.end)player.pause();};
    if(host.id==='trimVideoHost'){player.preload='auto';player.load();$('#previewTrim').textContent='▶ Xem video';}else await player.play().catch(()=>{});
  }catch(e){toast(e.message,true);}
}
new MutationObserver(()=>{if(inlineHost&&!inlineHost.isConnected)stopFootage();}).observe(document.body,{childList:true,subtree:true});
$('#deleteNiche').onclick=async()=>{const id=state.id,name=state.name;const value=await ask('Xóa ngách “'+name+'”?','','Gõ XÓA để bỏ ngách, thiết lập và lịch sử của ngách khỏi tool. File footage và project CapCut trên ổ đĩa được giữ nguyên.');if(value==='XÓA')await run('Xóa ngách…',async()=>{stopFootage();accept(await api('deleteNiche',id));await detect();toast('Đã xóa ngách “'+name+'”.');});};

$('#niche').onchange=async e=>{const id=e.target.value;await run('Chuyển ngách…',async()=>{accept(await api('load',id));if(!$('#remixPanel').hidden)await window.refreshRemixContext?.();});};
$('#newNiche').onclick=async()=>{const name=await ask('Tạo ngách mới','','Mỗi ngách có thư mục, thiết lập, draft và lịch sử footage riêng.');if(name?.trim())await run('Tạo ngách…',async()=>{accept(await api('createNiche',name));await detect();});};
$('#renameNiche').onclick=async()=>{const name=await ask('Đổi tên ngách',state.name);if(name?.trim()){state.name=name.trim();niches.find(n=>n.id===state.id).name=state.name;changed();render();}};
$('#projectName').oninput=e=>{state.draft.name=e.target.value;state.draft.autoName=false;changed();};
$('#fixName').onclick=()=>run('Kiểm tra tên…',async()=>{state.draft.name=await api('fixName',state);await save();$('#projectName').value=state.draft.name;toast('Đã sửa ký tự và tránh tên trùng.');});
$('#newDraft').onclick=()=>run('Tạo draft mới…',async()=>{accept(await api('newDraft',state));toast('Đã tạo draft trống, giữ thiết lập của ngách.');});
$('#pickParent').onclick=async()=>{const folder=await api('choose','folder');if(folder){state.parent=folder;changed();$('#parentPath').textContent=folder;}};
$('#importParent').onclick=()=>run('Đọc thư mục cha…',async()=>{if(!state.parent)throw Error('Hãy chọn thư mục cha trước.');accept(await api('importParent',state));toast('Đã đọc các nhóm con.');});
$('#addGroup').onclick=async()=>{const name=await ask('Thêm nhóm footage','Nhóm '+(state.groups.length+1));if(name?.trim()){state.groups.push({id:uuid(),name:name.trim(),folder:'',items:[]});changed();renderGroups();renderPattern();}};
$('#scanPattern').onclick=()=>run('Quét các thư mục trong Pattern…',async()=>{const v=await api('scanPattern',state);accept(v);toast('Đã quét '+v.scanSummary.groups+' nhóm trong Pattern.'+(v.scanSummary.errors?' Có '+v.scanSummary.errors+' lỗi thư mục/file; các thư mục lỗi giữ nguyên dữ liệu.':''),!!v.scanSummary.errors);});
$('#search').oninput=renderGroups;$('#unusedOnly').onchange=renderGroups;
$('#appendPattern').onclick=()=>{const id=$('#patternGroup').value;if(!id)return;state.draft.pattern.push(id);changed();renderPattern();};
$('#resetPattern').onclick=()=>{state.draft.pattern=state.groups.map(g=>g.id);changed();renderPattern();};
$('#target').oninput=e=>{state.draft.target=Number(e.target.value);changed();renderBody();};
$('#generate').onclick=()=>run('Tạo Body theo pattern…',async()=>{accept(await api('generate',state));toast('Đã tạo Body: '+bodyCountText()+'.'+(shortFillStatus()?' Có clip ngắn chưa đủ footage để bù.':''));if(['body',...(state.draft.hook.length?['hook']:[])].every(k=>state.draft.music[k])){accept(await api('music',{state,rerandom:false}));toast('Đã tạo '+bodyCountText()+' và gán nhạc theo block.'+(shortFillStatus()?' Có clip ngắn chưa đủ footage để bù.':''));}});
for(const [button,key] of [['pickIntro','intro'],['pickEnd','end']])$('#'+button).onclick=async()=>{const file=await api('choose',key==='end'?'end':'video');if(file)await run('Đọc media…',async()=>{const selected=await api('inspect',file);if(selected.error||!selected.width||!selected.height)throw Error('Không đọc được media đã chọn.');state.draft[key]=selected;await save();render();});};
for(const [button,key] of [['clearIntro','intro'],['clearEnd','end']])$('#'+button).onclick=()=>{state.draft[key]=null;if(key==='end')delete state.draft.assignments.end;changed();render();};
$('#introPosition').onchange=e=>{state.draft.introPosition=e.target.value;$('#introAfter').hidden=e.target.value!=='afterBlocks';changed();};
$('#introAfter').oninput=e=>{state.draft.introAfterBlocks=Number(e.target.value);changed();};
$('#musicAudioMode').onchange=e=>{state.draft.musicAudioMode=e.target.value;changed();};
for(const id of ['hookDelay','fade','audioVolumeDb'])$('#'+id).oninput=e=>{state.draft[id]=Number(e.target.value);changed();};
document.querySelectorAll('[data-setting]').forEach(e=>e.addEventListener('input',()=>{setSetting(e.dataset.setting,e.type==='checkbox'?e.checked:e.type==='number'?Number(e.value)/(e.dataset.percent?100:1):e.value);changed();if(e.dataset.setting==='pinPriority')renderGroups();if(e.dataset.setting==='transition.type')renderLocalTransitions();if(['transition.type','blockSize','shortClipFill.enabled','shortClipFill.threshold'].includes(e.dataset.setting))renderBody();if(e.dataset.setting==='blockSize')renderMusic();}));
$('#fillMusic').onclick=()=>run('Gán nhạc còn thiếu…',async()=>{accept(await api('music',{state,rerandom:false}));toast('Nhạc đã được gán và khóa theo draft.');});
$('#randomMusic').onclick=()=>run('Đang random lại nhạc…',async()=>{accept(await api('music',{state,rerandom:true}));toast('Đã random lại tất cả nhạc.');});
$('#endDuration').oninput=e=>{if(state.draft.end?.kind==='image'){state.draft.end.duration=Number(e.target.value);changed();renderBody();}};
$('#pickDestination').onclick=async()=>{const p=await api('choose','folder');if(p){state.draft.destination=p;changed();$('#destination').textContent=p;await run('Kiểm tra CapCut…',detect);}};
$('#mode').onchange=e=>{state.draft.mode=e.target.value;changed();detect();};
$('#scanTransitions').onclick=()=>run('Đọc chuyển cảnh CapCut đã tải…',async()=>{const r=await api('transitions');transitionCatalog=r.items;renderLocalTransitions();toast('Đã tìm thấy '+r.items.length+' chuyển cảnh đã tải.'+(r.warnings.length?' '+r.warnings.join(' '):''));});
$('#transitionSearch').oninput=renderLocalTransitions;
$('#localTransition').onchange=e=>{state.draft.transition.resource=transitionCatalog.find(r=>r.effectId===e.target.value)||null;changed();renderLocalTransitions();};
$('#detect').onclick=()=>run('Kiểm tra CapCut…',detect);
$('#check').onclick=()=>run('Kiểm tra dự án…',async()=>showChecks(await api('check',state)));
$('#build').onclick=()=>run('Kiểm tra và tạo dự án…',async()=>{const r=await api('build',state);if(r.view)accept(r.view);showChecks(r.check);if(r.result)toast(r.result.kind==='capcut'?'Đã tạo dự án editable. Mở CapCut để chỉnh sửa; lịch sử footage đã được lưu.':'Đã lưu bản kế hoạch; chưa phải dự án CapCut.');});
$('#openOutput').onclick=()=>run('Mở thư mục đầu ra…',()=>api('openOutput'));
function toggleSettings(open){$('#settingsSidebar').hidden=!open;$('#toggleSettings').setAttribute('aria-expanded',String(open));if(open)$('#closeSettings').focus();else $('#toggleSettings').focus();}
$('#toggleSettings').onclick=()=>toggleSettings($('#settingsSidebar').hidden);
$('#closeSettings').onclick=()=>toggleSettings(false);
$('#closeChecks').onclick=()=>{$('#checkPanel').hidden=true;$('#check').focus();};
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#promptDialog').open){if(!$('#checkPanel').hidden)$('#checkPanel').hidden=true;else if(!$('#settingsSidebar').hidden)toggleSettings(false);}});
document.addEventListener('dragend',()=>{drag=null;document.querySelectorAll('.dragover').forEach(e=>e.classList.remove('dragover'));});
(async()=>{try{accept(await api('load'));await detect();}catch(e){window.__lastError=e.message;toast('Không khởi động được: '+e.message,true);}})();

$('#trimEditor').addEventListener('keydown',e=>{if(e.code!=='Space'&&e.key!==' ')return;if(e.target.closest('input,select,textarea,[contenteditable=true]'))return;e.preventDefault();e.stopPropagation();if(!e.repeat)$('#previewTrim').click();});

$('#openProjectMusic').onclick=()=>{toggleSettings(true);$('#assignedMusic').closest('details').open=true;$('#assignedMusic').scrollIntoView({block:'start',behavior:'smooth'});};
function expandLibrary(on){document.body.classList.toggle('libraryExpanded',on);const b=$('#expandLibrary');b.textContent=on?'⛶ Thu gọn':'⛶ Phóng to';b.title=on?'Trở lại bố cục cũ (Esc)':'Phóng to riêng thư viện footage';b.setAttribute('aria-expanded',String(on));if(on)toggleSettings(false);}
$('#expandLibrary').onclick=()=>expandLibrary(!document.body.classList.contains('libraryExpanded'));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!document.querySelector('dialog[open]')&&document.body.classList.contains('libraryExpanded')){e.preventDefault();expandLibrary(false);$('#expandLibrary').focus();}});
