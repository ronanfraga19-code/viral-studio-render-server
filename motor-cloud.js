const express=require('express');
const multer=require('multer');
const cors=require('cors');
const {spawn}=require('child_process');
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');

const app=express();
app.disable('x-powered-by');
app.use(cors({origin:true,methods:['GET','POST','OPTIONS'],allowedHeaders:['Content-Type','Accept'],exposedHeaders:['Content-Disposition','Content-Length'],maxAge:86400}));
app.options('*',cors());
app.use(express.json({limit:'1mb'}));

const ROOT=path.join(__dirname,'data');
const RAW=path.join(ROOT,'raw');
const NORM=path.join(ROOT,'norm');
const OUT=path.join(ROOT,'out');
const TMP=path.join(ROOT,'tmp');
for(const d of [RAW,NORM,OUT,TMP]) fs.mkdirSync(d,{recursive:true});

const upload=multer({dest:TMP,limits:{fileSize:700*1024*1024,files:1}});
const jobs=new Map();
const queue=[];
const signatures=new Map();
const normLocks=new Map();
let active=0;
const MAX_CONCURRENCY=1;

function safeId(v){v=String(v||'').toLowerCase().replace(/[^a-z0-9_-]/g,'');return v.length>=8&&v.length<=128?v:null}
function rawPath(id){return path.join(RAW,id+'.bin')}
function normPath(id){return path.join(NORM,id+'.mp4')}
function outPath(id){return path.join(OUT,id+'.mp4')}
function rm(p){try{fs.rmSync(p,{force:true})}catch{}}

function ff(args,timeoutMs=3*60*1000){
  return new Promise((resolve,reject)=>{
    const p=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe']});
    let err='',done=false;
    const timer=setTimeout(()=>{if(done)return;done=true;try{p.kill('SIGKILL')}catch{};reject(new Error('FFmpeg excedeu o limite de tempo desta etapa.'));},timeoutMs);
    p.stderr.on('data',d=>{err=(err+d).slice(-12000)});
    p.on('error',e=>{if(done)return;done=true;clearTimeout(timer);reject(e)});
    p.on('close',code=>{if(done)return;done=true;clearTimeout(timer);code===0?resolve():reject(new Error(err||('ffmpeg '+code)))});
  });
}

app.get('/',(_req,res)=>res.json({ok:true,service:'Viral Studio Motor Cloud',version:'6.4-clean',mode:'gancho-corpo-cta',concurrency:1}));
app.get('/health',(_req,res)=>res.json({ok:true,version:'6.4-clean',active,queued:queue.length,concurrency:1}));

app.get('/assets/:id',(req,res)=>{
  const id=safeId(req.params.id); if(!id) return res.status(400).json({ok:false});
  return res.json({ok:true,exists:fs.existsSync(rawPath(id))||fs.existsSync(normPath(id)),normalized:fs.existsSync(normPath(id))});
});

app.post('/assets',upload.single('clip'),(req,res)=>{
  const id=safeId(req.body.id);
  if(!id||!req.file){if(req.file)rm(req.file.path);return res.status(400).json({error:'ID ou arquivo inválido.'});}
  const dest=rawPath(id);
  try{
    if(fs.existsSync(dest)) rm(req.file.path); else fs.renameSync(req.file.path,dest);
    res.json({ok:true,id,cached:true});
  }catch(e){rm(req.file.path);res.status(500).json({error:'Falha ao guardar arquivo.',detail:e.message});}
});

async function normalize(id){
  const out=normPath(id); if(fs.existsSync(out)) return out;
  if(normLocks.has(id)) return normLocks.get(id);
  const work=(async()=>{
    const src=rawPath(id); if(!fs.existsSync(src)) throw new Error('Trecho ausente: '+id);
    const tmp=out+'.tmp.mp4'; rm(tmp);
    await ff(['-y','-hide_banner','-loglevel','error','-i',src,
      '-map','0:v:0','-map','0:a:0?',
      '-vf','scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30',
      '-c:v','libx264','-preset','ultrafast','-crf','26','-pix_fmt','yuv420p',
      '-c:a','aac','-b:a','96k','-ar','44100','-ac','2','-movflags','+faststart',tmp],4*60*1000);
    fs.renameSync(tmp,out); return out;
  })().finally(()=>normLocks.delete(id));
  normLocks.set(id,work); return work;
}

