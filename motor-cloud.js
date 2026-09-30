const express=require('express');
const multer=require('multer');
const cors=require('cors');
const {spawn}=require('child_process');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const app=express();
app.disable('x-powered-by');
app.use(cors({origin:true,methods:['GET','POST','OPTIONS'],allowedHeaders:['Content-Type','Accept'],exposedHeaders:['Content-Disposition','Content-Length']}));
app.options('*',cors());
app.use(express.json({limit:'1mb'}));

const ROOT=path.join(__dirname,'data'), RAW=path.join(ROOT,'raw'), OUT=path.join(ROOT,'out'), TMP=path.join(ROOT,'tmp');
for(const d of [RAW,OUT,TMP]) fs.mkdirSync(d,{recursive:true});
const upload=multer({dest:TMP,limits:{fileSize:700*1024*1024,files:1}});
const jobs=new Map(), queue=[];
let active=0;
function safeId(v){v=String(v||'').toLowerCase().replace(/[^a-z0-9_-]/g,'');return v.length>=8&&v.length<=128?v:null}
function rawPath(id){return path.join(RAW,id+'.bin')}
function outPath(id){return path.join(OUT,id+'.mp4')}
function rm(p){try{fs.rmSync(p,{force:true})}catch{}}
function run(bin,args,timeoutMs=90000){return new Promise((resolve,reject)=>{const p=spawn(bin,args,{stdio:['ignore','pipe','pipe']});let out='',err='',done=false;const t=setTimeout(()=>{if(done)return;done=true;try{p.kill('SIGKILL')}catch{};reject(new Error(bin+' excedeu o tempo limite'));},timeoutMs);p.stdout.on('data',d=>out=(out+d).slice(-20000));p.stderr.on('data',d=>err=(err+d).slice(-20000));p.on('error',e=>{if(done)return;done=true;clearTimeout(t);reject(e)});p.on('close',c=>{if(done)return;done=true;clearTimeout(t);c===0?resolve(out):reject(new Error(err||bin+' saiu com '+c))});});}
async function probe(file){const s=await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,pix_fmt,r_frame_rate,time_base','-of','json',file],30000);try{return JSON.parse(s).streams?.[0]||{}}catch{return {}}}
async function directConcat(files,out){const list=path.join(TMP,'list-'+crypto.randomUUID()+'.txt');fs.writeFileSync(list,files.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join('\n'));try{await run('ffmpeg',['-y','-hide_banner','-loglevel','error','-fflags','+genpts','-f','concat','-safe','0','-i',list,'-map','0:v:0','-map','0:a:0?','-c','copy','-avoid_negative_ts','make_zero','-movflags','+faststart',out],90000);}finally{rm(list)}}
async function tsConcat(files,out){const ts=[];try{for(const f of files){const p=path.join(TMP,crypto.randomUUID()+'.ts');ts.push(p);await run('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',f,'-map','0:v:0','-map','0:a:0?','-c','copy','-bsf:v','h264_mp4toannexb','-f','mpegts',p],60000);}const spec='concat:'+ts.join('|');await run('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',spec,'-map','0:v:0','-map','0:a:0?','-c','copy','-bsf:a','aac_adtstoasc','-avoid_negative_ts','make_zero','-movflags','+faststart',out],90000);}finally{ts.forEach(rm)}}

app.get('/',(_q,r)=>r.json({ok:true,service:'Viral Studio Motor Cloud',version:'6.5-copyfast',mode:'copy-only',concurrency:1}));
app.get('/health',(_q,r)=>r.json({ok:true,version:'6.5-copyfast',active,queued:queue.length,concurrency:1,mode:'copy-only'}));
app.get('/assets/:id',(q,r)=>{const id=safeId(q.params.id);if(!id)return r.status(400).json({ok:false});r.json({ok:true,exists:fs.existsSync(rawPath(id))});});
app.post('/assets',upload.single('clip'),(q,r)=>{const id=safeId(q.body.id);if(!id||!q.file){if(q.file)rm(q.file.path);return r.status(400).json({error:'ID ou arquivo inválido'});}const dest=rawPath(id);try{if(fs.existsSync(dest))rm(q.file.path);else fs.renameSync(q.file.path,dest);r.json({ok:true,id});}catch(e){rm(q.file.path);r.status(500).json({error:e.message});}});
app.post('/jobs',(q,r)=>{const clips=Array.isArray(q.body?.clips)?q.body.clips.map(safeId):[];if(clips.length!==3||clips.some(x=>!x))return r.status(400).json({error:'Envie exatamente Gancho, Corpo e CTA'});if(clips.some(id=>!fs.existsSync(rawPath(id))))return r.status(409).json({error:'Um ou mais trechos não chegaram ao Motor Cloud'});const id=crypto.randomUUID();const j={id,clips,status:'queued',progress:0,error:null,createdAt:Date.now()};jobs.set(id,j);queue.push(id);pump();r.status(202).json({ok:true,id,status:'queued'});});
app.get('/jobs/:id',(q,r)=>{const j=jobs.get(String(q.params.id));if(!j)return r.status(404).json({status:'missing',error:'Job não encontrado'});r.json({ok:true,id:j.id,status:j.status,progress:j.progress,error:j.error});});
app.get('/jobs/:id/file',(q,r)=>{const id=String(q.params.id),j=jobs.get(id),p=outPath(id);if(!j||j.status!=='ready'||!fs.existsSync(p))return r.status(404).json({error:'Vídeo ainda não está pronto'});r.set({'Cache-Control':'no-store','Content-Disposition':`attachment; filename="viral-studio-${id}.mp4"`});r.sendFile(p);});
async function processJob(j){j.status='working';j.progress=10;const files=j.clips.map(rawPath),out=outPath(j.id);rm(out);try{const meta=await Promise.all(files.map(probe));j.progress=25;const sig=m=>[m.codec_name,m.width,m.height,m.pix_fmt].join('|');if(new Set(meta.map(sig)).size>1)throw new Error('Os 3 trechos têm formatos/resoluções diferentes. Para o Render gratuito, use vídeos com o mesmo formato e resolução.');try{await directConcat(files,out);}catch(e){rm(out);j.progress=55;await tsConcat(files,out);}if(!fs.existsSync(out)||fs.statSync(out).size<1024)throw new Error('Arquivo final vazio');j.status='ready';j.progress=100;j.finishedAt=Date.now();}catch(e){j.status='error';j.progress=100;j.error=String(e.message||e).slice(-1800);j.finishedAt=Date.now();rm(out);}}
function pump(){if(active)return;const id=queue.shift();if(!id)return;const j=jobs.get(id);if(!j||j.status!=='queued')return pump();active=1;processJob(j).finally(()=>{active=0;pump();});}
setInterval(()=>{const cut=Date.now()-4*60*60*1000;for(const [id,j] of jobs){if((j.finishedAt||j.createdAt)<cut&&['ready','error'].includes(j.status)){jobs.delete(id);rm(outPath(id));}}},30*60*1000).unref?.();
const PORT=Number(process.env.PORT||10000);app.listen(PORT,'0.0.0.0',()=>console.log(`Viral Studio Motor Cloud V6.5 COPYFAST pronto na porta ${PORT}`));
