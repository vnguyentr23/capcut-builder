const path=require('node:path');
const APP_ID='CapCutCompilationBuilder.Desktop';
function details(root,exe){return {target:exe,cwd:root,args:'"'+root+'"',description:'CapCut Compilation Builder',icon:path.join(root,'src','assets','app.ico'),iconIndex:0,appUserModelId:APP_ID};}
function repair(shell,file,root,exe,create=false){
 const desired=details(root,exe);let old;
 try{old=shell.readShortcutLink(file);}catch{if(!create)return false;}
 if(old&&path.resolve(old.target).toLowerCase()!==path.resolve(exe).toLowerCase())return false;
 if(old&&Object.entries(desired).every(([key,value])=>old[key]===value))return true;
 return shell.writeShortcutLink(file,old?'update':'create',desired);
}
module.exports={APP_ID,details,repair};