async function concatCopy(paths,out){
  const list=path.join(TMP,'list-'+crypto.randomUUID()+'.txt');
  fs.writeFileSync(list,paths.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join('\n'));
  try{
    await ff(['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',list,'-map','0:v:0','-map','0:a:0?','-c','copy','-movflags','+faststart',out],90*1000);
  }finally{rm(list)}
}

async function processJob(job){
  job.status='working'; job.progress=10; job.startedAt=Date.now();
  const out=outPath(job.id); rm(out);
  try{
    const raws=job.clips.map(rawPath);
    job.progress=25;
    try{
      await concatCopy(raws,out);
    }catch(_){
      rm(out); job.progress=35;
      const norms=[];
      for(let i=0;i<job.clips.length;i++){
        job.progress=35+i*15;
        norms.push(await normalize(job.clips[i]));
      }
      job.progress=82;
      await concatCopy(norms,out);
    }
    if(!fs.existsSync(out)||fs.statSync(out).size<1024) throw new Error('Arquivo final vazio.');
    job.status='ready'; job.progress=100; job.finishedAt=Date.now(); job.size=fs.statSync(out).size;
  }catch(e){job.status='error';job.progress=100;job.error=String(e.message||e).slice(-2000);job.finishedAt=Date.now();rm(out);}
}

function pump(){
  if(active>=MAX_CONCURRENCY) return;
  const id=queue.shift(); if(!id) return;
  const job=jobs.get(id); if(!job||job.status!=='queued') return pump();
  active=1;
  processJob(job).finally(()=>{active=0;pump();});
}

app.post('/jobs',(req,res)=>{
  const clips=Array.isArray(req.body?.clips)?req.body.clips:[];
  if(clips.length!==3) return res.status(400).json({error:'Envie exatamente Gancho, Corpo e CTA.'});
  const ids=clips.map(safeId); if(ids.some(x=>!x)) return res.status(400).json({error:'ID de trecho inválido.'});
  if(ids.some(id=>!fs.existsSync(rawPath(id))&&!fs.existsSync(normPath(id)))) return res.status(409).json({error:'Um ou mais trechos não chegaram ao Motor Cloud.'});
  const sig=String(req.body?.signature||'').slice(0,180);
  if(sig&&signatures.has(sig)){
    const old=jobs.get(signatures.get(sig));
    if(old) return res.status(200).json({ok:true,id:old.id,status:old.status,deduplicated:true});
    signatures.delete(sig);
  }
  const id=crypto.randomUUID();
  const job={id,clips:ids,label:String(req.body?.label||''),status:'queued',progress:0,createdAt:Date.now()};
  jobs.set(id,job); if(sig)signatures.set(sig,id); queue.push(id); pump();
  res.status(202).json({ok:true,id,status:'queued'});
});

app.post('/jobs/status',(req,res)=>{
  const ids=Array.isArray(req.body?.ids)?req.body.ids.slice(0,100):[];
  res.json({ok:true,jobs:ids.map(id=>{const j=jobs.get(String(id));return j?{id:j.id,status:j.status,progress:j.progress,error:j.error||null,size:j.size||0}:{id:String(id),status:'missing',progress:100,error:'Job não encontrado'}})});
});
app.get('/jobs/:id',(req,res)=>{const j=jobs.get(String(req.params.id));if(!j)return res.status(404).json({error:'Job não encontrado'});res.json({ok:true,id:j.id,status:j.status,progress:j.progress,error:j.error||null,size:j.size||0});});
app.get('/jobs/:id/file',(req,res)=>{const id=String(req.params.id),j=jobs.get(id),p=outPath(id);if(!j||j.status!=='ready'||!fs.existsSync(p))return res.status(404).json({error:'Vídeo ainda não está pronto'});res.set({'Cache-Control':'no-store','Content-Disposition':`attachment; filename="viral-studio-${id}.mp4"`});res.sendFile(p);});

setInterval(()=>{const cutoff=Date.now()-4*60*60*1000;for(const [id,j] of jobs){if((j.finishedAt||j.createdAt)<cutoff&&['ready','error'].includes(j.status)){jobs.delete(id);rm(outPath(id));}}},30*60*1000).unref?.();

const PORT=Number(process.env.PORT||10000);
const server=app.listen(PORT,'0.0.0.0',()=>console.log(`Viral Studio Motor Cloud V6.4 CLEAN pronto na porta ${PORT}`));
server.requestTimeout=12*60*1000;
server.headersTimeout=13*60*1000;
server.keepAliveTimeout=65000;
