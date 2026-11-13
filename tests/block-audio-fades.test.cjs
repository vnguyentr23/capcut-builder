const test=require('node:test'),assert=require('node:assert/strict');
const music=require('../src/music-alignment.cjs'),fades=require('../src/block-audio-fades.cjs');
test('Only final block music aligns; preserve Hook and earlier blocks and intro windows',async()=>{const m={audio:[{key:'hook',path:'a',start:3,duration:17,sourceStart:0},{key:'last',path:'b',start:20,duration:10,sourceStart:0},{key:'last',path:'b',start:35,duration:20,sourceStart:10}],draft:{}};let calls=0;await music.apply(m,{analyzeEnd:async()=>{calls++;return {end:100};}});assert.equal(calls,1);assert.deepEqual(m.audio.map(a=>a.sourceStart),[0,70,80]);assert.equal(music.endpoint('silence_start: 100\nsilence_end: 105',105),100.08);});
test('Footage fade clamps to short clip and preserves existing fade in',()=>{const d={materials:{audio_fades:[{id:'old',fade_in_duration:100000}]}},s={target_timerange:{duration:2000000},extra_material_refs:['old','vocal']};fades.attach(d,s,3000000);assert.equal(d.materials.audio_fades.at(-1).fade_out_duration,2000000);assert.equal(d.materials.audio_fades.at(-1).fade_in_duration,100000);assert(s.extra_material_refs.includes('vocal'));assert(!s.extra_material_refs.includes('old'));});
test('Remix fade only targets final footage in each block',()=>{const mk=(id,start)=>({id,target_timerange:{start,duration:5000000},extra_material_refs:[]});const d={materials:{},tracks:[{type:'video',segments:[mk('a',0),mk('b',5000000),mk('c',10000000)]}]};fades.remix({ledger:[{block:1,newStart:0,duration:5000000,segmentIds:['a']},{block:1,newStart:5000000,duration:5000000,segmentIds:['b']},{block:2,newStart:10000000,duration:5000000,segmentIds:['c']}]},d);assert.equal(d.tracks[0].segments[0].extra_material_refs.length,0);assert.equal(d.materials.audio_fades.length,2);assert(d.materials.audio_fades.every(f=>f.fade_out_duration===3000000));});

test('Imported remix without ledger fades final Hook/Body native and detached audio, leaves music intact',()=>{
 const seg=(id,start,duration)=>({id,target_timerange:{start:start*1e6,duration:duration*1e6},extra_material_refs:[]});
 const a=seg('a',0,5),b=seg('b',5,2),c=seg('c',7,6),voice=seg('voice',7,6),song=seg('song',7,6);
 const d={materials:{},tracks:[{type:'video',segments:[a,b,c]},{type:'audio',name:'Tiếng gốc',segments:[voice]},{type:'audio',name:'Nhạc nhân bản',segments:[song]}]};
 fades.remix({blocks:[{start:0,duration:7e6},{start:7e6,duration:6e6}]},d);
 const fade=s=>d.materials.audio_fades.find(f=>s.extra_material_refs.includes(f.id));
 assert.equal(fade(a),undefined);assert.equal(fade(b).fade_out_duration,2e6);assert.equal(fade(c).fade_out_duration,3e6);assert.equal(fade(voice).fade_out_duration,3e6);assert.equal(fade(song),undefined);
});

test('Native footage fade is embedded and linked on the final clip only',()=>{
 const first={material_id:'shared'},last={material_id:'shared',target_timerange:{duration:8e6},extra_material_refs:[]};
 const d={tracks:[{segments:[first,last]}],materials:{videos:[{id:'shared',audio_fade:null}]}};
 fades.attach(d,last,3e6);
 assert.equal(d.materials.videos[0].audio_fade,null);
 const native=d.materials.videos.find(m=>m.id===last.material_id).audio_fade;
 assert.equal(native.fade_out_duration,3e6);
 assert.deepEqual(native,d.materials.audio_fades.find(f=>last.extra_material_refs.includes(f.id)));
});
