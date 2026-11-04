const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const writer=require('../src/capcut-writer.cjs'),cv=require('../src/channel-video.cjs');
const image=path.resolve(__dirname,'../src/assets/logo-32.png');
test('Channel overlays, scoped flip and exclusions survive installing and reopening a native project',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-channel-video-'));
 try{
  fs.writeFileSync(path.join(root,'root_meta_info.json'),JSON.stringify({all_draft_store:[],draft_ids:[]}));
  const clips=['hook','intro','body','end'].map((role,i)=>({role,key:role,path:image,start:i,duration:1,sourceDuration:1,width:32,height:32,kind:'image',transform:{scale:1.4}}));
  for(const enabled of [true,false]){
   const manifest={name:enabled?'Enabled':'Disabled',draft:{},duration:4,clips,transitions:[],audio:[],channelVideo:{...cv.defaults,enabled,channel:'Test',logo:enabled,watermark:enabled,image:{path:image,width:32,height:32},sections:['hook','body']}};
   const result=await writer.install(manifest,root,[],async()=>false),d=JSON.parse(fs.readFileSync(path.join(result.path,'draft_content.json')));
   writer.validate(d);assert.deepEqual(d.tracks[0].segments.map(s=>s.clip.flip.horizontal),[false,false,enabled,false]);assert(d.tracks[0].segments.every(s=>s.clip.scale.x===1.4));
   assert.equal(d.tracks.length,enabled?3:1);
   if(enabled){assert.deepEqual(d.tracks[1].segments.map(s=>s.target_timerange.start),[0,2000000]);assert.equal(d.tracks[2].segments[0].clip.alpha,.25);assert.equal(JSON.parse(d.materials.texts.at(-1).content).text,'Test');}
  }
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('Channel profiles stay independent after reopening SQLite and inherit the destination channel name',()=>{
 const {Store}=require('../src/store.cjs'),channels=require('../src/channels.cjs');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'ccb-profile-')),file=path.join(dir,'db.sqlite');let store=new Store(file);
 try{
  const root=store.create('Ngách'),child=channels.create(store,root.id,'Kênh hai');
  store.pref('channel-video:'+root.id,JSON.stringify({...cv.defaults,brightness:-14}));
  store.close();store=new Store(file);
  assert.equal(cv.profile(store,root.id).brightness,-14);assert.equal(cv.profile(store,child.id).brightness,-7);
  assert.equal(cv.profile(store,child.id).channel,'Kênh hai');
 }finally{store.close();fs.rmSync(dir,{recursive:true,force:true});}
});
