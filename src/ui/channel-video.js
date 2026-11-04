(()=>{
 const dialog=$('#channelVideoDialog'),fields=$('#cvFields'),note=$('#cvNote');
 let id,model,initial,warning;
 const controls=[
  ['Chỉnh sửa footage',[
   ['enabled','Bật chỉnh sửa footage'],['hook','Áp dụng cho Hook'],['flip','Lật ngang video'],
   ['brightness','Độ sáng',-100,100],['exposure','Phơi sáng',-100,100],['contrast','Tương phản',-100,100],['saturation','Độ bão hòa',-100,100],
   ['temperature','Nhiệt độ màu',-100,100],['highlight','Vùng sáng',-100,100],['shadow','Vùng tối',-100,100],['sharpen','Độ sắc nét',0,100]]],
  ['Logo kênh',[['logo','Hiển thị logo'],['image','Ảnh PNG / WebP'],['corner','Vị trí',{tl:'Trên trái',tr:'Trên phải',bl:'Dưới trái',br:'Dưới phải'}],['size','Chiều rộng (px)',1,1920],['logoFade','Độ mờ (%)',0,100],['x','Cách lề ngang (px)',0,1920],['y','Cách lề dọc (px)',0,1080],['sections','Hiển thị ở']]],
  ['Tên kênh chìm',[['watermark','Hiển thị tên kênh'],['label','Nội dung'],['fontSize','Cỡ chữ',1,180],['color','Màu chữ'],['textFade','Độ mờ (%)',0,100],['textPosition','Vị trí',{below:'Bên dưới logo',custom:'Tùy chỉnh'}],['gap','Khoảng cách với logo (px)',0,1080],['textX','Cách lề trái (px)',0,1920],['textY','Cách lề trên (px)',0,1080]]]
 ];
 function render(){
  fields.replaceChildren();
  for(const [title,items] of controls){
   const detail=document.createElement('details'),summary=document.createElement('summary');summary.textContent=title;detail.open=fields.children.length===0;detail.append(summary);fields.append(detail);
   for(const [key,label,min,max] of items){
    const row=document.createElement('div');row.className='row';row.style.margin='7px 0';const caption=document.createElement('span');caption.textContent=label;caption.style.flex='1';row.append(caption);detail.append(row);
    function input(type){const el=document.createElement('input');el.type=type;el.setAttribute('aria-label',label);row.append(el);return el;}
    if(max!==undefined){const range=input('range'),num=input('number');num.style.width='72px';for(const el of [range,num]){el.min=min;el.max=max;el.value=model[key];el.required=true;el.oninput=()=>{if(el.value==='')return;model[key]=Number(el.value);(el===range?num:range).value=el.value;};}}
    else if(typeof min==='object'){const select=document.createElement('select');for(const [value,text] of Object.entries(min))select.add(new Option(text,value));select.value=model[key];select.onchange=()=>model[key]=select.value;row.append(select);}
    else if(key==='sections'){for(const [value,text] of Object.entries({hook:'Hook',body:'Body',intro:'Intro',end:'Kết'})){const el=input('checkbox');el.setAttribute('aria-label',text);el.checked=model.sections.includes(value);el.onchange=()=>{model.sections=model.sections.filter(r=>r!==value);if(el.checked)model.sections.push(value);};row.append(text);}}
    else if(key==='image'){const btn=document.createElement('button');btn.type='button';btn.textContent=model.image?.path.split(/[\\/]/).pop()||'Chọn ảnh';btn.onclick=async()=>{try{const img=await api('channelVideoLogo');if(img){model.image=img;btn.textContent=img.path.split(/[\\/]/).pop();}}catch(e){note.textContent=e.message;}};row.append(btn);}
    else if(typeof model[key]==='boolean'){const el=input('checkbox');el.checked=model[key];el.onchange=()=>model[key]=el.checked;}
    else {const el=input(key==='color'?'color':'text');el.value=model[key];el.placeholder=$('#cvName').textContent;el.oninput=()=>model[key]=el.value;}
   }
   if(title==='Chỉnh sửa footage'){const msg=document.createElement('p');msg.className='hint';msg.textContent=warning;detail.append(msg);}
  }
 }
 $('#channelVideoOpen').onclick=async()=>{try{
  id=state.id;const data=await api('channelVideoGet',id);if(id!==state.id)return;
  model=data.settings;initial=data.defaults;warning=data.warning;note.textContent='';
  $('#cvName').textContent=state.channelName==='Kênh gốc'?state.name:state.channelName||state.name;
  const source=$('#cvSource');source.replaceChildren();for(const c of data.channels.filter(c=>c.id!==id))source.add(new Option(c.niche+' · '+c.name,c.id));
  $('#cvCopy').disabled=!source.length;render();dialog.showModal();
 }catch(e){toast(e.message,true);}};
 $('#cvClose').onclick=()=>dialog.close();
 $('#cvReset').onclick=()=>{model=structuredClone(initial);render();note.textContent='Đã điền mặc định. Bấm Lưu cài đặt để áp dụng.';};
 $('#cvCopy').onclick=async()=>{try{model=(await api('channelVideoGet',$('#cvSource').value)).settings;render();note.textContent='Đã sao chép. Bấm Lưu cài đặt để áp dụng.';}catch(e){note.textContent=e.message;}};
 $('#cvForm').onsubmit=async e=>{e.preventDefault();try{await api('channelVideoSave',{id,settings:model});dialog.close();toast('Đã lưu cài đặt video của kênh.');}catch(err){note.textContent=err.message;}};
})();
