const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const writer=require('../src/capcut-writer.cjs'),{defaults}=require('../src/domain.cjs');
const agency='C:/Windows/Fonts/AGENCYB.TTF';
test('Agency FB Bold left margin uses CapCut-rendered width for short and long credits', {skip:!fs.existsSync(agency)},()=>{
 const font=require('fontkit').openSync(agency),p={...defaults().text,font:agency,size:15,scale:.2,marginLeft:30};
 for(const source of ['TAILBITPETS','ELEPHANT HAVENS WILDLIFE FOUNDATION']){
  const seg={},m=writer.makeText({source,path:'clip.mp4',text:p},seg);
  const width=font.layout(source).advanceWidth/font.unitsPerEm*15*.2*(85/9)*1.25;
  const center=(seg.clip.transform.x+1)*960;
  assert(Math.abs(center-width/2-30)<1e-8);assert.equal(m.font_path,agency);
 }
 const seg={};writer.makeText({source:'TAILBITPETS',path:'clip.mp4',text:p},seg);
 // Observed original cover left=16 with center=89.17. Correction should add ~15px.
 assert((seg.clip.transform.x+1)*960>103 && (seg.clip.transform.x+1)*960<105);
});
test('Arial keeps its existing credit width calibration',{skip:!fs.existsSync('C:/Windows/Fonts/arial.ttf')},()=>{
 const font=require('fontkit').openSync('C:/Windows/Fonts/arial.ttf'),p={...defaults().text,font:'Arial'},source='A LONG CREDIT',seg={};writer.makeText({source,path:'clip.mp4',text:p},seg);
 const width=font.layout(source).advanceWidth/font.unitsPerEm*p.size*p.scale*(85/9);
 assert(Math.abs((seg.clip.transform.x+1)*960-width/2-p.marginLeft)<1e-8);
});
