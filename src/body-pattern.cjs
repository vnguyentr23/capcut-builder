function matches(draft,groups){
 const base=(draft.body||[]).filter(b=>!b.supplementFor),pattern=draft.pattern;if(!pattern.length)return !base.length;
 if(draft.bodyPattern&&JSON.stringify(draft.bodyPattern)!==JSON.stringify(pattern))return false;
 const match=n=>base.every((b,i)=>i<n?pattern.includes(b.requestedGroupId||b.groupId):(b.requestedGroupId||b.groupId)===pattern[((b.slotIndex??i)-n)%pattern.length]);
 if(match(0))return true;
 // Replaced clips in older drafts may have lost the tag inside the priority prefix.
 let tagged=base.findLastIndex(b=>b.priority)+1;if(tagged&&match(tagged))return true;
 // Existing drafts from the first numbered-lock release have no priority tags.
 let prefix=0;for(const id of require('./ui/pin-order.js').ordered(draft,groups)){if(base[prefix]?.id===id&&pattern.includes(base[prefix].groupId))prefix++;}
 return prefix>0&&match(prefix);
}
module.exports={matches};
