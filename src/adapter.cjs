const fs=require('node:fs');
const fsp=fs.promises;
const path=require('node:path');
const {uid,nameErrors}=require('./domain.cjs');
class CapCutAdapter {
  async detect(){throw Error('Cần triển khai detect().');}
  async write(){throw Error('Writer chưa được xác minh.');}
}
class LocalCapCutAdapter extends CapCutAdapter {
  constructor(root){super();this.root=root||path.join(process.env.LOCALAPPDATA||'','CapCut');}
  async detect(destination) {
    const report={kind:'capcut',compatible:false,verified:false,versions:[],samples:[],existingNames:[],destination:destination||path.join(this.root,'User Data','Projects','com.lveditor.draft'),reason:'Cần dự án CapCut có schema 360000 và cấu trúc đọc được. Hãy tạo, lưu một dự án mẫu rồi kiểm tra lại.'};
    try {report.versions=(await fsp.readdir(path.join(this.root,'Apps'),{withFileTypes:true})).filter(d=>d.isDirectory()&&/^\d+\./.test(d.name)).map(d=>d.name).sort((a,b)=>b.localeCompare(a,undefined,{numeric:true}));}catch(e){report.installationError=e.code;}
    try {
      const dirs=(await fsp.readdir(report.destination,{withFileTypes:true})).filter(d=>d.isDirectory()&&!d.name.startsWith('.'));
      report.existingNames=dirs.map(d=>d.name);
      try {const index=path.join(report.destination,'root_meta_info.json');if((await fsp.stat(index)).size<25*1024*1024){const meta=JSON.parse(await fsp.readFile(index,'utf8'));report.existingNames.push(...(meta.all_draft_store||[]).filter(d=>!d.tm_draft_removed).map(d=>d.draft_name).filter(n=>typeof n==='string'));}}catch{}
      const dated=await Promise.all(dirs.map(async d=>({name:d.name,mtime:(await fsp.stat(path.join(report.destination,d.name))).mtimeMs})));
      for(const d of dated.sort((a,b)=>b.mtime-a.mtime).slice(0,12)) {
        const file=path.join(report.destination,d.name,'draft_content.json');
        try {const st=await fsp.stat(file);if(st.size>25*1024*1024)continue;const j=JSON.parse(await fsp.readFile(file,'utf8'));report.samples.push({folder:d.name,schema:j.version,app:j.last_modified_platform?.app_version,tracks:j.tracks?.length||0,readable:true,structureValid:Array.isArray(j.tracks)&&j.tracks.every(t=>Array.isArray(t.segments))&&Array.isArray(j.materials?.videos)&&Array.isArray(j.materials?.audios)});}
        catch(e){if(e.code!=='ENOENT')report.samples.push({folder:d.name,readable:false});}
        if(report.samples.length>=3)break;
      }
      report.destinationExists=true;
    }catch(e){report.destinationExists=false;report.destinationError=e.code;}
    const readable=report.samples.filter(s=>s.readable);
    const supported=report.versions.length>0&&readable.some(s=>s.schema===360000&&s.structureValid)&&!readable.some(s=>s.schema!==360000);
    if(readable.some(s=>s.schema!==360000))report.reason='Định dạng dự án CapCut chưa hỗ trợ: '+[...new Set(readable.map(s=>s.schema))].join(', ')+'. Tool hiện hỗ trợ schema 360000.';
    if(!report.versions.length)report.reason='Không tìm thấy bản cài CapCut trong thư mục Apps.';
    if(supported&&fs.existsSync(path.join(report.destination,'root_meta_info.json'))){
      try{const index=JSON.parse(await fsp.readFile(path.join(report.destination,'root_meta_info.json'),'utf8'));report.compatible=Array.isArray(index.all_draft_store);}catch{}
    }
    report.warnings=report.compatible&&!report.versions[0].startsWith('9.6.')?['CapCut '+report.versions[0]+': cấu trúc schema 360000 phù hợp; cần mở kiểm tra một dự án trước khi tạo cả bộ.']:[];
    report.reason=report.compatible?'Bộ ghi schema 360000 sẵn sàng: footage, credit, nhạc và chuyển cảnh đều là track editable. Đã kiểm tra cấu trúc; cần kiểm tra hình ảnh sau khi mở trong CapCut.':report.reason;
    return report;
  }
  async write(manifest){
    const detection=await this.detect(manifest.draft?.destination);if(!detection.compatible)throw Error(detection.reason);
    const {scanTransitions}=require('./transitions.cjs');const catalog=(await scanTransitions()).items;
    const writer=require('./capcut-writer.cjs');if(await writer.isRunning())throw Error('Hãy lưu và đóng CapCut trước khi tạo dự án.');
    const audioInfo=new Map();for(const c of manifest.clips){if(c.kind==='image')continue;if(!audioInfo.has(c.path)){const info=await require('./media.cjs').probe(c.path);audioInfo.set(c.path,info.streams?.some(s=>s.codec_type==='audio')||false);}}
    const prepared={...manifest,clips:manifest.clips.map(c=>({...c,hasAudio:c.kind!=='image'&&audioInfo.get(c.path)===true}))};
    return writer.install({...prepared,mode:'capcut',capcutCompatible:true},detection.destination,catalog);
  }
}
class ManifestAdapter extends CapCutAdapter {
  async write(manifest,output) {
    if(nameErrors(manifest.name).length)throw Error('Tên manifest không hợp lệ.');
    await fsp.mkdir(output,{recursive:true});
    const folder=path.join(output,manifest.name),temp=path.join(output,'.ccb-'+uid());
    if(fs.existsSync(folder))throw Error('Tên đã tồn tại trong thư mục đầu ra. Hãy tự sửa tên.');
    await fsp.mkdir(temp);
    try {
      await fsp.writeFile(path.join(temp,'manifest.json'),JSON.stringify(manifest,null,2),'utf8');
      await fsp.writeFile(path.join(temp,'ĐỌC TÔI.txt'),'ĐÂY LÀ BẢN KẾ HOẠCH (DRY RUN), CHƯA PHẢI DỰ ÁN CAPCUT.\r\nKhông thể nhập trực tiếp manifest.json vào CapCut.\r\nChưa có footage nào được đánh dấu USED.\r\nTimeline, nguồn media, nhạc, credit và preset nằm trong manifest.json.\r\nĐơn vị thời gian: giây; canvas 1920×1080, tọa độ preset tính bằng pixel.\r\nCác media được tham chiếu tại đường dẫn gốc, không sao chép hoặc render.\r\n','utf8');
      await fsp.rename(temp,folder);
      return {kind:'manifest',compatible:false,verified:false,path:folder};
    }catch(e){await fsp.rm(temp,{recursive:true,force:true});throw e;}
  }
}
module.exports={CapCutAdapter,LocalCapCutAdapter,ManifestAdapter};
