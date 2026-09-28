const express=require('express'),multer=require('multer'),cors=require('cors');
const {spawn}=require('child_process');const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');
const app=express();app.use(cors({origin:true}));app.use(express.json());
const upload=multer({dest:path.join(os.tmpdir(),'viral-studio-uploads'),limits:{fileSize:250*1024*1024}});
app.get('/',(_q,r)=>r.json({ok:true,service:'Viral Studio Render Server TURBO',version:'4.39.1'}));
app.get('/health',(_q,r)=>r.json({ok:true,mode:'turbo',version:'4.39.1'}));
function run(cmd,args){return new Promise((ok,no)=>{const p=spawn(cmd,args,{stdio:['ignore','ignore','pipe']});let e='';p.stderr.on('data',d=>e+=d);p.on('error',no);p.on('close',c=>c===0?ok():no(new Error(e||`${cmd} exited ${c}`)))})}
function clean(files,dir){try{files.forEach(f=>fs.rmSync(f.path,{force:true}));fs.rmSync(dir,{recursive:true,force:true})}catch{}}
app.post('/render',upload.array('clips',20),async(req,res)=>{
 const files=req.files||[];if(!files.length)return res.status(400).json({error:'Envie clips.'});
 const id=crypto.randomUUID(),dir=path.join(os.tmpdir(),`viral-${id}`);fs.mkdirSync(dir,{recursive:true});
 const list=path.join(dir,'list.txt'),out=path.join(dir,'viral-studio.mp4');
 const makeList=arr=>fs.writeFileSync(list,arr.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join('\n'));
 try{
   // TURBO: primeiro tenta concatenação sem recodificar. Para trechos do Viral Studio isso costuma ser quase instantâneo.
   makeList(files.map(f=>f.path));
   try{await run('ffmpeg',['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',list,'-map','0:v:0?','-map','0:a:0?','-c','copy','-movflags','+faststart',out]);}
   catch(copyErr){
     // Fallback compatível: só recodifica quando os trechos realmente não podem ser concatenados diretamente.
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
app.listen(process.env.PORT||10000,'0.0.0.0',()=>console.log('Viral Studio Render Server TURBO on '+(process.env.PORT||10000)));
