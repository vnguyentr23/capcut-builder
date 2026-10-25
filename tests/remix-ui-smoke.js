(async()=>{
 const checks=[];const assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const settle=async()=>{for(let n=0;n<600&&busy;n++)await pause(50);assert(!busy,'UI hết bận');};
 try{
  assert(!!document.querySelector('#channel'),'Có chọn kênh trên màn hình chính');
  assert(document.querySelector('#remixPanel').hidden,'Mặc định ở giao diện dựng video');
  const lists=await api('remixList',state.id);assert(lists.sources.length===19,'Đủ 19 dự án nhập làm nguồn');
  const origin=state.id;accept(await api('channelCreate',{id:origin,name:'KIỂM THỬ NHÂN BẢN'}));
  assert(state.id!==origin,'Chuyển sang kênh mới');assert(history.length===0&&used.size===0,'Lịch sử kênh mới riêng');
  document.querySelector('#showRemix').click();await settle();assert(!document.querySelector('#remixPanel').hidden,'Mở phần Nhân bản');
  document.querySelector('#remixCreate').click();await settle();assert(remixBatch.projects.length===19,'Trộn đủ 19 bản xem trước');
  assert(document.querySelectorAll('#remixRows tr').length===19,'Hiển thị 19 dòng kết quả');
  assert(remixBatch.projects.every(p=>p.blocks[0].hook),'Block đầu mặc định Hook');
  const first=remixBatch.projects[0],before=JSON.stringify(first.draft);document.querySelector('[data-remix-lock]').click();await settle();assert(remixBatch.projects[0].locked,'Khóa được kết quả');assert(document.querySelector('[data-remix-roll]').disabled,'Không trộn lại dự án khóa');
  const id=remixBatch.id;remixBatch=null;document.querySelector('#remixBatches').value=id;document.querySelector('#remixBatches').dispatchEvent(new Event('change'));await settle();assert(JSON.stringify(remixBatch.projects[0].draft)===before,'Mở lại không tự random');
  document.querySelector('[data-remix-view]').click();assert(document.querySelector('#remixPreviewDialog').open,'Mở xem chi tiết Hook và block');document.querySelector('#remixPreviewClose').click();
  document.querySelector('#remixCheck').click();await settle();assert(document.querySelector('#remixChecks').textContent.includes('chưa gán đủ nhạc'),'Chặn tạo khi thiếu nhạc');
  document.querySelector('#showEditor').click();assert(document.querySelector('#remixPanel').hidden,'Quay lại dựng video');
  accept(await api('channelSwitch',origin));assert(history.length===19,'Kênh gốc vẫn giữ 19 dự án');
  return {ok:true,checks,batchId:id};
 }catch(e){return {ok:false,error:e.stack,checks};}
})()
