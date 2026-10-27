const {contextBridge,ipcRenderer,webUtils}=require('electron');
const allowed=new Set(['remixBatchSettings','remixBatchSettingsSave','remixDelete','remixEditOpen','remixEditCopy','remixEditSave','remixEditCandidates','remixEditMedia','remixEditChoose','remixEditMusic','remixEditMusicPreview','remixEditCheck','remixEditInstall','channelCreate','channelSwitch','channelDelete','remixList','remixSettings','remixGet','remixSaveSource','remixCreate','remixReroll','remixLock','remixMusic','remixCheck','remixInstall','remixPreview','remixRelink','remixExport','remixImportPreview','remixImportCommit','scrubFrame','importHook','chooseHooks','thumbnail','deleteNiche','transitions','effects','orderGroup','removeFootage','removeFootages','restoreFootage','load','save','createNiche','choose','scan','scanPattern','importParent','inspect','generate','music','musicOne','swapMusicHook','swapFootageHook','previewMusic','detect','check','build','fixName','newDraft','preview','previewExternal','openOutput','restore']);
contextBridge.exposeInMainWorld('ccb',{
  filePath:file=>webUtils.getPathForFile(file),
  call:async(action,payload)=>{if(!allowed.has(action))throw Error('Yêu cầu không hợp lệ.');const r=await ipcRenderer.invoke('ccb',action,payload);if(!r.ok)throw Error(r.error);return r.value;},
  flush:state=>ipcRenderer.sendSync('flush',state),
  onProgress:callback=>{ipcRenderer.on('scan-progress',(_e,p)=>callback(p));}
});
