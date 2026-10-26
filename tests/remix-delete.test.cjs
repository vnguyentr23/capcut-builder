const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {Store}=require('../src/store.cjs'),remix=require('../src/remix.cjs'),channels=require('../src/channels.cjs');
test('Delete batch scopes to selected channel and preserves usage, other batches and recovery copy',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-delete-')),s=new Store(path.join(dir,'db'));
 try{const root=s.create('N'),child=channels.create(s,root.id,'C');const b={id:'batch',rootId:root.id,channelId:child.id,name:'B',sources:[],projects:[]};remix.save(s,b);remix.save(s,{...b,id:'other'});s.db.prepare('INSERT INTO usage VALUES(?,?,?,?)').run(child.id,'fp','created','body');
 assert.throws(()=>remix.removeBatch(s,{id:b.id,stateId:root.id}),/kênh/);assert(remix.get(s,b.id));
 remix.removeBatch(s,{id:b.id,stateId:child.id});assert.throws(()=>remix.get(s,b.id));assert(remix.get(s,'other'));assert(s.used(child.id).has('fp'));assert(JSON.parse(s.pref('deleted-remix:'+b.id)).batch.id===b.id);
 }finally{s.close();fs.rmSync(dir,{recursive:true,force:true});}
});
