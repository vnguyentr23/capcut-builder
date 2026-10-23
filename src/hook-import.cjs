const path=require('node:path');const {inspect}=require('./media.cjs');
async function importHook(state,files,index,store){
  if(!Array.isArray(files)||files.length>2000)throw Error('Danh sách video không hợp lệ.');
  const seen=new Set(state.draft.hook.map(h=>store.media(h.id)?.fingerprint)),added=[],warnings=[];
  const excluded=new Set([...state.groups.flatMap(g=>g.excluded||[]),...(state.draft.excluded||[])]);
  for(const file of files){try{
    if(typeof file!=='string'||!['.mp4','.mov','.mkv','.avi','.webm','.m4v','.mts'].includes(path.extname(file).toLowerCase()))throw Error('Hook chỉ nhận video.');
    const m=await inspect(file,store);if(m.error||!(m.duration>0&&m.width>0&&m.height>0))throw Error('Không đọc được video.');
    if(seen.has(m.fingerprint))throw Error('Video đã có trong Hook.');
    if(excluded.has(m.fingerprint))throw Error('Video đang bị loại khỏi lựa chọn; hãy khôi phục trước khi thêm.');
    seen.add(m.fingerprint);added.push({id:m.id,allowBody:false});
  }catch(e){warnings.push(path.basename(String(file))+': '+e.message);}}
  const at=Number.isInteger(index)?Math.max(0,Math.min(index,state.draft.hook.length)):state.draft.hook.length;
  state.draft.hook.splice(at,0,...added);return {added:added.length,warnings};
}
module.exports={importHook};
