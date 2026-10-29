(async()=>{try{
 await new Promise(r=>setTimeout(r,2500));
 const items=Array.from({length:8},(_,i)=>({id:'ui-fixture-'+i,name:'Footage '+(i+1)+'.mp4',duration:12}));for(const m of items){media.set(m.id,m);thumbCache.set(m.id,'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');}
 state.draft.hook=items.slice(0,4).map(m=>({id:m.id}));state.draft.body=items.slice(4).map(m=>({id:m.id,groupId:state.groups[0]?.id}));state.draft.blockSize=4;bodyPage=0;renderBody();expandBody(true);
 const checks=[];
 for(const scale of [100,200]){
  document.documentElement.style.setProperty('--preview-h',scale*1.6+'px');await new Promise(r=>setTimeout(r,80));
  for(const c of document.querySelectorAll('.builderCards .bodyCard')){
   const cr=c.getBoundingClientRect(),tr=c.querySelector('.footageThumb').getBoundingClientRect(),buttons=[...c.querySelectorAll('.builderRail button')];
   if(buttons.length!==3)throw Error('Thiếu nút chức năng');
   for(const b of buttons){const r=b.getBoundingClientRect();if(r.bottom>cr.bottom-3||r.left<cr.left+3||r.right>cr.right-3||r.top<tr.bottom)throw Error('Nút bị khuất hoặc đè lên video');if(Math.abs(r.top-buttons[0].getBoundingClientRect().top)>1)throw Error('Nút không cùng hàng');}
  }
  checks.push('8 card có đủ 3 nút dưới video ở kích thước '+scale+'%');
 }
 document.querySelector('.sequenceReorder').click();if(!document.querySelector('.sequenceReorder.primary'))throw Error('Không chọn được footage để đổi vị trí');checks.push('Chọn footage đổi vị trí hoạt động');return {ok:true,checks};
}catch(e){return {ok:false,error:e.stack};}})()
