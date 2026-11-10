const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
test('Opening each remix project invokes full renderer, not selection-only updater',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/ui/remix-editor.js'),'utf8');
 const handler=source.split(' window.openRemixEditor=')[1].split('\n')[0];
 const panel={hidden:false},pane={hidden:true};let renders=0,selection=0;
 const ctx={window:{},task:async f=>f(),stopFootage(){},toggleSettings(){},mediaCache:new Map(),api:async(a,args)=>({id:args.projectId}),remixBatch:{musicFolders:{}},document:{body:{classList:{add(){}}}},$:()=>panel,pane,paint(){renders++;},paintSwapSelection(){selection++;}};
 vm.createContext(ctx);vm.runInContext('window.openRemixEditor='+handler,ctx);
 await ctx.window.openRemixEditor('batch','first');assert.equal(renders,1);assert.equal(ctx.doc.id,'first');assert.equal(pane.hidden,false);
 await ctx.window.openRemixEditor('batch','second');assert.equal(renders,2);assert.equal(ctx.doc.id,'second');assert.equal(selection,0);
});
