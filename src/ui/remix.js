'use strict';
let remixData=null,remixBatch=null,remixContext=null,remixLoadEpoch=0;
const deleteBatchButton=document.createElement('button');deleteBatchButton.id='remixDelete';deleteBatchButton.textContent='Xóa bộ';deleteBatchButton.disabled=true;$('#remixFromBatch').after(deleteBatchButton);
const contextLabel=document.createElement('p');contextLabel.className='muted';$('#remixBatches').before(contextLabel);
const deleteDialog=document.createElement('dialog');deleteDialog.innerHTML='<form method="dialog"><h2>Xóa bộ đã lưu?</h2><p id="remixDeleteName"></p><p>Chỉ xóa bộ và bản nháp trong tool. Giữ footage, dự án CapCut và lịch sử đã sử dụng.</p><div class="row"><button value="cancel">Hủy</button><button value="delete">Xóa bộ</button></div></form>';document.body.append(deleteDialog);
deleteBatchButton.onclick=()=>{if(!remixBatch)return;const id=remixBatch.id,stateId=state.id;$('#remixDeleteName').textContent=remixBatch.name;deleteDialog.onclose=()=>{if(deleteDialog.returnValue==='delete')run('Xóa bộ…',async()=>{await api('remixDelete',{id,stateId});remixBatch=null;await loadRemix();toast('Đã xóa bộ khỏi danh sách.');});};deleteDialog.showModal();};
const batchSettingsButton=document.createElement('button');batchSettingsButton.textContent='Thiết lập cả bộ';batchSettingsButton.id='remixBatchSettings';$('#remixExport').before(batchSettingsButton);batchSettingsButton.onclick=()=>window.openRemixBatchSettings(remixBatch.id);
const appendSourcesButton=document.createElement('button');
appendSourcesButton.textContent='Thêm vào bộ nguồn';appendSourcesButton.title='Thêm video nguồn đang chọn ở cột bên trái và trộn lại các bản nháp chưa xuất';
$('#remixFromBatch').after(appendSourcesButton);
appendSourcesButton.onclick=()=>run('Thêm video vào bộ nguồn…',async()=>{
 remixBatch=await api('remixAddToSource',{id:remixBatch.id,stateId:state.id,sourceIds:[...$('#remixSources').querySelectorAll('input:checked')].map(x=>x.value)});
 await loadRemix();toast('Đã thêm video vào bộ nguồn. Mở bộ nhân bản để cập nhật.');
});
const updateSourceButton=document.createElement('button');updateSourceButton.textContent='Cập nhật từ bộ nguồn';$('#remixFromBatch').after(updateSourceButton);
updateSourceButton.onclick=()=>run('Cập nhật bộ nhân bản…',async()=>{
 const id=remixBatch.id;await api('remixUpdateSource',{id,stateId:state.id});remixBatch=await api('remixGet',id);await loadRemix();toast('Đã cập nhật bản nháp. Hãy gán lại nhạc.');
});

