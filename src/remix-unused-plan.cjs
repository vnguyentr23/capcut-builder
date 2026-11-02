// Match Body slots to unused source footage without moving their source slot.
module.exports=function unusedPlan(plan,sources,used){
 const hook=new Set(plan.blocks[0].units.map(u=>u.identity)),cells=[];
 for(let bi=1;bi<plan.blocks.length;bi++)for(let slot=0;slot<plan.blocks[bi].units.length;slot++){
  const current=plan.blocks[bi].units[slot],pool=[];
  for(const source of sources)for(let i=Math.max(1,bi-1);i<=bi+1;i++){
   const u=source.blocks[i]?.units[slot];if(u&&!used.has(u.identity)&&!hook.has(u.identity))pool.push(u);
  }
  pool.sort((a,b)=>Number(b.identity===current.identity)-Number(a.identity===current.identity));
  cells.push({bi,slot,pool:[...new Map(pool.map(u=>[u.identity,u])).values()]});
 }
 const owners=new Map(),assigned=new Map();
 function match(cell,seen){for(const u of cell.pool){if(seen.has(u.identity))continue;seen.add(u.identity);const previous=owners.get(u.identity);if(!previous||match(previous,seen)){owners.set(u.identity,cell);assigned.set(cell,u);return true;}}return false;}
 for(const cell of [...cells].sort((a,b)=>a.pool.length-b.pool.length))if(!match(cell,new Set()))throw Error(`Không đủ footage chưa dùng cho Body · Block ${cell.bi}, vị trí ${cell.slot+1}. Bản nháp được giữ nguyên.`);
 for(const cell of cells)plan.blocks[cell.bi].units[cell.slot]=assigned.get(cell);
 return plan;
};
