const fs=require('node:fs');const path=require('node:path');const {Readable}=require('node:stream');
function mediaResponse(file,request){
 const size=fs.statSync(file).size,range=request.headers.get('range'),type={'.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mkv':'video/x-matroska'}[path.extname(file).toLowerCase()]||'application/octet-stream';
 const headers={'Content-Type':type,'Accept-Ranges':'bytes'};let start=0,end=size-1,status=200;
 if(range){const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+size}});
 if(!match[1])start=Math.max(0,size-Number(match[2]));else start=Number(match[1]);
 if(match[1]&&match[2])end=Math.min(end,Number(match[2]));
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return new Response(null,{status:416,headers:{...headers,'Content-Range':'bytes */'+size}});
 status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 }
 headers['Content-Length']=String(Math.max(0,end-start+1));
 return new Response(request.method==='HEAD'||size===0?null:Readable.toWeb(fs.createReadStream(file,{start,end})),{status,headers});
}
module.exports={mediaResponse};