window.refreshRemixContext=()=>loadRemix();
window.renderChannels=()=>{const list=window.remixChannels||[];$('#channel').innerHTML=list.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');$('#channel').value=state.id;$('#renameChannel').disabled=$('#deleteChannel').disabled=state.id===(state.rootNicheId||state.id);};
$('#channel').onchange=e=>run('Chuyển kênh…',async()=>{accept(await api('channelSwitch',e.target.value));if(!$('#remixPanel').hidden)await loadRemix();});
async function newChannel(){const name=await ask('Tên kênh mới','','Lịch sử riêng; dùng chung thư viện của ngách.');if(name?.trim())await run('Tạo kênh…',async()=>{accept(await api('channelCreate',{id:state.id,name:name.trim()}));if(!$('#remixPanel').hidden)await loadRemix();});}
$('#renameChannel').onclick=async()=>{
 const id=state.id,current=$('#channel').selectedOptions[0]?.textContent||'';
 const name=await ask('Đổi tên kênh',current,'Áp dụng cho kênh này trên tất cả ngách. Dự án mới dùng tiền tố tên kênh mới.');
 if(!name?.trim()||name.trim()===current)return;
 await run('Đổi tên kênh…',async()=>{
  accept(await api('channelRename',{id,name:name.trim()}));
  if(!$('#remixPanel').hidden)await loadRemix();
  toast('Đã đổi tên kênh trên tất cả ngách.');
 });
};
$('#deleteChannel').onclick=async()=>{
 if(busy||state.id===(state.rootNicheId||state.id))return;
 const id=state.id,name=state.channelName;
 const niches=await api('channelDeleteScope',id);
 if(!await confirmRemoval('Xóa kênh “'+name+'” khỏi tất cả ngách?', 'Các ngách bị ảnh hưởng: '+niches.join(', ')+'. Bản nháp, bộ nhân bản và lịch sử của kênh trong các ngách này sẽ bị xóa khỏi tool. File footage và dự án CapCut trên ổ đĩa được giữ nguyên.'))return;
 await run('Xóa kênh…',async()=>{stopFootage();accept(await api('channelDelete',id));await loadRemix();toast('Đã xóa kênh “'+name+'” khỏi tất cả ngách.');});
};
const trashDialog=document.createElement('dialog');
trashDialog.innerHTML='<h2>Khôi phục kênh đã xóa</h2><p>Chọn các bản cần lấy lại. Nếu ngách đã bị xóa, tool sẽ khôi phục cả ngách gốc cùng dự án và lịch sử của nó.</p><div data-list style="max-height:48vh;overflow:auto"></div><div class="row"><button data-close>Đóng</button><button data-restore class="primary">Khôi phục mục đã chọn</button></div>';
document.body.append(trashDialog);
trashDialog.querySelector('[data-close]').onclick=()=>trashDialog.close();
$('#deletedChannels').onclick=()=>run('Đọc các kênh đã xóa…',async()=>{
 const rows=await api('deletedChannels'),list=trashDialog.querySelector('[data-list]'),save=trashDialog.querySelector('[data-restore]');
 list.innerHTML=rows.map((r,i)=>'<label style="display:block"><input type="checkbox" value="'+i+'"> '+esc(r.name)+' · '+esc(r.niche)+' · '+esc(new Date(r.deletedAt).toLocaleString('vi-VN'))+(r.restoreRoot?' · Khôi phục cả ngách':'')+'</label>').join('')||'Chưa có kênh đã xóa.';
 save.disabled=true;
 list.onchange=()=>{save.disabled=!list.querySelector('input:checked');};
 save.onclick=()=>run('Khôi phục kênh và ngách…',async()=>{
  const selected=[...list.querySelectorAll('input:checked')].map(el=>rows[Number(el.value)]);
  accept(await api('restoreChannels',selected.map(({key,id})=>({key,id}))));
  trashDialog.close();await loadRemix();toast('Đã khôi phục '+selected.length+' mục.');
 });
 trashDialog.showModal();
});
$('#newChannel').onclick=newChannel;
$('#showEditor').onclick=()=>{document.body.classList.remove('remixMode');$('#remixPanel').hidden=true;render();};
$('#showRemix').onclick=()=>run('Mở nhân bản…',async()=>{document.body.classList.add('remixMode');render();$('#remixPanel').hidden=false;await loadRemix();});
async function loadRemix(){
 const context=state.id,epoch=++remixLoadEpoch;
 if(remixContext!==context){remixBatch=null;remixContext=context;$('#remixRows').innerHTML='';$('#remixBatches').textContent='Đang tải…';renderRemix();}
 const result=await api('remixList',context);if(epoch!==remixLoadEpoch||state.id!==context)return;remixData=result;
 const activeChannel=remixData.channels.find(c=>c.id===context);contextLabel.textContent='Bộ đã lưu · '+state.name+' · '+(activeChannel?.name||'Kênh gốc');
 const visibleBatches=remixData.batches.filter(b=>!b.count||b.channelId===context);


 $('#remixSources').innerHTML=remixData.sources.map(p=>`<label class="remixSource"><input type="checkbox" value="${esc(p.id)}"><span>${esc(p.name)}<small>${esc(p.channel)}</small></span></label>`).join('')||'<p class="muted">Chưa có dự án CapCut trong lịch sử. Có thể nhập gói nhân bản từ máy khác.</p>';
 if(remixBatch&&!visibleBatches.some(b=>b.id===remixBatch.id))remixBatch=null;
 $('#remixBatches').innerHTML=['source','draft'].map(kind=>{
  const batches=visibleBatches.filter(b=>kind==='source'?!b.count:!!b.count);
  return '<section><h3>'+(kind==='source'?'Bộ nguồn dùng chung trong ngách':'Bộ nhân bản của kênh đang chọn')+'</h3><div class="batchCardGrid">'+(batches.map(b=>`<button class="batchCard" data-batch="${esc(b.id)}"><strong>${esc(b.name)}</strong><small>${kind==='source'?b.sourceCount+' video nguồn':b.count+' video · '+b.created+' đã xuất · '+(b.count-b.created)+' bản nháp'}</small></button>`).join('')||'<small class="muted">Chưa có bộ nào</small>')+'</div></section>';
 }).join('');
 $('#remixBatches').querySelectorAll('[data-batch]').forEach(button=>button.onclick=()=>run('Đọc bộ dự án…',async()=>{remixBatch=await api('remixGet',button.dataset.batch);renderRemix();}));

 renderRemix();
}
$('#remixSelectAll').onclick=()=>$('#remixSources').querySelectorAll('input').forEach(x=>x.checked=true);
$('#remixSelectNone').onclick=()=>$('#remixSources').querySelectorAll('input').forEach(x=>x.checked=false);

$('#remixFromBatch').onclick=async()=>{
 if(busy||!remixBatch||remixBatch.projects.length)return;
 const sourceId=remixBatch.id,channelId=state.id;
 try{
  await loadTargetSettings();
  if(state.id!==channelId||remixBatch?.id!==sourceId)return;
  const dialog=$('#remixCreateDialog');
  $('#remixName').value=remixBatch.name+' · '+(state.channelName==='Kênh gốc'?state.name:state.channelName);
  $('#remixCreateContext').textContent='Nguồn: '+remixBatch.name+' · Kênh: '+(state.channelName||state.name);
  dialog.returnValue='';
  dialog.onclose=()=>{
   if(dialog.returnValue!=='create')return;
   const name=$('#remixName').value.trim();
   if(!name){toast('Hãy nhập tên bộ nhân bản.',true);return;}
   run('Tạo bộ nhân bản…',async()=>{
    remixBatch=await api('remixCreate',{stateId:channelId,sourceBatchId:sourceId,channelId,name,options:{mixHook:$('#mixHook').checked,balance:false,durationBalance:$('#balanceBlocks').checked,durationTarget:Number($('#durationTarget').value),keepPosition:$('#durationPosition').checked}});
    await loadRemix();toast('Đã tạo bộ bản nháp. Chọn Chỉnh sửa để hoàn thiện từng video.');
   });
  };
  dialog.showModal();$('#remixName').focus();$('#remixName').select();
 }catch(e){toast(e.message,true);}
};
function renderRemix(){
 $('#remixBatches').querySelectorAll('[data-batch]').forEach(button=>{const active=button.dataset.batch===remixBatch?.id;button.classList.toggle('selected',active);button.setAttribute('aria-pressed',String(active));});

 const b=remixBatch;appendSourcesButton.hidden=!b||!!b.projects.length;updateSourceButton.hidden=!b?.projects.length;updateSourceButton.disabled=!b?.sourceUpdate?.count;updateSourceButton.textContent=b?.sourceUpdate?.count?'Cập nhật từ bộ nguồn · '+b.sourceUpdate.count+' video mới':'Chưa có video nguồn mới';deleteBatchButton.disabled=!b;batchSettingsButton.disabled=!b?.projects.some(p=>!p.installed);$('#remixResult').hidden=!b;$('#remixFromBatch').hidden=!b||!!b.projects.length;$('#remixFromBatch').disabled=!b||!!b.projects.length||!b.sources?.length;
 if(!b){$('#remixRows').innerHTML='';$('#remixChecks').textContent='';return;}$('#remixSourceSummary').hidden=!!b.projects.length;$('#remixSourceSummary').textContent=b.sources.length+' dự án nguồn đã lưu. Bấm Nhân bản cho kênh này để tạo cho kênh trên header, hoặc xuất gói chuyển máy.';for(const id of ['remixInstall','remixCheck','remixAssignMusic'])$('#'+id).disabled=!b.projects.length;
 $('#remixRelink').hidden=!b.assetManifest;$('#remixBatchTitle').textContent=b.name;$('#remixHookFolder').textContent=b.musicFolders?.hook||'Chọn thư mục nhạc Hook';$('#remixBodyFolder').textContent=b.musicFolders?.body||'Chọn thư mục nhạc Body';
 $('#remixRows').innerHTML=b.projects.map(p=>`<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.sourceName)}</small></td><td>${p.blocks[0]?.clips.length||0} Hook + ${p.blocks.slice(1).reduce((n,b)=>n+b.clips.length,0)} Body<br><small>${p.blocks.length} block</small></td><td>${fmt(p.draft.duration/1e6)}</td><td>${p.reusedPercent===null?'Chưa xác định':p.reusedPercent+'%'}<small>${p.reusedCount===null?'Không xác định được nguồn':p.reusedCount+' / '+p.bodyCount+' clip Body thuộc video nguồn'}</small></td><td>${p.installed?'Đã tạo CapCut':p.editedAt?'Đã chỉnh sửa':p.assignments.length?'Đã gán nhạc':'Chưa gán nhạc'}</td><td><div class="row"><button data-remix-edit="${esc(p.id)}">Chỉnh sửa</button><button data-remix-view="${esc(p.id)}">Xem</button><button title="Giữ nguyên dự án khi cân bằng hoặc cập nhật cả bộ; vẫn chỉnh sửa riêng được" data-remix-lock="${esc(p.id)}">${p.installed?(p.mixUnlocked&&!p.locked?'🔓 Cho phép trộn':'🔒 Mở khóa để trộn'):p.locked?'🔒 Giữ nguyên':'🔓 Cho phép trộn'}</button></div></td></tr>`).join('');
 $('#remixRows').querySelectorAll('[data-remix-edit]').forEach(el=>el.onclick=()=>window.openRemixEditor(b.id,el.dataset.remixEdit));
 $('#remixRows').querySelectorAll('[data-remix-view]').forEach(el=>el.onclick=()=>viewRemixProject(el.dataset.remixView));
 $('#remixRows').querySelectorAll('[data-remix-lock]').forEach(el=>el.onclick=()=>run('Lưu khóa…',async()=>{remixBatch=await api('remixLock',{id:b.id,projectId:el.dataset.remixLock});renderRemix();}));
 $('#remixChecks').textContent=b.balanceReport?balanceSummary(b.balanceReport):b.transferIssues?.length?`${b.transferIssues.length} tài nguyên chưa ghép được khi nhập gói. Kiểm tra trước khi tạo.`:'';
}
for(const kind of ['hook','body'])$('#remix'+(kind==='hook'?'Hook':'Body')+'Folder').onclick=async()=>{const folder=await api('choose','folder');if(folder&&remixBatch){remixBatch.musicFolders??={};remixBatch.musicFolders[kind]=folder;renderRemix();}};
$('#remixAssignMusic').onclick=()=>run('Random nhạc mới theo block…',async()=>{remixBatch=await api('remixMusic',{id:remixBatch.id,folders:remixBatch.musicFolders||{}});renderRemix();});
$('#remixCheck').onclick=()=>run('Kiểm tra bộ dự án…',async()=>{const c=await api('remixCheck',remixBatch.id);$('#remixChecks').textContent=c.ok?'Đã đủ footage và nhạc. Sẵn sàng tạo CapCut.':[...c.issues,...c.missing.map(p=>'Thiếu file: '+p)].join('\n');});
$('#remixInstall').onclick=()=>run('Tạo bộ dự án CapCut…',async()=>{try{remixBatch=await api('remixInstall',remixBatch.id);toast('Đã tạo bộ dự án CapCut.');}finally{remixBatch=await api('remixGet',remixBatch.id);renderRemix();}});
$('#remixExport').onclick=()=>run('Đóng gói dữ liệu nhân bản…',async()=>{const r=await api('remixExport',remixBatch.id);if(r)toast('Đã xuất gói: '+r.path+(r.missing.length?' · '+r.missing.length+' file nguồn chưa có dấu vân tay':''));});
$('#remixImport').onclick=()=>run('Đối chiếu file trên máy này…',async()=>{const p=await api('remixImportPreview');if(!p)return;$('#remixImportSummary').textContent=`${p.name}\n${p.projects} dự án · ${p.matched} file khớp\n${p.missing.length} file chưa tìm thấy · ${p.duplicates.length} file có nhiều bản cùng nội dung\n`+p.missing.map(m=>m.path+' — '+m.reason).join('\n');$('#remixImportDialog').showModal();});
$('#remixImportCancel').onclick=()=>$('#remixImportDialog').close();
$('#remixImportConfirm').onclick=()=>{ $('#remixImportDialog').close();run('Nhập bộ dự án…',async()=>{const r=await api('remixImportCommit');accept(r.view);remixBatch=r.batch;await loadRemix();toast(r.alreadyImported?'Gói này đã được nhập trước đó.':'Đã nhập thành một bộ riêng.');});};
function viewRemixProject(id){
 const p=remixBatch.projects.find(p=>p.id===id);$('#remixPreviewTitle').textContent=p.name;
 $('#remixPreviewBlocks').innerHTML=p.blocks.map((b,bi)=>`<section><h3>${b.hook?'Hook':'Body · Block '+bi} <small>${fmt(b.duration/1e6)}</small></h3><div class="remixClipList">${b.clips.map((c,ci)=>`<button data-bi="${bi}" data-ci="${ci}"><span>${esc(c.name||shortPath(c.path))}</span><small>${fmt(c.duration/1e6)}</small></button>`).join('')}</div></section>`).join('');
 $('#remixPreviewBlocks').querySelectorAll('[data-bi]').forEach(el=>el.onclick=async()=>{try{const r=await api('remixPreview',{id:remixBatch.id,projectId:id,blockIndex:Number(el.dataset.bi),clipIndex:Number(el.dataset.ci)}),video=$('#remixVideo');video.src=r.url;const parts=r.parts?.length?r.parts:[{start:r.start,duration:3600,speed:1,volume:1}];let index=0;const playPart=()=>{const part=parts[index];video.currentTime=part.start;video.playbackRate=Math.min(4,Math.max(.25,part.speed));video.volume=Math.min(1,Math.max(0,part.volume));video.play().catch(()=>{});};video.onloadedmetadata=playPart;video.ontimeupdate=()=>{if(video.currentTime>=parts[index].start+parts[index].duration-.02){if(index+1<parts.length){index++;playPart();}else video.pause();}};}catch(e){toast(e.message,true);}});
 $('#remixPreviewDialog').showModal();
}
$('#remixPreviewClose').onclick=()=>$('#remixPreviewDialog').close();$('#remixPreviewDialog').addEventListener('close',()=>{$('#remixVideo').pause();$('#remixVideo').removeAttribute('src');$('#remixVideo').load();});

$('#remixRelink').onclick=()=>run('Đối chiếu lại file…',async()=>{const r=await api('remixRelink',remixBatch.id);if(r){remixBatch=r.batch;renderRemix();toast(r.matched+' file khớp, '+r.missing.length+' file chưa tìm thấy.');}});

async function loadTargetSettings(){const p=await api('remixSettings',state.id),o=p.options||{};$('#mixHook').checked=o.mixHook??true;$('#balanceBlocks').checked=o.durationBalance??true;$('#durationTarget').value=o.durationTarget??30;$('#durationPosition').checked=o.keepPosition??true;}


$('#remixSaveSource').onclick=async()=>{
 if(busy)return;
 const stateId=state.id,sourceIds=[...$('#remixSources').querySelectorAll('input:checked')].map(x=>x.value);
 if(!sourceIds.length){toast('Chọn video nguồn trước khi lưu.',true);return;}
 const name=await ask('Tên bộ nguồn','Bộ nguồn · '+state.name,'Lưu '+sourceIds.length+' video nguồn đã chọn.');
 if(!name?.trim())return;
 await run('Lưu bộ nguồn…',async()=>{
  remixBatch=await api('remixSaveSource',{stateId,sourceIds,name:name.trim()});
  await loadRemix();toast('Đã lưu bộ nguồn. Chọn Nhân bản cho kênh này để tạo bản nháp.');
 });
};

function balanceSummary(r){return 'Chênh lệch '+fmt(r.before)+' → '+fmt(r.after)+' · '+r.changed+' bản nháp thay đổi · Giữ nguyên '+r.skipped+' video đang khóa.'+(r.reached?' Đạt mục tiêu.':' Chưa đạt mục tiêu; đây là kết quả tốt nhất tìm được trong lượt chạy.')+(r.limited?' Đã dừng ở giới hạn thời gian xử lý.':'');}

