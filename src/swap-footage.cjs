const {clipRange}=require('./domain.cjs');
module.exports=function swap(s,media,used,bodyIndex,hookIndex){
 const d=structuredClone(s.draft),b=d.body[bodyIndex],h=d.hook[hookIndex];
 if(!b||!h)throw Error('Hãy chọn footage Hook để hoán đổi.');
 const bm=media.get(b.id),hm=media.get(h.id);
 if(!bm||!hm)throw Error('Không tìm thấy footage.');
 if(used.has(hm.fingerprint))throw Error('Footage Hook đã dùng ở dự án trước nên không thể đưa vào Body.');
 const group=s.groups.find(g=>g.items.includes(h.id));
 if(!group)throw Error('Footage Hook cần thuộc một nhóm trong thư viện để đưa vào Body.');
 if(group.lockedOnly&&!(group.pinned||[]).includes(h.id))throw Error('Cột của footage Hook chỉ nhận clip đã khóa. Hãy khóa clip trước khi đổi vào Body.');
 const excluded=new Set([...(d.excluded||[]),...s.groups.flatMap(g=>g.excluded||[])]);
 if(excluded.has(hm.fingerprint))throw Error('Footage Hook đã bị loại khỏi lựa chọn.');
 if(bm.fingerprint===hm.fingerprint||d.body.some((c,i)=>i!==bodyIndex&&media.get(c.id)?.fingerprint===hm.fingerprint)||d.hook.some((c,i)=>i!==hookIndex&&media.get(c.id)?.fingerprint===bm.fingerprint))throw Error('Hoán đổi sẽ gây trùng footage.');
 d.hook[hookIndex]={id:b.id,allowBody:false};
 d.body[bodyIndex]={...b,id:h.id,groupId:group.id,requestedGroupId:b.requestedGroupId||b.groupId};
 const extra=d.body[bodyIndex+1];
 if(extra?.supplementFor===b.id){
   if(clipRange(d,hm).duration<(d.shortClipFill?.threshold||5))extra.supplementFor=h.id;
   else d.body.splice(bodyIndex+1,1);
 }
 return d;
};
