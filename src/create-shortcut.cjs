const {app,shell}=require('electron');const path=require('node:path');const {APP_ID,repair}=require('./windows-identity.cjs');
app.setAppUserModelId(APP_ID);
app.whenReady().then(()=>{const root=path.resolve(__dirname,'..'),file=path.join(app.getPath('desktop'),'CapCut Compilation Builder.lnk');if(!repair(shell,file,root,process.execPath,true))throw Error('Không tạo được shortcut.');app.exit(0);}).catch(e=>{console.error(e);app.exit(1);});
