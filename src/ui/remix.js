'use strict';
let remixData=null,remixBatch=null,remixContext=null,remixLoadEpoch=0;
const deleteBatchButton=document.createElement('button');deleteBatchButton.id='remixDelete';deleteBatchButton.textContent='Xóa bộ';deleteBatchButton.disabled=true;$('#remixFromBatch').after(deleteBatchButton);
const contextLabel=document.createElement('p');contextLabel.className='muted';$('#remixBatches').parentElement.before(contextLabel);
const deleteDialog=document.createElement('dialog');deleteDialog.innerHTML='<form method="dialog"><h2>Xóa bộ đã lưu?</h2><p id="remixDeleteName"></p><p>Chỉ xóa bộ và bản nháp trong tool. Giữ footage, dự án CapCut và lịch sử đã sử dụng.</p><div class="row"><button value="cancel">Hủy</button><button value="delete">Xóa bộ</button></div></form>';document.body.append(deleteDialog);
deleteBatchButton.onclick=()=>{if(!remixBatch)return;const id=remixBatch.id,stateId=state.id;$('#remixDeleteName').textContent=remixBatch.name;deleteDialog.onclose=()=>{if(deleteDialog.returnValue==='delete')run('Xóa bộ…',async()=>{await api('remixDelete',{id,stateId});remixBatch=null;await loadRemix();toast('Đã xóa bộ khỏi danh sách.');});};deleteDialog.showModal();};
const batchSettingsButton=document.createElement('button');batchSettingsButton.textContent='Thiết lập cả bộ';batchSettingsButton.id='remixBatchSettings';$('#remixExport').before(batchSettingsButton);batchSettingsButton.onclick=()=>window.openRemixBatchSettings(remixBatch.id);
window.refreshRemixContext=()=>loadRemix();
window.renderChannels=()=>{const list=window.remixChannels||[];$('#channel').innerHTML=list.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');$('#channel').value=state.id;};
$('#channel').onchange=e=>run('Chuyển kênh…',async()=>{accept(await api('channelSwitch',e.target.value));if(!$('#remixPanel').hidden)await loadRemix();});
async function newChannel(){const name=await ask('Tên kênh mới','','Lịch sử riêng; dùng chung thư viện của ngách.');if(name?.trim())await run('Tạo kênh…',async()=>{accept(await api('channelCreate',{id:state.id,name:name.trim()}));if(!$('#remixPanel').hidden)await loadRemix();});}
$('#newChannel').onclick=newChannel;$('#remixNewChannel').onclick=newChannel;
$('#showEditor').onclick=()=>{document.body.classList.remove('remixMode');$('#remixPanel').hidden=true;render();};
$('#showRemix').onclick=()=>run('Mở nhân bản…',async()=>{document.body.classList.add('remixMode');render();$('#remixPanel').hidden=false;await loadRemix();});
async function loadRemix(){
 const context=state.id,epoch=++remixLoadEpoch;
 if(remixContext!==context){remixBatch=null;remixContext=context;$('#remixRows').innerHTML='';$('#remixBatches').innerHTML='<option>Đang tải…</option>';renderRemix();}
 const result=await api('remixList',context);if(epoch!==remixLoadEpoch||state.id!==context)return;remixData=result;
 const activeChannel=remixData.channels.find(c=>c.id===context);contextLabel.textContent='Bộ đã lưu · '+state.name+' · '+(activeChannel?.name||'Kênh gốc');
 const visibleBatches=remixData.batches.filter(b=>b.channelId===context);

 $('#remixTarget').innerHTML=remixData.channels.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');$('#remixTarget').value=state.id;await loadTargetSettings();
 $('#remixSources').innerHTML=remixData.sources.map(p=>`<label class="remixSource"><input type="checkbox" value="${esc(p.id)}" checked><span>${esc(p.name)}<small>${esc(p.channel)}</small></span></label>`).join('')||'<p class="muted">Chưa có dự án CapCut trong lịch sử. Có thể nhập gói nhân bản từ máy khác.</p>';
 $('#remixBatches').innerHTML='<option value="">Chọn bộ đã lưu…</option>'+visibleBatches.map(b=>`<option value="${esc(b.id)}">${esc(b.name)} · ${b.count?b.count+' dự án · '+b.created+' đã tạo':b.sourceCount+' dự án nguồn'}</option>`).join('');
 if(remixBatch&&visibleBatches.some(b=>b.id===remixBatch.id))$('#remixBatches').value=remixBatch.id;else remixBatch=null;
 renderRemix();
}
$('#remixSelectAll').onclick=()=>$('#remixSources').querySelectorAll('input').forEach(x=>x.checked=true);
$('#remixSelectNone').onclick=()=>$('#remixSources').querySelectorAll('input').forEach(x=>x.checked=false);
$('#remixBatches').onchange=e=>run('Đọc bộ dự án…',async()=>{remixBatch=e.target.value?await api('remixGet',e.target.value):null;renderRemix();});
async function createRemix(fromBatch=false){await run('Trộn footage và dựng bản xem trước…',async()=>{
 const b=await api('remixCreate',{stateId:state.id,sourceIds:[...$('#remixSources').querySelectorAll('input:checked')].map(x=>x.value),sourceBatchId:fromBatch?remixBatch?.id:null,channelId:$('#remixTarget').value,name:$('#remixName').value||'Bộ nhân bản',options:{mixHook:$('#mixHook').checked,balance:$('#balanceBlocks').checked}});
 if(state.id!==b.channelId)accept(await api('channelSwitch',b.channelId));remixContext=state.id;remixBatch=b;await loadRemix();toast('Đã lưu bản nháp. Chọn Chỉnh sửa để hoàn thiện từng video trước khi tạo CapCut.');
});}
$('#remixCreate').onclick=()=>createRemix(false);$('#remixFromBatch').onclick=()=>createRemix(true);
function renderRemix(){
 const b=remixBatch;deleteBatchButton.disabled=!b;batchSettingsButton.disabled=!b?.projects.some(p=>!p.installed);$('#remixResult').hidden=!b;$('#remixFromBatch').disabled=!b;
 if(!b){$('#remixRows').innerHTML='';$('#remixChecks').textContent='';return;}$('#remixSourceSummary').hidden=!!b.projects.length;$('#remixSourceSummary').textContent=b.sources.length+' dự án nguồn đã lưu. Chọn kênh đích rồi bấm Nhân bản từ bộ này, hoặc xuất gói chuyển máy.';for(const id of ['remixInstall','remixCheck','remixAssignMusic'])$('#'+id).disabled=!b.projects.length;
 $('#remixRelink').hidden=!b.assetManifest;$('#remixBatchTitle').textContent=b.name;$('#remixHookFolder').textContent=b.musicFolders?.hook||'Chọn thư mục nhạc Hook';$('#remixBodyFolder').textContent=b.musicFolders?.body||'Chọn thư mục nhạc Body';
 $('#remixRows').innerHTML=b.projects.map(p=>`<tr><td><strong>${esc(p.name)}</strong><small>${esc(p.sourceName)}</small></td><td>${p.blocks[0]?.clips.length||0} Hook + ${p.blocks.slice(1).reduce((n,b)=>n+b.clips.length,0)} Body<br><small>${p.blocks.length} block</small></td><td>${fmt(p.draft.duration/1e6)}</td><td>${p.reusedPercent}%<small>Thứ tự mới</small></td><td>${p.installed?'Đã tạo CapCut':p.editedAt?'Đã chỉnh sửa':p.assignments.length?'Đã gán nhạc':'Chưa gán nhạc'}</td><td><div class="row"><button data-remix-edit="${esc(p.id)}">Chỉnh sửa</button><button data-remix-view="${esc(p.id)}">Xem</button><button data-remix-roll="${esc(p.id)}" ${p.locked||p.installed?'disabled':''}>↻ Trộn</button><button data-remix-lock="${esc(p.id)}" ${p.installed?'disabled':''}>${p.locked?'🔒':'🔓'}</button></div></td></tr>`).join('');
 $('#remixRows').querySelectorAll('[data-remix-edit]').forEach(el=>el.onclick=()=>window.openRemixEditor(b.id,el.dataset.remixEdit));
 $('#remixRows').querySelectorAll('[data-remix-view]').forEach(el=>el.onclick=()=>viewRemixProject(el.dataset.remixView));
 $('#remixRows').querySelectorAll('[data-remix-roll]').forEach(el=>el.onclick=()=>run('Trộn lại dự án…',async()=>{remixBatch=await api('remixReroll',{id:b.id,projectId:el.dataset.remixRoll});renderRemix();}));
 $('#remixRows').querySelectorAll('[data-remix-lock]').forEach(el=>el.onclick=()=>run('Lưu khóa…',async()=>{remixBatch=await api('remixLock',{id:b.id,projectId:el.dataset.remixLock});renderRemix();}));
 $('#remixChecks').textContent=b.transferIssues?.length?`${b.transferIssues.length} tài nguyên chưa ghép được khi nhập gói. Kiểm tra trước khi tạo.`:'';
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

async function loadTargetSettings(){const p=await api('remixSettings',$('#remixTarget').value);const opts={mixHook:true,splitNine:true,balance:true,dangerLimit:false,...p.options};for(const [id,key] of [['mixHook','mixHook'],['balanceBlocks','balance']])$('#'+id).checked=opts[key];}
$('#remixTarget').onchange=()=>loadTargetSettings().catch(e=>toast(e.message,true));

$('#remixSaveSource').onclick=()=>run('Lưu bộ nguồn…',async()=>{remixBatch=await api('remixSaveSource',{stateId:state.id,sourceIds:[...$('#remixSources').querySelectorAll('input:checked')].map(x=>x.value),name:$('#remixName').value||'Bộ nguồn'});await loadRemix();toast('Đã lưu bộ nguồn; có thể xuất sang máy khác.');});
