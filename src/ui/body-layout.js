(function(root){
 function baseBody(draft){return draft.body.filter(c=>!c.supplementFor);}
 function blockIndices(draft){let ordinal=-1;const size=Math.max(1,draft.blockSize||1);return draft.body.map(c=>{if(!c.supplementFor)ordinal++;return Math.floor(Math.max(0,ordinal)/size);});}
 const api={baseBody,blockIndices};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.CCBBody=api;
})(globalThis);
