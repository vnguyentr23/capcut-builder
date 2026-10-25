(async()=>{
 const checks=[],assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);},pause=ms=>new Promise(r=>setTimeout(r,ms));
 async function until(fn){for(let i=0;i<400;i++){if(fn())return;await pause(50);}throw Error('UI timeout');}
 try{
  await until(()=>!!state);const listing=await api('remixList',state.id),batch=listing.batches.find(b=>b.name==='Kiểm thử bản nháp');assert(batch,'Có bộ 19 bản nháp kiểm thử');
  remixBatch=await api('remixGet',batch.id);const p=remixBatch.projects[0],originalDraft=JSON.stringify(state.draft);
  await window.openRemixEditor(batch.id,p.id);assert(!$('#remixDraftEditor').hidden,'Mở bản nháp trong tool');assert(document.querySelectorAll('.rxCard').length>40,'Hiển thị Hook và Body theo block');assert(document.querySelectorAll('.rxEdited[data-edit]').length>0,'Bút chì xanh cho cảnh đã chỉnh');
  await until(()=>document.querySelector('[data-rx-thumb]')?.getAttribute('src'));
  const first=document.querySelector('[data-edit]');first.click();await until(()=>$('#rxEditModal').open);assert(Number($('#rxStart').value)>=0&&Number($('#rxEnd').value)>0,'Khoảng cắt kế thừa đã nạp');assert(['original','keepVocals','removeVocals','mute'].includes($('#rxAudio').value),'Chế độ âm thanh kế thừa đã nạp');
  await until(()=>$('#rxVideo').readyState>=2);assert($('#rxVideo').videoWidth>0,'Video trong Edit giải mã được');
  $('#rxEditModal').dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true,cancelable:true}));await until(()=>!$('#rxVideo').paused);assert(!$('#rxVideo').paused,'Space phát video');$('#rxEditModal').dispatchEvent(new KeyboardEvent('keydown',{code:'Space',key:' ',bubbles:true,cancelable:true}));assert($('#rxVideo').paused,'Space dừng video');
  $('#rxAudio').value='keepVocals';$('#rxAudio').dispatchEvent(new Event('input'));$('#rxApply').click();await until(()=>!$('#rxEditModal').open);assert($('#rxStatus').textContent.includes('Đã chỉnh sửa'),'Áp dụng lưu trạng thái riêng');
  const saved=await api('remixEditOpen',{id:batch.id,projectId:p.id});assert(saved.blocks[0].units[0].parts[0].audioMode==='keepVocals','Lưu chế độ âm thanh đúng đoạn');
  assert(JSON.stringify(state.draft)===originalDraft,'Không ghi đè draft dựng thường');
  $('#rxBack').click();await until(()=>$('#remixDraftEditor').hidden&&!$('#remixDraftEditor').inert);await window.openRemixEditor(batch.id,p.id);assert($('#rxName').value===p.name,'Mở lại đúng bản nháp');
  const r=$('#rxBuild').getBoundingClientRect();assert(r.bottom<=innerHeight&&r.top>=0,'Nút tạo riêng không bị khuất');
  assert(!$('#rxEditModal').open,'Modal đóng sau khi lưu');await pause(1800);
  const img=document.querySelector('[data-rx-thumb]'),sample=await api('remixEditMedia',{id:batch.id,projectId:p.id,unitId:img.dataset.rxThumb});
  assert(img.naturalWidth>0,'Thumbnail hiển thị sau mở lại');
  const blocks=[...document.querySelectorAll('#rxBlocks>.rxBlock')];
  assert(blocks.every(b=>[...b.querySelectorAll('.rxCard')].every(c=>c.getBoundingClientRect().bottom<=b.getBoundingClientRect().bottom)), 'Mỗi block chứa đủ chiều cao footage');
  const rects=blocks.map(b=>b.getBoundingClientRect());assert(rects.every((a,i)=>rects.slice(i+1).every(b=>a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top)),'Các block không chồng lấn');
  assert($('#rxBlocks').scrollHeight>$('#rxBlocks').clientHeight,'Danh sách block cuộn thay vì co chiều cao');return {ok:true,checks};
 }catch(e){return {ok:false,error:e.stack,checks};}
})()
