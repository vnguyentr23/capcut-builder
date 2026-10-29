module.exports=function(state,a,b){
 const d=structuredClone(state.draft);if(!['hook','body'].includes(a.role)||a.role!==b.role)throw Error('Dùng đổi với Hook để đổi giữa Hook và Body.');const list=d[a.role];if(!Number.isInteger(a.index)||!Number.isInteger(b.index)||!list[a.index]||!list[b.index])throw Error('Vị trí footage không hợp lệ.');
 if(a.role==='hook'){[list[a.index],list[b.index]]=[list[b.index],list[a.index]];return d;}
 const x=list[a.index],y=list[b.index];list[a.index]={...x,id:y.id,groupId:y.groupId,requestedGroupId:x.requestedGroupId||x.groupId};list[b.index]={...y,id:x.id,groupId:x.groupId,requestedGroupId:y.requestedGroupId||y.groupId};
 for(const c of list){if(c.supplementFor===x.id)c.supplementFor=y.id;else if(c.supplementFor===y.id)c.supplementFor=x.id;}return d;
};
