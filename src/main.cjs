const {app,BrowserWindow,ipcMain,dialog,shell,protocol,net}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {Store}=require('./store.cjs');
const channels=require('./channels.cjs'),remix=require('./remix.cjs'),transfer=require('./remix-transfer.cjs');
const domain=require('./domain.cjs');
const {scanTransitions}=require('./transitions.cjs');
const selection=require('./selection.cjs');
const mediaLib=require('./media.cjs');
const {LocalCapCutAdapter,ManifestAdapter}=require('./adapter.cjs');
const {preflight}=require('./preflight.cjs');
const {pathToFileURL}=require('node:url');
protocol.registerSchemesAsPrivileged([{scheme:'ccb-media',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.setAppUserModelId('CapCutCompilationBuilder.Desktop');
const previewTokens=new Map();
const base=path.resolve(__dirname,'..');
const data=process.env.CCB_DATA_DIR||path.join(base,'data');
const output=process.env.CCB_OUTPUT_DIR||path.join(base,'Du an');
let win,store;
const smoke=process.argv.includes('--smoke-test');
if(smoke)app.setPath('userData',path.join(data,'electron-smoke'));
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{win?.show();win?.focus();});
app.whenReady().then(async()=>{
  fs.mkdirSync(data,{recursive:true});fs.mkdirSync(output,{recursive:true});
  protocol.handle('ccb-media',request=>{const token=new URL(request.url).hostname,file=previewTokens.get(token);if(!file)return new Response('Not found',{status:404});return require('./media-response.cjs').mediaResponse(file,request);});
  store=new Store(path.join(data,'workspace.sqlite'));
  const adapter=new LocalCapCutAdapter();
  let current=store.pref('active')||store.list()[0]?.id;
  if(!current)current=store.create('Ngách đầu tiên').id;
  const hydrate=s=>{const map=store.hydrate(s);for(const [id,m] of map)if(s.sources&&Object.hasOwn(s.sources,id))map.set(id,{...m,source:s.sources[id]});return map;};
  function view(s){return {channels:channels.list(store,s.id),effectCatalog:JSON.parse(store.pref('effectCatalog')||'[]'),transitionCatalog:JSON.parse(store.pref('transitionCatalog')||'[]'),state:s,media:[...hydrate(s).values()],used:[...store.blocked(s.id,s.draft.id)],history:store.history(s.id),niches:store.list(),output};}
  async function prepareOrder(s){
    const map=hydrate(s),pending=[...map.values()].filter(m=>m.createdAt===undefined);let cursor=0;
    await Promise.all(Array.from({length:Math.min(16,pending.length)},async()=>{while(cursor<pending.length){const m=pending[cursor++];try{m.createdAt=(await fs.promises.stat(m.path)).birthtimeMs;store.putMedia({...store.media(m.id),createdAt:m.createdAt});}catch{m.createdAt=0;}}}));
    for(const g of s.groups)if(!g.orderVersion)selection.sortGroup(g,map);store.save(s);return s;
  }
  const thumbnails=new (require('./thumbnails.cjs').Thumbnails)(path.join(data,'thumbnails'));
  let pendingRemixImport=null;
  const routes={
    remixBatchSettings:async(id)=>require('./remix-settings.cjs').batchSettings(store,id),
    remixBatchSettingsSave:async(p)=>require('./remix-settings.cjs').applyBatch(store,p),
    remixDelete:async(p)=>remix.removeBatch(store,p),
    remixEditOpen:async({id,projectId})=>require('./remix-editor.cjs').open(store,id,projectId),
    remixEditSave:async(p)=>require('./remix-editor.cjs').mutate(store,p),
    remixEditCandidates:async({id,projectId,unitId})=>require('./remix-editor.cjs').candidates(store,id,projectId,unitId),
    remixEditMedia:async({id,projectId,unitId,sourceId,sourceUnitId})=>{
      const edit=require('./remix-editor.cjs'),{b,p}=edit.load(store,id,projectId);let file;
      if(sourceId){const sources=await remix.analyzeSources(b.sources);file=sources.find(s=>s.sourceId===sourceId)?.blocks.flatMap(b=>b.units).find(u=>u.id===sourceUnitId)?.path;}
      else file=edit.locate(p.editor,unitId).u.path;
      if(!file||!fs.existsSync(file))throw Error('Không tìm thấy footage.');const m=await mediaLib.inspect(file,store),token=domain.uid();previewTokens.set(token,file);return {url:'ccb-media://'+token+'/video',mediaId:m.id,duration:m.duration,thumbnail:await thumbnails.get(m)};
    },
    remixEditChoose:async({id,projectId,revision,op,blockId})=>{if(!['addHook','ending','blockMusic'].includes(op))throw Error('Thao tác không hợp lệ.');const r=await dialog.showOpenDialog(win,{title:op==='blockMusic'?'Chọn nhạc cho block':op==='ending'?'Chọn video / ảnh kết thúc':'Thêm video Hook',properties:['openFile'],filters:[{name:'Video / ảnh',extensions:op==='blockMusic'?['mp3','wav','m4a','aac','flac','ogg']:op==='ending'?['mp4','mov','mkv','webm','png','jpg','jpeg','webp']:['mp4','mov','mkv','webm']}]});return r.canceled?null:require('./remix-editor.cjs').mutate(store,{id,projectId,revision,op,blockId,path:r.filePaths[0]});},
    remixEditMusicPreview:async({id,projectId,blockId})=>{const edit=require('./remix-editor.cjs'),{p}=edit.load(store,id,projectId),index=p.editor.blocks.findIndex(b=>b.id===blockId),song=p.assignments.find(a=>a.block===index);if(!song||!fs.existsSync(song.path))throw Error('Chưa gán nhạc hoặc không tìm thấy file nhạc.');const token=domain.uid();previewTokens.set(token,song.path);return {url:'ccb-media://'+token+'/audio',duration:song.duration/1e6,volume:Math.min(1,10**((p.settings.audioVolumeDb??-10)/20))};},
    remixEditMusic:async({id,projectId,folders})=>{await remix.assignMusic(store,id,folders,p=>win.webContents.send('scan-progress',p),projectId);return require('./remix-editor.cjs').open(store,id,projectId);},
    remixEditCheck:async({id,projectId})=>{const {b,p}=require('./remix-editor.cjs').load(store,id,projectId);return remix.check({...b,projects:[p]});},
    remixEditInstall:async({id,projectId})=>{await remix.install(store,id,adapter,p=>win.webContents.send('scan-progress',p),projectId);return require('./remix-editor.cjs').open(store,id,projectId);},
    scrubFrame:async({id,time})=>require('./scrub-frame.cjs').scrubFrame(store.media(id),time),
    thumbnail:async(id)=>{const m=store.media(id);if(!m)throw Error('Không tìm thấy footage.');return thumbnails.get(m);},
    deleteNiche:async(id)=>{store.deleteNiche(id);current=store.list()[0]?.id||store.create('Ngách mới').id;store.pref('active',current);return view(store.get(current));},
    effects:async()=>{const result=await scanTransitions(undefined,7);store.pref('effectCatalog',JSON.stringify(result.items));return result;},
    transitions:async()=>{const result=await scanTransitions();store.pref('transitionCatalog',JSON.stringify(result.items));return result;},
    load:async(id)=>{if(id)current=store.pref('channel-active:'+id)||id;store.pref('active',current);const s=store.get(current);return view(s.groups.some(g=>!g.orderVersion)?await prepareOrder(s):s);},
    channelCreate:async({id,name})=>{const s=channels.create(store,id,name);current=s.id;store.pref('active',current);store.pref('channel-active:'+s.rootNicheId,current);return view(s);},
    channelSwitch:async(id)=>{const s=store.get(id);current=id;store.pref('active',id);store.pref('channel-active:'+s.rootNicheId,id);return view(s);},
    remixList:async(id)=>({batches:remix.list(store,id),sources:remix.sourceProjects(store,id),channels:channels.list(store,id)}),
    remixSettings:async(id)=>remix.preferences(store,id),
    remixGet:async(id)=>remix.present(await remix.get(store,id)),
    remixSaveSource:async(p)=>remix.present(await remix.saveSource(store,p)),
    remixCreate:async(p)=>remix.present(await remix.create(store,p)),
    remixReroll:async({id,projectId})=>remix.present(await remix.reroll(store,id,projectId)),
    remixLock:async({id,projectId})=>remix.present(await remix.lock(store,id,projectId)),
    remixMusic:async({id,folders})=>remix.present(await remix.assignMusic(store,id,folders,p=>win.webContents.send('scan-progress',p))),
    remixCheck:async(id)=>remix.check(remix.get(store,id)),
    remixInstall:async(id)=>remix.present(await remix.install(store,id,adapter,p=>win.webContents.send('scan-progress',p))),
    remixPreview:async({id,projectId,blockIndex,clipIndex})=>{const b=remix.get(store,id),c=b.projects.find(p=>p.id===projectId)?.blocks[blockIndex]?.clips[clipIndex];if(!c||!fs.existsSync(c.path))throw Error('Không tìm thấy footage.');const token=domain.uid();previewTokens.set(token,c.path);return {url:'ccb-media://'+token+'/video',start:c.sourceStart/1e6,name:c.name,parts:c.parts};},
    remixRelink:async(id)=>{const r=await dialog.showOpenDialog(win,{title:'Chọn thư mục footage / nhạc để liên kết lại',properties:['openDirectory','multiSelections']});if(r.canceled)return null;const result=await transfer.relink(store,id,r.filePaths,p=>win.webContents.send('scan-progress',p));return {...result,batch:remix.present(result.batch)};},
    remixExport:async(id)=>{const r=await dialog.showSaveDialog(win,{title:'Xuất gói nhân bản',defaultPath:'Nhan-ban.ccb-remix',filters:[{name:'Gói nhân bản',extensions:['ccb-remix']}]});return r.canceled?null:transfer.exportPackage(store,id,r.filePath);},
    remixImportPreview:async()=>{const r=await dialog.showOpenDialog(win,{title:'Chọn gói nhân bản',properties:['openFile'],filters:[{name:'Gói nhân bản',extensions:['ccb-remix']}]});if(r.canceled)return null;const pkg=transfer.readPackage(r.filePaths[0]),roots=await dialog.showOpenDialog(win,{title:'Chọn các thư mục chứa footage và nhạc',properties:['openDirectory','multiSelections']});if(roots.canceled)return null;const match=await transfer.matchResources(pkg,roots.filePaths,p=>win.webContents.send('scan-progress',p));pendingRemixImport={pkg,match};return {name:pkg.body.nicheName,projects:pkg.body.batch.projects.length,matched:Object.keys(match.mappings).length,missing:match.missing,duplicates:match.duplicates,errors:match.errors};},
    remixImportCommit:async()=>{if(!pendingRemixImport)throw Error('Chọn và kiểm tra gói trước.');const result=await transfer.importPackage(store,pendingRemixImport.pkg,pendingRemixImport.match);pendingRemixImport=null;current=result.batch.channelId;store.pref('active',current);return {...result,batch:remix.present(result.batch),view:view(store.get(current))};},
    save:async(s)=>{store.save(s);return true;},
    createNiche:async(name)=>{if(!name?.trim())throw Error('Tên ngách không được rỗng.');const s=store.create(name.trim());const detected=await adapter.detect(s.draft.destination),taken=new Set(detected.existingNames.map(n=>n.toLocaleLowerCase()));const exists=n=>taken.has(n.toLocaleLowerCase())||fs.existsSync(path.join(output,n));if(exists(s.draft.name)){store.nameDraft(s,exists);store.save(s);}current=s.id;store.pref('active',current);return view(s);},
    chooseHooks:async()=>{const r=await dialog.showOpenDialog(win,{title:'Chọn video cho Hook',properties:['openFile','multiSelections'],filters:[{name:'Video',extensions:['mp4','mov','mkv','avi','webm','m4v','mts']}]});return r.canceled?[]:r.filePaths;},
    importHook:async({state:s,files,index})=>{const result=await require('./hook-import.cjs').importHook(s,files,index,store);store.save(s);return {...view(s),hookImport:result};},
    choose:async(kind)=>{const r=await dialog.showOpenDialog(win,kind==='folder'?{title:'Chọn thư mục',properties:['openDirectory']}:{title:'Chọn footage',properties:['openFile'],filters:[{name:kind==='end'?'Video hoặc ảnh':'Video',extensions:kind==='end'?['mp4','mov','mkv','avi','webm','m4v','mts','png','jpg','jpeg','webp','bmp']:['mp4','mov','mkv','avi','webm','m4v','mts']}]});return r.canceled?null:r.filePaths[0];},
    scan:async({state:s,groupId,folder})=>{
      const g=s.groups.find(g=>g.id===groupId);if(!g)throw Error('Không tìm thấy nhóm.');
      const files=await mediaLib.scan(folder,'video',store,p=>win.webContents.send('scan-progress',p));
      const valid=files.filter(m=>m.id),ids=new Set(valid.map(m=>m.id)),existing=new Set(g.items);g.folder=folder;g.items=[...g.items.filter(id=>ids.has(id)),...valid.filter(m=>!existing.has(m.id)).map(m=>m.id)];
      await prepareOrder(s);return {...view(s),scanErrors:files.filter(m=>m.error).map(m=>({path:m.path,error:m.error}))};
    },
    scanPattern:async(s)=>{
      const groups=[...new Set(s.draft.pattern)].map(id=>s.groups.find(g=>g.id===id)).filter(Boolean),cache=new Map(),errors=[];let done=0;
      for(const g of groups){
        try{if(!g.folder)throw Error('Chưa chọn thư mục.');const key=path.resolve(g.folder).toLowerCase();
          if(!cache.has(key)){try{cache.set(key,await mediaLib.scan(g.folder,'video',store,p=>win.webContents.send('scan-progress',{...p,file:`${done+1}/${groups.length} nhóm · ${g.name} / ${p.file}`})));}catch(e){cache.set(key,e);}}
          const files=cache.get(key);if(files instanceof Error)throw files;
          const valid=files.filter(m=>m.id),ids=new Set(valid.map(m=>m.id)),existing=new Set(g.items);g.items=[...g.items.filter(id=>ids.has(id)),...valid.filter(m=>!existing.has(m.id)).map(m=>m.id)];errors.push(...files.filter(m=>m.error));
        }catch(e){errors.push({path:g.folder||g.name,error:e.message});}done++;
      }
      await prepareOrder(s);return {...view(s),scanErrors:errors,scanSummary:{groups:groups.length,errors:errors.length}};
    },
    importParent:async(s)=>{
      const folders=(await fs.promises.readdir(s.parent,{withFileTypes:true})).filter(e=>e.isDirectory()&&!e.isSymbolicLink());let errors=[];
      if(!folders.length)folders.push({name:path.basename(s.parent),direct:true});
      for(const f of folders){const folder=f.direct?s.parent:path.join(s.parent,f.name);let g=s.groups.find(g=>g.folder===folder);if(!g){g={id:domain.uid(),name:f.name,folder,items:[]};s.groups.push(g);}
        const files=await mediaLib.scan(folder,'video',store,p=>win.webContents.send('scan-progress',{...p,file:f.name+' / '+p.file}));
        const valid=files.filter(m=>m.id),ids=new Set(valid.map(m=>m.id)),existing=new Set(g.items);g.items=[...g.items.filter(id=>ids.has(id)),...valid.filter(m=>!existing.has(m.id)).map(m=>m.id)];errors.push(...files.filter(m=>m.error));
      }
      if(!s.draft.pattern.length)s.draft.pattern=s.groups.map(g=>g.id);await prepareOrder(s);return {...view(s),scanErrors:errors};
    },
    orderGroup:async({state:s,groupId,mode,visibleIds})=>{const g=s.groups.find(g=>g.id===groupId);if(!g)throw Error('Không tìm thấy nhóm.');if(mode==='random')selection.randomizeGroup(g,visibleIds);else selection.sortGroup(g,hydrate(s),mode,visibleIds);store.save(s);return view(s);},
    removeFootages:async({state:s,groupId,mediaIds,scope})=>{const result=selection.removeFootages(s,groupId,mediaIds,hydrate(s),store.blocked(s.id,s.draft.id),scope);store.save(s);return {...view(s),replacement:result};},
    removeFootage:async({state:s,groupId,mediaId,scope})=>{const result=selection.removeFootage(s,groupId,mediaId,hydrate(s),store.blocked(s.id,s.draft.id),scope);store.save(s);return {...view(s),replacement:result};},
    restoreFootage:async({state:s,groupId})=>{const g=s.groups.find(g=>g.id===groupId);if(!g)throw Error('Không tìm thấy nhóm.');g.excluded=[];store.save(s);return view(s);},
    inspect:async(file)=>mediaLib.inspect(file,store),
    generate:async(s)=>{s.draft.body=domain.generate(s.draft,s.groups,hydrate(s),store.blocked(s.id,s.draft.id));store.save(s);return view(s);},
    music:async({state:s,rerandom})=>{
      const tl=domain.timeline(s.draft,hydrate(s)),slots=domain.musicSlots(s.draft,tl),pools={};
      for(const kind of new Set(slots.map(s=>s.pool))){const folder=s.draft.music[kind];if(!folder)throw Error(`Chưa chọn thư mục nhạc ${kind==='body'?'Body':kind==='hook'?'Hook':'Kết'}.`);pools[kind]=(await mediaLib.scan(folder,'audio',store,p=>win.webContents.send('scan-progress',p))).filter(m=>m.id);}
      s.draft.assignments=domain.assignMusic({...s.draft,musicExcluded:s.musicExcluded||[]},tl,pools,rerandom);store.save(s);return view(s);
    },
    previewMusic:async({state:s,key})=>{const m=s.draft.assignments[key];if(!m||!fs.existsSync(m.path))throw Error('File nhạc không tồn tại.');const token=domain.uid();previewTokens.set(token,m.path);return {url:'ccb-media://'+token+'/audio'};},
    swapFootageHook:async({state:s,bodyIndex,hookIndex})=>{
      const map=hydrate(s),draft=require('./swap-footage.cjs')(s,map,store.blocked(s.id,s.draft.id),bodyIndex,hookIndex);
      for(const id of [draft.hook[hookIndex].id,draft.body[bodyIndex].id])if(!fs.existsSync(map.get(id).path))throw Error('File footage không tồn tại.');
      s.draft=draft;store.save(s);return view(s);
    },
    swapMusicHook:async({state:s,key})=>{
      const slots=domain.musicSlots(s.draft,domain.timeline(s.draft,hydrate(s)));
      const assignments=domain.swapMusicHook(s.draft,slots,key,s.musicExcluded||[]);
      for(const m of [assignments.hook,assignments[key]])if(!fs.existsSync(m.path))throw Error('File nhạc không tồn tại: '+m.path);
      s.draft.assignments=assignments;store.save(s);return view(s);
    },
    musicOne:async({state:s,key,exclude=false})=>{
      const slots=domain.musicSlots(s.draft,domain.timeline(s.draft,hydrate(s))),slot=slots.find(x=>x.key===key);if(!slot)throw Error('Block không còn tồn tại.');
      const old=s.draft.assignments[key];let note='';
      if(exclude&&old){s.musicExcluded=[...new Set([...(s.musicExcluded||[]),old.fingerprint])];for(const [k,m] of Object.entries(s.draft.assignments))if(m.fingerprint===old.fingerprint)delete s.draft.assignments[k];store.save(s);}
      try{const folder=s.draft.music[slot.pool];if(!folder)throw Error('Chưa chọn thư mục nhạc.');const files=await mediaLib.scan(folder,'audio',store,p=>win.webContents.send('scan-progress',p));
        const blocked=new Set([...(s.musicExcluded||[]),old?.fingerprint,...Object.entries(s.draft.assignments).filter(([k])=>k!==key).map(([,m])=>m.fingerprint)]);
        const choices=[...new Map(files.filter(m=>m.id&&!m.error&&!blocked.has(m.fingerprint)&&m.duration+1e-7>=slot.duration).map(m=>[m.fingerprint,m])).values()];if(!choices.length)throw Error('Không còn bài khác đủ dài và không trùng để thay.');
        s.draft.assignments[key]=choices[require('node:crypto').randomInt(choices.length)];
      }catch(e){if(!exclude)throw e;note='Đã loại bài khỏi ngách. '+e.message;}
      store.save(s);return {...view(s),musicNote:note};
    },
    detect:async(s)=>adapter.detect(s.draft.destination),
    check:async(s)=>preflight(s,hydrate(s),store.blocked(s.id,s.draft.id),await adapter.detect(s.draft.destination),output),
    build:async(s)=>{
      store.save(s);const map=hydrate(s),detection=await adapter.detect(s.draft.destination);
      const check=await preflight(s,map,store.blocked(s.id,s.draft.id),detection,output);
      if(!check.ok)return {check};
      const m=domain.manifest(s.draft,s,map);const {existingNames,...publicDetection}=detection;m.capcutDetection=publicDetection;m.sources=s.sources||{};
      await require('./ducking.cjs').apply(m,{progress:p=>win.webContents.send('scan-progress',p)});
      const result=s.draft.mode==='capcut'?await adapter.write(m):await new ManifestAdapter().write(m,output);
      if(result.kind==='capcut'){m.mode='capcut';m.capcutCompatible=true;}store.pref('lastOutput',result.path);
      store.record(s,result.path,m,result);return {check,result,view:view(s)};
    },
    fixName:async(s)=>{const detection=await adapter.detect(s.draft.destination),names=new Set(detection.existingNames.map(n=>n.toLocaleLowerCase()));return domain.fixName(s.draft.name,name=>names.has(name.toLocaleLowerCase())||fs.existsSync(path.join(output,name))||store.history(s.id).some(p=>p.name.toLocaleLowerCase()===name.toLocaleLowerCase()));},
    newDraft:async(s)=>{store.archiveDraft(s);const d=structuredClone(s.draft);Object.assign(d,{id:domain.uid(),hook:[],body:[],end:null,excluded:[],assignments:{},pinOrder:[]});s.draft=d;for(const group of s.groups)group.pinned=[];const detection=await adapter.detect(s.draft.destination),names=new Set(detection.existingNames.map(n=>n.toLocaleLowerCase()));store.nameDraft(s,n=>names.has(n.toLocaleLowerCase())||fs.existsSync(path.join(output,n)));store.save(s);return view(s);},
    preview:async(id)=>{const m=store.media(id);if(!m||!fs.existsSync(m.path))throw Error('File không tồn tại.');previewTokens.clear();const token=domain.uid();previewTokens.set(token,m.path);return {url:'ccb-media://'+token+'/video',name:m.name};},
    previewExternal:async(id)=>{const m=store.media(id);if(!m||!fs.existsSync(m.path))throw Error('File không tồn tại.');const error=await shell.openPath(m.path);if(error)throw Error(error);},
    openOutput:async()=>shell.openPath(store.pref('lastOutput')||output),
    restore:async({state:s,projectId})=>{const row=store.db.prepare('SELECT snapshot,status FROM projects WHERE id=? AND niche_id=?').get(projectId,s.id);if(!row)throw Error('Không tìm thấy bản lưu.');if(['IMPORTED','REMIX_CREATED'].includes(row.status))throw Error('Dự án nhập ngoài lưu lịch sử footage. Hãy chỉnh sửa timeline gốc trong CapCut.');store.archiveDraft(s);const snapshot=JSON.parse(row.snapshot);s.draft=snapshot.draft;s.sources={...(s.sources||{}),...(snapshot.sources||{})};store.save(s);return view(s);}
  };
  const trusted=e=>e.sender===win?.webContents&&e.senderFrame?.url.startsWith('file:');
  ipcMain.handle('ccb',async(e,action,payload)=>{if(!trusted(e)||!Object.hasOwn(routes,action))throw Error('Yêu cầu không hợp lệ.');try{return {ok:true,value:await routes[action](payload)};}catch(err){return {ok:false,error:err.message};}});
  ipcMain.on('flush',(e,s)=>{try{if(!trusted(e))throw Error('Không hợp lệ');store.save(s);e.returnValue=true;}catch{e.returnValue=false;}});
  win=new BrowserWindow({icon:path.join(__dirname,'assets','app.ico'),width:1480,height:1020,minWidth:1060,minHeight:740,backgroundColor:'#101217',title:'CapCut Compilation Builder',show:!smoke,autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:!smoke}});
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('will-navigate',e=>e.preventDefault());
  win.webContents.on('console-message',details=>{if(smoke&&details.level==='error')fs.appendFileSync(path.join(data,'smoke-errors.log'),details.message+'\n');});
  await win.loadFile(path.join(__dirname,'ui','index.html'));
  if(smoke){
    try{
      await new Promise(r=>setTimeout(r,1200));
      if(process.env.CCB_REMIX_SETTINGS_TEST==='1'){
        const result=await win.webContents.executeJavaScript(fs.readFileSync(path.join(base,'tests','remix-settings-ui.js'),'utf8'));
        fs.writeFileSync(path.join(data,'settings-ui.json'),JSON.stringify(result,null,2));
        fs.writeFileSync(path.join(data,'settings-ui.png'),(await win.webContents.capturePage()).toPNG());
        if(!result.ok)throw Error(result.error);
      }
      if(process.env.CCB_REMIX_EDITOR_TEST==='1'){
        if(process.env.CCB_SMOKE_WIDE==='1')win.setSize(1920,1080);
        if(process.env.CCB_SMOKE_COMPACT==='1')win.setSize(1060,740);
        const result=await win.webContents.executeJavaScript(fs.readFileSync(path.join(base,'tests','remix-editor-ui.js'),'utf8'));
        fs.writeFileSync(path.join(data,'editor-ui-result.json'),JSON.stringify(result,null,2));
        fs.writeFileSync(path.join(data,'editor-ui.png'),(await win.webContents.capturePage()).toPNG());
        if(!result.ok)throw Error(result.error);
      }
      if(process.env.CCB_REMIX_UI_TEST==='1'){
        const result=await win.webContents.executeJavaScript(fs.readFileSync(path.join(base,'tests','remix-ui-smoke.js'),'utf8'));
        fs.writeFileSync(path.join(data,'remix-ui-result.json'),JSON.stringify(result,null,2));
        await win.webContents.executeJavaScript("document.querySelector('#showRemix').click()");
        await win.webContents.executeJavaScript("(async()=>{for(let i=0;i<200&&busy;i++)await new Promise(r=>setTimeout(r,50));window.scrollTo(0,0);await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));})()");fs.writeFileSync(path.join(data,'remix-preview.png'),(await win.webContents.capturePage()).toPNG());
        if(!result.ok)throw Error(result.error);
        await win.webContents.executeJavaScript("document.querySelector('#showEditor').click()");
      }
      if(process.env.CCB_UI_TEST==='1'){
        const uiScript=fs.readFileSync(path.join(base,'tests','ui-smoke.js'),'utf8').replace('__FIXTURE_ROOT__',JSON.stringify(process.env.CCB_FIXTURE_ROOT)).replace('__REAL_PREVIEW__',JSON.stringify(process.env.CCB_REAL_PREVIEW||null));
        const uiResult=await win.webContents.executeJavaScript(uiScript);
        fs.writeFileSync(path.join(data,'ui-result.json'),JSON.stringify(uiResult,null,2));
        if(!uiResult.ok)throw Error(uiResult.error);
      }
      await win.webContents.executeJavaScript('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
      if(process.env.CCB_SMOKE_COMPACT==='1')win.setSize(1060,740);
      if(process.env.CCB_SMOKE_SIDEBAR==='1')await win.webContents.executeJavaScript('toggleSettings(true)');
      await new Promise(r=>setTimeout(r,300));
      if(process.env.CCB_TIMELINE_TEST==='1')await require('../tests/timeline-pointer.cjs')(win.webContents,data);
      const result=await win.webContents.executeJavaScript(`({title:document.title,heading:document.querySelector('h1')?.textContent,niche:document.querySelector('#niche')?.options.length,api:!!window.ccb,body:document.body.innerText.includes('TẠO DỰ ÁN CAPCUT'),error:window.__lastError||null})`);
      await fs.promises.writeFile(path.join(data,'smoke-result.json'),JSON.stringify(result,null,2));
      await fs.promises.writeFile(path.join(data,'smoke.png'),(await win.webContents.capturePage()).toPNG());
      app.exit(result.niche&&result.api&&result.body&&!result.error?0:1);
    }catch(e){fs.writeFileSync(path.join(data,'smoke-result.json'),JSON.stringify({error:e.message}));app.exit(1);}
  }
}).catch(e=>{dialog.showErrorBox('Không mở được ứng dụng',e.message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
app.on('will-quit',()=>store?.close());
}
