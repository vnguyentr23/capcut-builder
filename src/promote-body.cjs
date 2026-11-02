module.exports=function promote(draft,media,index){
 const d=structuredClone(draft),clip=d.body[index],m=media.get(clip?.id);
 if(!Number.isInteger(index)||!m)throw Error('Không tìm thấy footage Body.');
 if(d.hook.some(h=>media.get(h.id)?.fingerprint===m.fingerprint))throw Error('Footage này đã có trong Hook.');
 const slots=draft.body.filter(c=>!c.supplementFor);
 d.body.splice(index,1);
 const next=d.body[index];
 if(next?.supplementFor===clip.id)delete next.supplementFor;
 // Keep the pattern and priority metadata of each remaining Body position.
 d.body.filter(c=>!c.supplementFor).forEach((c,i)=>{
  const slot=slots[i];c.requestedGroupId=slot.requestedGroupId||slot.groupId;
  for(const k of ['priority','slotIndex'])if(k in slot)c[k]=slot[k];else delete c[k];
 });
 d.hook.push({id:clip.id,allowBody:false});return d;
};
