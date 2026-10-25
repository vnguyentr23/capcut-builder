import fs from 'node:fs';
import * as fontkit from 'fontkit';
import crypto from 'node:crypto';
const clone=structuredClone,uid=()=>crypto.randomUUID().toUpperCase();
const readJson=p=>JSON.parse(fs.readFileSync(p,'utf8'));
export const authorStyle=readJson(new URL('./author-style.json',import.meta.url));
let fonts;
function measure(text,preset){
 if(Object.hasOwn(preset.widths,text))return preset.widths[text];
 if(!fonts){fonts=[preset.material.font_path,'C:/Windows/Fonts/msyh.ttc','C:/Windows/Fonts/seguisym.ttf','C:/Windows/Fonts/arial.ttf'].filter(fs.existsSync).map(p=>{const f=fontkit.openSync(p);return f.fonts?.[0]||f;});}
 if(!fonts.length)throw new Error('Không tìm được font để căn tên tác giả: '+text);
 return Math.max(...text.split('\n').map(line=>[...line].reduce((n,ch)=>{const f=fonts.find(f=>f.hasGlyphForCodePoint(ch.codePointAt(0)))||fonts[0];return n+f.glyphForCodePoint(ch.codePointAt(0)).advanceWidth/f.unitsPerEm;},0)));
}
export function styleAuthor(segment,originalMaterial,canvas,preset=authorStyle){
 const text=JSON.parse(originalMaterial.content).text;
 if(typeof text!=='string')throw new Error('Chữ tác giả không có nội dung hợp lệ.');
 const material=clone(preset.material);material.id=uid();
 const content=JSON.parse(material.content);content.text=text;content.styles=content.styles.slice(0,1);content.styles[0].range=[0,text.length];material.content=JSON.stringify(content);
 material.base_content='';material.recognize_text='';material.text_to_audio_ids=[];material.relevance_segment=[];material.words={start_time:[],end_time:[],text:[]};material.current_words=clone(material.words);
 const width=measure(text,preset),referenceWidth=measure(preset.referenceText,preset);
 const clip=clone(preset.clip);
 clip.alpha=0.5;
 // CapCut uses the text box center for transform.x. Offset by half the width
 // difference in pixels to keep the left edge at the reference's exact margin.
 clip.transform.x+=(width-referenceWidth)*preset.pixelsPerEm/preset.canvas.width;
 const left=(preset.clip.transform.x+1)/2-referenceWidth*preset.pixelsPerEm/(2*preset.canvas.width);
 if(left+width*preset.pixelsPerEm/preset.canvas.width>1)throw new Error('Tên tác giả quá dài để giữ nguyên cỡ chữ trong khung hình: '+text);
 segment.clip=clip;segment.uniform_scale=clone(preset.uniform_scale);segment.common_keyframes=[];segment.keyframe_refs=[];segment.extra_material_refs=[];segment.material_id=material.id;
 segment.responsive_layout={enable:false,target_follow:'',size_layout:0,horizontal_pos_layout:0,vertical_pos_layout:0};
 return material;
}
