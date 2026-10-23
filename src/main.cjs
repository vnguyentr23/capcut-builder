const {app,BrowserWindow,ipcMain,dialog,shell,protocol,net}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const {Store}=require('./store.cjs');
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
  function view(s){return {effectCatalog:JSON.parse(store.pref('effectCatalog')||'[]'),transitionCatalog:JSON.parse(store.pref('transitionCatalog')||'[]'),state:s,media:[...hydrate(s).values()],used:[...store.blocked(s.id,s.draft.id)],history:store.history(s.id),niches:store.list(),output};}
  async function prepareOrder(s){
    const map=hydrate(s),pending=[...map.values()].filter(m=>m.createdAt===undefined);let cursor=0;
    await Promise.all(Array.from({length:Math.min(16,pending.length)},async()=>{while(cursor<pending.length){const m=pending[cursor++];try{m.createdAt=(await fs.promises.stat(m.path)).birthtimeMs;store.putMedia({...store.media(m.id),createdAt:m.createdAt});}catch{m.createdAt=0;}}}));
    for(const g of s.groups)if(!g.orderVersion)selection.sortGroup(g,map);store.save(s);return s;
  }
  const thumbnails=new (require('./thumbnails.cjs').Thumbnails)(path.join(data,'thumbnails'));
  const routes={
    scrubFrame:async({id,time})=>require('./scrub-frame.cjs').scrubFrame(store.media(id),time),
    thumbnail:async(id)=>{const m=store.media(id);if(!m)throw Error('Không tìm thấy footage.');return thumbnails.get(m);},
    deleteNiche:async(id)=>{store.deleteNiche(id);current=store.list()[0]?.id||store.create('Ngách mới').id;store.pref('active',current);return view(store.get(current));},
    effects:async()=>{const result=await scanTransitions(undefined,7);store.pref('effectCatalog',JSON.stringify(result.items));return result;},
    transitions:async()=>{const result=await scanTransitions();store.pref('transitionCatalog',JSON.stringify(result.items));return result;},
    load:async(id)=>{if(id)current=id;store.pref('active',current);return view(await prepareOrder(store.get(current)));},
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
    restore:async({state:s,projectId})=>{const row=store.db.prepare('SELECT snapshot FROM projects WHERE id=? AND niche_id=?').get(projectId,s.id);if(!row)throw Error('Không tìm thấy bản lưu.');store.archiveDraft(s);const snapshot=JSON.parse(row.snapshot);s.draft=snapshot.draft;s.sources={...(s.sources||{}),...(snapshot.sources||{})};store.save(s);return view(s);}
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
