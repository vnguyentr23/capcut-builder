const test=require('node:test'),assert=require('node:assert/strict'),{Store}=require('../src/store.cjs');
test('Blocked footage query preserves reservations, own draft, other projects and missing history',()=>{
 const s=new Store(':memory:');try{
 const add=s.db.prepare('INSERT INTO projects VALUES(?,?,?,?,?,?,?)');
 for(const [id,snapshot] of [['own',{draft:{id:'d'}}],['fallback',{projectId:'d'}],['other',{draft:{id:'other'}}],['legacy',{}]])add.run(id,'n',id,'CREATED','', '2026',JSON.stringify(snapshot));
 const use=s.db.prepare('INSERT INTO usage VALUES(?,?,?,?)');for(const id of ['own','fallback','other','legacy','missing'])use.run('n',id,id,'body');use.run('n','shared','own','hook');use.run('n','shared','other','body');use.run('else','foreign','other','body');
 s.db.prepare('INSERT INTO reservations VALUES(?,?,?)').run('n','d','current');s.db.prepare('INSERT INTO reservations VALUES(?,?,?)').run('n','x','reserved');
 assert.deepEqual([...s.blocked('n','d')].sort(),['legacy','missing','other','reserved','shared']);
 }finally{s.close();}
});
