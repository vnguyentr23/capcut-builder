(async()=>{
 const checks=[],original=api;const assert=(v,m)=>{if(!v)throw Error(m);checks.push(m);};
 function fixture(id){const unit=n=>({id:id+n,name:'Footage '+n,duration:10,parts:[{start:0,end:10,speed:1,volume:1,audioMode:'original'}],edited:false});return {id,name:'Video '+id,revision:0,settings:{intro:null},duration:30,canUndo:false,blocks:[{id:id+'h',units:[unit('h')],hook:true},{id:id+'b',units:[unit('b1'),unit('b2')],hook:false}],assignments:[]};}
 try{
  for(let i=0;i<100&&!state;i++)await new Promise(r=>setTimeout(r,25));
  api=async(action,args)=>{if(action==='remixEditOpen')return fixture(args.projectId);if(action==='remixEditMedia')throw Error('No media required in UI regression');return original(action,args);};
  await openRemixEditor('test','first');
  assert(!document.querySelector('#remixDraftEditor').hidden,'Editor visible on first open');
  assert(document.querySelectorAll('#rxBlocks .rxCard').length===3,'First open renders Hook and Body footage');
  assert(document.querySelector('#rxName').value==='Video first','First project title rendered');
  const first=document.querySelector('#rxBlocks .rxCard'),swap=first.querySelector('[data-swap]');swap.click();
  assert(first===document.querySelector('#rxBlocks .rxCard'),'Selecting swap does not rebuild cards');
  assert(swap.classList.contains('rxEdited'),'Swap selection highlighted');swap.click();
  await openRemixEditor('test','second');
  assert(document.querySelector('#rxName').value==='Video second','Second project replaces first title');
  assert(document.querySelector('[data-unit="secondb1"]'),'Second project renders its own footage');
  assert(!document.querySelector('[data-unit="firstb1"]'),'Previous project cards removed');
  return {ok:true,checks};
 }catch(e){return {ok:false,error:e.stack,checks};}finally{api=original;}
})()
