const test=require('node:test'),assert=require('node:assert/strict'),{Store}=require('../src/store.cjs'),r=require('../src/remix.cjs');
test('Read-only remix media cache invalidates on save and does not rewrite batch',()=>{const s=new Store(':memory:');try{const n=s.create('Cache'),b={id:'batch',rootId:n.id,channelId:n.id,name:'Test',sources:[],projects:[{id:'p',name:'P',editor:{blocks:[{units:[{id:'u',path:'old.mp4'}]}]}}]};r.save(s,b);const before=s.db.prepare('SELECT data FROM remix_batches WHERE id=?').get(b.id).data;assert.equal(r.mediaPath(s,b.id,'p','u'),'old.mp4');assert.equal(s.db.prepare('SELECT data FROM remix_batches WHERE id=?').get(b.id).data,before);b.projects[0].editor.blocks[0].units[0].path='new.mp4';r.save(s,b);assert.equal(r.mediaPath(s,b.id,'p','u'),'new.mp4');}finally{s.close();}});

test('A delayed batch save cannot overwrite a more recent project edit or revive a removed batch',()=>{
 const store=new Store(':memory:');
 try{
  const batch={id:'batch',rootId:'root',channelId:'root',name:'B',sources:[],projects:[{id:'p',name:'P'}]};
  r.save(store,batch);
  const stale=r.get(store,batch.id),current=r.get(store,batch.id);
  current.projects[0].assignments=[{block:1,name:'New song'}];
  require('../src/remix-storage.cjs').saveProjects(store,current.id,current.projects,current.updated);
  assert.throws(()=>r.save(store,stale),/đã thay đổi/);
  assert.deepEqual(r.get(store,batch.id).projects,current.projects);
  const removed=r.get(store,batch.id);
  store.db.prepare('DELETE FROM remix_batches WHERE id=?').run(batch.id);
  assert.throws(()=>r.save(store,removed),/đã thay đổi/);
  assert.equal(store.db.prepare('SELECT count(*) n FROM remix_projects').get().n,0);
 }finally{store.close();}
});
