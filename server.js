const express=require('express'),multer=require('multer'),cors=require('cors');
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const app=express();app.disable('x-powered-by');app.use(cors({origin:true,methods:['GET','POST','OPTIONS'],allowedHeaders:['Content-Type','Accept'],maxAge:86400}));app.options('*',cors());app.use(express.json({limit:'1mb'}));
const upload=multer({dest:path.join(os.tmpdir(),'viral-studio-uploads'),limits:{fileSize:250*1024*1024}});

// Registro leve para descoberta automática do Motor PC.
// O PC mantém um heartbeat; o celular consulta somente o pairId.
const motors=new Map();
const MOTOR_TTL=75*1000;
function cleanPair(v){v=String(v||'').trim();return /^[a-zA-Z0-9_-]{12,80}$/.test(v)?v:null}
function validTunnel(u){try{const x=new URL(String(u||''));return x.protocol==='https:'&&(/\.trycloudflare\.com$/i.test(x.hostname)||/\.workers\.dev$/i.test(x.hostname))?x.origin:null}catch{return null}}
app.post('/motor/register',(req,res)=>{
 const pairId=cleanPair(req.body?.pairId),secret=String(req.body?.secret||''),url=validTunnel(req.body?.url);
 if(!pairId||secret.length<20||!url)return res.status(400).json({ok:false,error:'Registro inválido'});
 const now=Date.now(),prev=motors.get(pairId);
 if(prev&&now-prev.seenAt<MOTOR_TTL&&prev.secret!==secret)return res.status(403).json({ok:false,error:'Motor já registrado'});
 motors.set(pairId,{secret,url,seenAt:now,pcName:String(req.body?.pcName||'').slice(0,80),version:String(req.body?.version||'').slice(0,30)});
 res.json({ok:true,pairId,url,ttlSeconds:Math.floor(MOTOR_TTL/1000)});
});
app.get('/motor/current/:pairId',(req,res)=>{
 const pairId=cleanPair(req.params.pairId),m=pairId&&motors.get(pairId),now=Date.now();
 if(!m||now-m.seenAt>MOTOR_TTL)return res.status(404).json({ok:false,online:false,error:'Motor offline'});
 res.set('Cache-Control','no-store');res.json({ok:true,online:true,url:m.url,pcName:m.pcName,version:m.version,ageMs:now-m.seenAt});
});
app.get('/motor/status',(req,res)=>res.json({ok:true,registered:[...motors.entries()].filter(([,m])=>Date.now()-m.seenAt<MOTOR_TTL).length}));

app.get('/',(_q,r)=>r.json({ok:true,service:'Servidor de renderização do Viral Studio',version:'4.44-autopair',autoPair:true}));
app.get('/health',(_q,r)=>r.json({ok:true,mode:'turbo',version:'4.44-autopair',autoPair:true}));
function run(cmd,args){return new Promise((ok,no)=>{const p=spawn(cmd,args,{stdio:['ignore','ignore','pipe']});let e='';p.stderr.on('data',d=>e=(e+d).slice(-12000));p.on('error',no);p.on('close',c=>c===0?ok():no(new Error(e||`${cmd} exited ${c}`)))})}
function clean(files,dir){try{files.forEach(f=>fs.rmSync(f.path,{force:true}));fs.rmSync(dir,{recursive:true,force:true})}catch{}}
app.post('/render',upload.array('clips',20),async(req,res)=>{
 const files=req.files||[];if(!files.length)return res.status(400).json({error:'Envie clips.'});
 const id=crypto.randomUUID(),dir=path.join(os.tmpdir(),`viral-${id}`);fs.mkdirSync(dir,{recursive:true});
 const list=path.join(dir,'list.txt'),out=path.join(dir,'viral-studio.mp4');
 const makeList=arr=>fs.writeFileSync(list,arr.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join('\n'));
 try{
   makeList(files.map(f=>f.path));
   try{await run('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',list,'-map','0:v:0?','-map','0:a:0?','-c','copy','-movflags','+faststart',out]);}
   catch(copyErr){
     const norm=[];
     for(let i=0;i<files.length;i++){
       const t=path.join(dir,`n${i}.mp4`);
       await run('ffmpeg',['-y','-hide_banner','-loglevel','error','-i',files[i].path,'-c:v','libx264','-preset','ultrafast','-crf','26','-pix_fmt','yuv420p','-c:a','aac','-b:a','96k','-ar','44100','-movflags','+faststart',t]);norm.push(t);
     }
     makeList(norm);await run('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',list,'-c','copy','-movflags','+faststart',out]);
   }
   const st=fs.statSync(out);res.set({'Content-Type':'video/mp4','Content-Length':String(st.size),'Content-Disposition':`attachment; filename="viral-studio-${id}.mp4"`,'X-Viral-Studio-Mode':'turbo'});
   const s=fs.createReadStream(out);s.pipe(res);s.on('close',()=>clean(files,dir));
 }catch(e){clean(files,dir);res.status(500).json({error:'Falha ao renderizar',detail:String(e.message||e).slice(-2000)})}
});
const port=process.env.PORT||10000;app.listen(port,'0.0.0.0',()=>console.log('Viral Studio Render Server AUTO-PAIR on '+port));
