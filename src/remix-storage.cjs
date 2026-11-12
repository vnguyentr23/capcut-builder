function transaction(db, work) {
  db.exec('SAVEPOINT remix_storage');
  try {
    const value = work();
    db.exec('RELEASE remix_storage');
    return value;
  } catch (error) {
    db.exec('ROLLBACK TO remix_storage; RELEASE remix_storage');
    throw error;
  }
}

function install(db) {
  if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='view' AND name='remix_batches'").get()) return;
  transaction(db, () => {
    db.exec(`
      ALTER TABLE remix_batches RENAME TO remix_headers;
      CREATE TABLE remix_projects (
        batch TEXT NOT NULL REFERENCES remix_headers(id) ON DELETE CASCADE,
        position INTEGER NOT NULL, id TEXT NOT NULL, updated TEXT NOT NULL,
        name TEXT GENERATED ALWAYS AS (json_extract(data,'$.name')) STORED,
        blocks TEXT GENERATED ALWAYS AS (json_extract(data,'$.blocks')) STORED,
        installed TEXT GENERATED ALWAYS AS (json_extract(data,'$.installed')) STORED,
        data TEXT NOT NULL,
        signature TEXT GENERATED ALWAYS AS (json_extract(data,'$.signature')) STORED,
        PRIMARY KEY(batch,id), UNIQUE(batch,position)
      );
      CREATE TABLE remix_edit_config(batch TEXT PRIMARY KEY REFERENCES remix_headers(id) ON DELETE CASCADE, settings TEXT, folders TEXT);
      CREATE TRIGGER remix_config_insert AFTER INSERT ON remix_headers BEGIN
        INSERT INTO remix_edit_config VALUES(new.id,coalesce(json_extract(new.data,'$.renderSettings'),json_extract(new.data,'$.settings')),json_extract(new.data,'$.musicFolders')); END;
      CREATE TRIGGER remix_config_update AFTER UPDATE OF data ON remix_headers BEGIN
        INSERT INTO remix_edit_config VALUES(new.id,coalesce(json_extract(new.data,'$.renderSettings'),json_extract(new.data,'$.settings')),json_extract(new.data,'$.musicFolders')) ON CONFLICT(batch) DO UPDATE SET settings=excluded.settings,folders=excluded.folders; END;
      CREATE INDEX remix_project_stamp ON remix_projects(batch,updated DESC);
      CREATE VIEW remix_batches AS SELECT id,root_id,channel_id,name,
        json_set(h.data,'$.projects',json(COALESCE((SELECT json_group_array(json(data) ORDER BY position)
          FROM remix_projects WHERE batch=h.id),'[]')),'$.updated',max(h.updated,COALESCE((SELECT max(updated) FROM remix_projects WHERE batch=h.id),h.updated))) data,
        max(h.updated,COALESCE((SELECT max(updated) FROM remix_projects WHERE batch=h.id),h.updated)) updated,
        CASE WHEN EXISTS(SELECT 1 FROM remix_projects WHERE batch=h.id AND updated>h.updated)
        THEN json_set(h.summary,'$.names',json((SELECT json_group_array(name ORDER BY position) FROM remix_projects WHERE batch=h.id)),'$.signatures',json((SELECT json_group_array(value) FROM
          (SELECT value FROM json_each(h.data,'$.inheritedHistory') UNION SELECT signature FROM remix_projects WHERE batch=h.id))))
        ELSE h.summary END summary FROM remix_headers h;
      CREATE TRIGGER remix_delete INSTEAD OF DELETE ON remix_batches BEGIN DELETE FROM remix_headers WHERE id=old.id; END;
      CREATE TRIGGER remix_insert INSTEAD OF INSERT ON remix_batches BEGIN
        INSERT INTO remix_headers VALUES(new.id,new.root_id,new.channel_id,new.name,json_remove(new.data,'$.projects'),new.updated,new.summary);
        INSERT INTO remix_projects(batch,position,id,data,updated) SELECT new.id,key,json_extract(value,'$.id'),value,new.updated FROM json_each(new.data,'$.projects');
      END;
      INSERT INTO remix_projects(batch,position,id,data,updated)
        SELECT h.id,j.key,json_extract(j.value,'$.id'),j.value,h.updated FROM remix_headers h,json_each(h.data,'$.projects') j;
      UPDATE remix_headers SET data=json_remove(data,'$.projects') WHERE json_type(data,'$.projects') IS NOT NULL;
    `);
  });
}

function saveProjects(store,batch,projects,expected) {
  const db=store.db;
  return transaction(db,()=>{
    const current=db.prepare('SELECT updated FROM remix_batches WHERE id=?').get(batch)?.updated;
    if (!current || (expected && current!==expected)) throw Error('Bộ dự án đã thay đổi. Hãy mở lại trước khi lưu.');
    const updated=new Date(Math.max(Date.now(),Date.parse(current)+1)).toISOString();
    const update=db.prepare('UPDATE remix_projects SET data=?,updated=? WHERE batch=? AND id=?');
    for (const p of projects) {
      if (!update.run(JSON.stringify(p),updated,batch,p.id).changes) throw Error('Không tìm thấy bản nháp.');
    }
    return updated;
  });
}
module.exports={install,transaction,saveProjects};
