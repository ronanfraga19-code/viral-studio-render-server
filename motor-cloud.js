const express=require('express'),multer=require('multer'),cors=require('cors');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');

const app=express();app.disable('x-powered-by');
app.use(cors({origin:true,methods:['GET','POST','OPTIONS'],allowedHeaders:['Content-Type','Accept'],exposedHeaders:['Content-Disposition','Content-Length'],maxAge:86400}));
app.options('*',cors());app.use(express.json({limit:'2mb'}));

const ROOT=path.join(__dirname,'vs-data'),RAW=path.join(ROOT,'assets','raw'),NORM=path.join(ROOT,'assets','norm'),OUT=path.join(ROOT,'jobs'),TMP=path.join(ROOT,'tmp');
for(const d of [RAW,NORM,OUT,TMP])fs.mkdirSync(d,{recursive:true});
const upload=multer({dest:TMP,limits:{fileSize:2*1024*1024*1024,files:1}});
const jobs=new Map(), queue=[];let active=0;
const signatures=new Map();
const MAX_CONCURRENCY=1; // V6.2: Render Free - apenas 1 FFmpeg por vez
const normLocks=new Map();

function safeId(v){v=String(v||'').toLowerCase().replace(/[^a-z0-9_-]/g,'');return v.length>=8&&v.length<=128?v:null}
function rawPath(id){return path.join(RAW,id+'.bin')}
function normPath(id){return path.join(NORM,id+'.mp4')}
function outPath(id){return path.join(OUT,id+'.mp4')}
function cleanFile(p){try{fs.rmSync(p,{force:true})}catch{}}
function run(args){return new Promise((ok,no)=>{const p=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe'],windowsHide:true});let e='';p.stderr.on('data',d=>{e=(e+d).slice(-16000)});p.on('error',no);p.on('close',c=>c===0?ok():no(new Error(e||('ffmpeg '+c))) )})}
function runOut(bin,args){return new Promise((ok,no)=>{const p=spawn(bin,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',no);p.on('close',c=>c===0?ok(out.trim()):no(new Error(err||out||bin+' '+c)))})}
function runInput(bin,args,input){return new Promise((ok,no)=>{const p=spawn(bin,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',no);p.on('close',c=>c===0?ok(out.trim()):no(new Error(err||out||bin+' '+c)));p.stdin.end(input)})}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

app.get('/',(_q,r)=>r.json({ok:true,service:'Viral Studio Render PC',version:'5.8',maxBatch:100,concurrency:MAX_CONCURRENCY,mode:'creative-multiplier'}));
app.get('/health',(_q,r)=>r.json({ok:true,engine:'cloud',version:'6.2',maxBatch:100,concurrency:MAX_CONCURRENCY,active,queued:queue.length}));
app.get('/assets/:id',(req,res)=>{const id=safeId(req.params.id);if(!id)return res.status(400).json({ok:false});res.json({ok:true,exists:fs.existsSync(rawPath(id))||fs.existsSync(normPath(id)),normalized:fs.existsSync(normPath(id))})});
app.post('/assets',upload.single('clip'),(req,res)=>{const id=safeId(req.body.id);if(!id||!req.file){if(req.file)cleanFile(req.file.path);return res.status(400).json({error:'ID ou arquivo inválido'})}
 const dest=rawPath(id);try{if(fs.existsSync(dest))cleanFile(req.file.path);else fs.renameSync(req.file.path,dest);res.json({ok:true,id,cached:true})}catch(e){cleanFile(req.file.path);res.status(500).json({error:'Falha ao guardar arquivo',detail:e.message})}});

async function ensureNormalized(id){
  const n=normPath(id); if(fs.existsSync(n)) return n;
  if(normLocks.has(id)) return normLocks.get(id);
  const p=(async()=>{
    const src=rawPath(id); if(!fs.existsSync(src)) throw new Error('Asset ausente: '+id);
    const tmp=n+'.tmp-'+Date.now()+'.mp4';
    await run(['-y','-hide_banner','-loglevel','error','-i',src,'-map','0:v:0?','-map','0:a:0?','-vf','scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30','-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ar','44100','-ac','2','-movflags','+faststart',tmp]);
    fs.renameSync(tmp,n); return n;
  })().finally(()=>normLocks.delete(id));
  normLocks.set(id,p); return p;
}

async function probeDuration(file){
  try{
    const out=await runOut('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',file]);
    const v=parseFloat(out); return Number.isFinite(v)&&v>0?v:6;
  }catch(_){return 6}
}

async function concatCopy(paths,out){
  const list=path.join(TMP,'list-'+crypto.randomUUID()+'.txt');
  fs.writeFileSync(list,paths.map(f=>`file '${f.replaceAll("'","'\\''")}'`).join('\n'));
  try{await run(['-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',list,'-map','0:v:0?','-map','0:a:0?','-c','copy','-movflags','+faststart',out])}finally{cleanFile(list)}
}

const PRESETS={
  original:null,
  produto:'eq=contrast=1.05:saturation=1.08,unsharp=5:5:0.35:5:5:0',
  problema:'eq=contrast=1.08:saturation=1.00,unsharp=5:5:0.45:5:5:0',
  ugc:'eq=contrast=1.02:saturation=1.03',
  pov:'eq=contrast=1.04:saturation=1.06,unsharp=5:5:0.3:5:5:0',
  oferta:'eq=contrast=1.09:saturation=1.12,unsharp=5:5:0.45:5:5:0',
  curiosidade:'eq=contrast=1.05:saturation=1.05,vignette=PI/7'
};
function safePreset(v){v=String(v||'original').toLowerCase();return Object.prototype.hasOwnProperty.call(PRESETS,v)?v:'original'}
function safeMode(v){v=String(v||'original').toLowerCase();return ['original','director','shopia','multiplier'].includes(v)?v:'original'}
function safeIntensity(v){v=String(v||'forte').toLowerCase();return ['leve','forte','muito'].includes(v)?v:'forte'}
function safeGoal(v){v=String(v||'venda').toLowerCase();return ['venda','retencao','comentario','clique'].includes(v)?v:'venda'}
function safeDuration(v){v=Number(v||20);return [15,20,30].includes(v)?v:20}

async function applyPreset(input,out,preset){
  const vf=PRESETS[preset]; if(!vf){fs.renameSync(input,out);return;}
  await run(['-y','-hide_banner','-loglevel','error','-i',input,'-map','0:v:0?','-map','0:a:0?','-vf',vf,'-c:v','libx264','-preset','ultrafast','-crf','22','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ar','44100','-ac','2','-movflags','+faststart',out]);
  cleanFile(input);
}

function buildStrategy(preset,durs,intensity,goal,duration){
  const speed={leve:1.03,forte:1.12,muito:1.20}[intensity]||1.12;
  const target=duration||20;
  const body=target>=30?4.2:target>=20?3.2:2.4;
  const k=(i,f,d,sp=1,z=1)=>({i,startFrac:f,reqDur:d,speed:sp,zoom:z});
  // Intercala Corpo/Gancho/Corpo/CTA e volta ao Corpo. Isso evita o antigo A+B+C.
  const plans={
    produto:[k(1,.05,1.2,speed,1.12),k(0,0,2.1,1.05,1.0),k(1,.30,body,1.08,1.07),k(2,0,1.0,speed,1.10),k(1,.68,1.7,speed,1.14),k(2,.18,2.2,1.0,1.0)],
    problema:[k(0,0,1.7,speed,1.08),k(1,.55,1.2,1.15,1.14),k(0,.35,1.1,1.10,1.0),k(1,.12,body,1.06,1.07),k(2,0,1.0,1.12,1.1),k(1,.72,1.5,speed,1.13),k(2,.20,2.0,1,1)],
    ugc:[k(0,0,2.2,1,1),k(1,.10,2.2,1.03,1.05),k(0,.55,1.0,1.08,1.1),k(1,.42,body,1.0,1),k(2,0,1.0,1.08,1.08),k(1,.74,1.4,1.08,1.12),k(2,.18,2.0,1,1)],
    pov:[k(1,.02,1.1,1.18,1.16),k(0,0,1.8,1.08,1),k(1,.22,1.5,1.15,1.12),k(1,.50,body,1.06,1.05),k(2,0,1.0,1.15,1.12),k(1,.78,1.2,1.18,1.16),k(2,.20,2.0,1,1)],
    oferta:[k(2,0,.9,1.18,1.14),k(1,.08,1.1,1.16,1.12),k(0,0,1.8,1.10,1),k(1,.30,body,1.07,1.06),k(2,.18,1.0,1.14,1.12),k(1,.72,1.3,1.16,1.15),k(2,.36,1.8,1,1)],
    curiosidade:[k(1,.62,1.0,1.20,1.16),k(0,0,2.0,1.04,1),k(1,.05,1.3,1.14,1.10),k(0,.48,.9,1.12,1.08),k(1,.34,body,1.06,1.05),k(2,0,1.0,1.12,1.1),k(1,.80,1.1,1.18,1.15),k(2,.22,1.8,1,1)]
  };
  let base=plans[preset]||plans.produto;
  if(goal==='retencao') base=[base[0],base[2],base[1],...base.slice(3)];
  return base.map(seg=>{const clipDur=durs[seg.i]||6;const start=Math.max(0,Math.min(Math.max(clipDur-.6,0),clipDur*seg.startFrac));const maxDur=Math.max(.65,clipDur-start-.05);return {clipIndex:seg.i,start,dur:Math.min(seg.reqDur,maxDur),speed:seg.speed,zoom:seg.zoom};});
}
async function makeSnippet(input,start,dur,speed,zoom=1){
  const out=path.join(TMP,'snippet-'+crypto.randomUUID()+'.mp4');
  const pts=(1/Math.max(speed||1,0.5)).toFixed(4)+'*PTS';
  const atempo=Math.min(2,Math.max(0.5,speed||1)).toFixed(4);
  const z=Math.max(1,Math.min(1.18,Number(zoom)||1)); const sw=Math.round(1080*z), sh=Math.round(1920*z);
  const vf=`scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=1080:1920:(iw-1080)/2:(ih-1920)/2,setsar=1,fps=30,setpts=${pts}`;
  await run(['-y','-hide_banner','-loglevel','error','-ss',String(Math.max(0,start||0)),'-t',String(Math.max(0.6,dur||1.2)),'-i',input,'-map','0:v:0?','-map','0:a:0?','-vf',vf,'-af',`atempo=${atempo}`,'-c:v','libx264','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ar','44100','-ac','2','-movflags','+faststart',out]);
  return out;
}

async function processOriginal(job,out){
  const raws=job.clips.map(rawPath);
  const base=path.join(TMP,'base-'+job.id+'.mp4'); cleanFile(base);
  try{await concatCopy(raws,base)}catch(_){job.progress=45;const norms=await Promise.all(job.clips.map(ensureNormalized));job.progress=70;await concatCopy(norms,base)}
  job.progress=82; await applyPreset(base,out,'original');
}

async function processRemix(job,out){
  const inputs=await Promise.all(job.clips.map(ensureNormalized));
  job.progress=35;
  const durs=[]; for(const f of inputs){durs.push(await probeDuration(f));}
  const plan=((job.mode==='director'||job.mode==='multiplier')&&Array.isArray(job.directorPlan)&&job.directorPlan.length)?job.directorPlan.map(seg=>{const clipDur=durs[0]||6;const start=Math.max(0,Math.min(Number(seg.start)||0,Math.max(0,clipDur-.6)));return {clipIndex:0,start,dur:Math.max(.65,Math.min(Number(seg.dur)||1.5,clipDur-start)),speed:Math.max(.75,Math.min(1.35,Number(seg.speed)||1)),zoom:Math.max(1,Math.min(1.18,Number(seg.zoom)||1))}}):buildStrategy(job.preset,durs,job.intensity,job.goal,job.duration);
  // Diretor IA nunca deve virar um vídeo curto: completa o plano até a duração-alvo.
  if((job.mode==='director'||job.mode==='multiplier') && plan.length){const target=Math.max(5,Number(job.duration)||20);let total=plan.reduce((a,x)=>a+(x.dur/x.speed),0),k=0;const seed=plan.slice();while(total<target-.35 && k<40){const src=seed[k%seed.length];const remain=target-total;const dur=Math.max(.8,Math.min(src.dur,remain*src.speed));const extra={...src,dur,zoom:Math.min(1.16,src.zoom+(k%2?0.015:0))};plan.push(extra);total+=extra.dur/extra.speed;k++;}}
  const parts=[];
  try{
    let idx=0;
    for(const seg of plan){ idx++; job.progress=35+Math.round((idx/plan.length)*35); parts.push(await makeSnippet(inputs[seg.clipIndex],seg.start,seg.dur,seg.speed,seg.zoom)); }
    const base=path.join(TMP,'base-'+job.id+'.mp4'); cleanFile(base);
    await concatCopy(parts,base);
    job.progress=82; await applyPreset(base,out,job.preset);
  } finally { parts.forEach(cleanFile); }
}


async function synthesizeNarration(text,wav){
  const txt=path.join(TMP,'speech-'+crypto.randomUUID()+'.txt');
  fs.writeFileSync(txt,String(text||''),'utf8');
  const ps=`Add-Type -AssemblyName System.Speech; $t=[IO.File]::ReadAllText('${txt.replaceAll("'","''")}',[Text.Encoding]::UTF8); $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $v=$s.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Culture.Name -like 'pt-*' } | Select-Object -First 1; if($v){$s.SelectVoice($v.VoiceInfo.Name)}; $s.Rate=1; $s.SetOutputToWaveFile('${wav.replaceAll("'","''")}'); $s.Speak($t); $s.Dispose();`;
  try{await runOut('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-Command',ps]);}finally{cleanFile(txt)}
}
async function addNarration(video,out,text,targetDuration){
  const wav=path.join(TMP,'voice-'+crypto.randomUUID()+'.wav');
  try{
    await synthesizeNarration(text,wav);
    const vd=Math.max(1,Number(targetDuration)||await probeDuration(video));
    const ad=Math.max(.2,await probeDuration(wav));
    // Ajusta a velocidade da fala para caber no vídeo, sem cortar o MP4 quando o áudio terminar.
    let ratio=ad/vd; ratio=Math.max(.72,Math.min(1.35,ratio));
    const af=Math.abs(ratio-1)<.03?'apad':`atempo=${ratio.toFixed(4)},apad`;
    await run(['-y','-hide_banner','-loglevel','error','-i',video,'-i',wav,'-map','0:v:0','-map','1:a:0','-c:v','copy','-af',af,'-c:a','aac','-b:a','160k','-t',vd.toFixed(3),'-movflags','+faststart',out]);
  } finally {cleanFile(wav)}
}
async function processJob(job){
  job.status='working';job.startedAt=Date.now();job.progress=20;
  try{
    const out=outPath(job.id);cleanFile(out);
    const narrated=job.narration?path.join(TMP,'visual-'+job.id+'.mp4'):out; cleanFile(narrated);
    if(job.mode==='original' || job.preset==='original') await processOriginal(job,narrated);
    else if(job.mode==='multiplier'){
      const visual=path.join(TMP,'mult-'+job.id+'.mp4'); cleanFile(visual);
      await processRemix(job,visual);
      const src=fs.existsSync(rawPath(job.clips[0]))?rawPath(job.clips[0]):normPath(job.clips[0]);
      const dur=Math.max(1,Number(job.duration)||await probeDuration(src));
      await run(['-y','-hide_banner','-loglevel','error','-i',visual,'-i',src,'-map','0:v:0','-map','1:a:0?','-c:v','copy','-c:a','aac','-b:a','160k','-t',dur.toFixed(3),'-movflags','+faststart',narrated]);
      cleanFile(visual);
    } else await processRemix(job,narrated);
    if(job.narration){job.progress=92;await addNarration(narrated,out,job.narration,job.duration);cleanFile(narrated)}
    if(!fs.existsSync(out)||fs.statSync(out).size<1024)throw new Error('Arquivo final vazio.');
    job.status='ready';job.progress=100;job.finishedAt=Date.now();job.size=fs.statSync(out).size;
  }catch(e){job.status='error';job.progress=100;job.error=String(e.message||e).slice(-2500);job.finishedAt=Date.now()}
}
function pump(){while(active<MAX_CONCURRENCY&&queue.length){const id=queue.shift(),job=jobs.get(id);if(!job||job.status!=='queued')continue;active++;processJob(job).finally(()=>{active--;pump()})}}



function extractFiveScripts(raw){
  let t=String(raw||'').trim();
  try{const a=JSON.parse(t.match(/\[[\s\S]*\]/)?.[0]||'');if(Array.isArray(a)&&a.length>=5)return a.slice(0,5).map(x=>String(x).replace(/\s+/g,' ').trim()).filter(Boolean)}catch(_){}
  return t.split(/\n+/).map(x=>x.replace(/^\s*(?:[-*]|\d+[.)]|VERS[AÃ]O\s*\d+[:.-]?)\s*/i,'').trim()).filter(x=>x.length>45).slice(0,5);
}
app.post('/director/analyze',async(req,res)=>{
 try{
  const id=safeId(req.body?.asset);if(!id||(!fs.existsSync(rawPath(id))&&!fs.existsSync(normPath(id))))return res.status(409).json({error:'Vídeo não encontrado no Motor PC.'});
  const source=fs.existsSync(rawPath(id))?rawPath(id):normPath(id);const duration=await probeDuration(source);
  let transcript='';try{transcript=await runOut('python',[path.join(__dirname,'transcribe.py'),source])}catch(e){return res.status(503).json({error:'Para o Diretor IA, execute INSTALAR-IA-LOCAL.bat uma vez.',detail:String(e.message||e).slice(-700)})}
  const product=String(req.body?.product||'produto').slice(0,160),facts=String(req.body?.facts||'').slice(0,700);
  const prompt=`Você é um diretor de criativos para TikTok Shop Brasil. Analise a transcrição de um vídeo de ${duration.toFixed(1)} segundos e devolva SOMENTE JSON válido, sem markdown. Produto: ${product}. Fatos confirmados: ${facts||'nenhum adicional'}. Transcrição: ${transcript||'sem fala detectada'}. Crie exatamente 5 versões. Formato: {"diagnosis":"diagnóstico curto e concreto","versions":[5 objetos]}. Cada objeto deve ter: {"name":"nome do ângulo","preset":"produto|ugc|problema|curiosidade|oferta","hook":"GANCHO","body":"CORPO","cta":"CTA","plan":[10 a 16 segmentos]}. REGRAS DE TEXTO: cada bloco hook/body/cta deve ter entre 90 e 180 caracteres, nunca passar de 180; a fala completa deve ocupar praticamente os ${duration.toFixed(1)} segundos; o GANCHO começa com uma frase curtíssima e muito chamativa que possa ser dita nos primeiros 2 segundos; depois o gancho pode continuar. CORPO demonstra o produto e benefícios confirmados. CTA termina convidando a conferir o produto/carrinho, sem inventar urgência, preço, desconto ou estoque. As 5 versões devem ser realmente diferentes: 1 Produto Campeão, 2 UGC Natural, 3 Problema-Solução, 4 Curiosidade/Desejo, 5 Venda Direta. REGRAS DE EDIÇÃO: cada plan deve cobrir aproximadamente ${duration.toFixed(1)} segundos no total, usando 10 a 16 segmentos de 0.8 a 3.2s; use ordens e momentos diferentes do original, sem reduzir o vídeo a um short. Segmento: {"start":segundos no original,"dur":0.8 a 3.2,"speed":0.90 a 1.20,"zoom":1.00 a 1.16}. Não invente fatos do produto.`;
  let raw='';try{raw=await runInput('ollama',['run','qwen2.5:3b'],prompt)}catch(e){return res.status(503).json({error:'Ollama/modelo local não está pronto. Execute INSTALAR-IA-LOCAL.bat.',detail:String(e.message||e).slice(-700)})}
  let data;try{data=JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0]||'')}catch(_){return res.status(500).json({error:'O Diretor IA não devolveu um plano válido. Tente novamente.',raw:raw.slice(0,1200)})}
  if(!Array.isArray(data.versions)||data.versions.length<5)return res.status(500).json({error:'O Diretor IA não criou as 5 versões completas. Tente novamente.'});
  const cleanBlock=(x)=>String(x||'').replace(/[\u0000-\u001F]/g,' ').replace(/\s+/g,' ').trim().slice(0,180);
  const versions=data.versions.slice(0,5).map((v,i)=>{const hook=cleanBlock(v.hook),body=cleanBlock(v.body),cta=cleanBlock(v.cta);return {name:String(v.name||('Versão '+(i+1))).slice(0,80),preset:safePreset(v.preset||['produto','ugc','problema','curiosidade','oferta'][i]),hook,body,cta,script:[hook,body,cta].filter(Boolean).join(' '),plan:(Array.isArray(v.plan)?v.plan:[]).slice(0,16).map(x=>({start:Math.max(0,Math.min(duration-.2,Number(x.start)||0)),dur:Math.max(.8,Math.min(3.2,Number(x.dur)||1.5)),speed:Math.max(.9,Math.min(1.2,Number(x.speed)||1)),zoom:Math.max(1,Math.min(1.16,Number(x.zoom)||1))}))}});
  res.json({ok:true,duration,transcript,diagnosis:String(data.diagnosis||'').slice(0,1200),versions});
 }catch(e){res.status(500).json({error:'Falha no Diretor IA.',detail:String(e.message||e).slice(-1000)})}
});

app.post('/ai/analyze',async(req,res)=>{
 try{
  const id=safeId(req.body?.asset);if(!id||(!fs.existsSync(rawPath(id))&&!fs.existsSync(normPath(id))))return res.status(409).json({error:'Vídeo não encontrado no Motor PC.'});
  const source=fs.existsSync(rawPath(id))?rawPath(id):normPath(id);
  let transcript='';
  try{transcript=await runOut('python',[path.join(__dirname,'transcribe.py'),source])}catch(e){return res.status(503).json({error:'Transcrição local ainda não está instalada. Execute INSTALAR-IA-LOCAL.bat no Motor PC.',detail:String(e.message||e).slice(-700)})}
  const product=String(req.body?.product||'produto').slice(0,160),facts=String(req.body?.facts||'').slice(0,600);
  const prompt=`Você é roteirista de vídeos curtos para TikTok Shop Brasil. Crie exatamente 5 roteiros NOVOS em português brasileiro, naturais e faláveis, cada um com cerca de 220 a 360 caracteres e estrutura gancho forte + demonstração/benefício + CTA para conferir o carrinho. Cada versão deve ter ângulo realmente diferente: 1 Produto Campeão, 2 UGC natural, 3 Problema-Solução, 4 Curiosidade, 5 Oferta/CTA. Não invente preço, desconto, estoque, material, função ou benefício que não esteja nos dados. Não prometa viralização ou resultado. Produto informado: ${product}. Fatos confirmados: ${facts||'nenhum adicional'}. Transcrição do vídeo original: ${transcript||'sem fala detectada'}. Responda SOMENTE com um array JSON de 5 strings, sem markdown.`;
  let raw='';try{raw=await runInput('ollama',['run','qwen2.5:3b'],prompt)}catch(e){return res.status(503).json({error:'Ollama/modelo local não está pronto. Execute INSTALAR-IA-LOCAL.bat.',detail:String(e.message||e).slice(-700)})}
  let scripts=extractFiveScripts(raw);
  if(scripts.length<5)return res.status(500).json({error:'A IA local não devolveu 5 roteiros válidos. Tente novamente.',transcript,raw:raw.slice(0,1000)});
  res.json({ok:true,transcript,scripts});
 }catch(e){res.status(500).json({error:'Falha ao analisar vídeo.',detail:String(e.message||e).slice(-1000)})}
});

app.post('/jobs',(req,res)=>{
  const signature=String(req.body?.signature||'').slice(0,180);
  if(signature&&signatures.has(signature)){const old=jobs.get(signatures.get(signature));if(old)return res.status(200).json({ok:true,id:old.id,status:old.status,deduplicated:true});signatures.delete(signature)}
  const clips=(req.body&&req.body.clips)||[];
  if(!Array.isArray(clips)||clips.length!==3)return res.status(400).json({error:'Envie 3 IDs de clips.'});
  const ids=clips.map(safeId); if(ids.some(x=>!x))return res.status(400).json({error:'ID de clip inválido.'});
  if(ids.some(id=>!fs.existsSync(rawPath(id))&&!fs.existsSync(normPath(id))))return res.status(409).json({error:'Asset ausente. Reenvie os trechos.'});
  const id=crypto.randomUUID();
  const job={
    id,clips:ids,label:String(req.body.label||''),preset:safePreset(req.body.preset),mode:safeMode(req.body.mode),
    intensity:safeIntensity(req.body.intensity),duration:safeDuration(req.body.duration),goal:safeGoal(req.body.goal),narration:String(req.body.narration||'').slice(0,1200).trim(),directorPlan:Array.isArray(req.body.directorPlan)?req.body.directorPlan.slice(0,12):null,
    status:'queued',progress:0,createdAt:Date.now()
  };
  jobs.set(id,job); if(signature)signatures.set(signature,id); queue.push(id); pump(); res.status(202).json({ok:true,id,status:'queued'});
});
app.post('/jobs/status',(req,res)=>{const ids=Array.isArray(req.body?.ids)?req.body.ids.slice(0,100):[];res.json({ok:true,jobs:ids.map(id=>{const j=jobs.get(String(id));return j?{id:j.id,status:j.status,progress:j.progress,preset:j.preset,mode:j.mode,error:j.error||null,size:j.size||0}: {id:String(id),status:'missing',progress:100,error:'Job não encontrado'}})})});
app.get('/jobs/:id',(req,res)=>{const j=jobs.get(String(req.params.id));if(!j)return res.status(404).json({error:'Job não encontrado'});res.json({ok:true,id:j.id,status:j.status,progress:j.progress,error:j.error||null,size:j.size||0})});
app.get('/jobs/:id/file',(req,res)=>{const j=jobs.get(String(req.params.id)),p=outPath(String(req.params.id));if(!j||j.status!=='ready'||!fs.existsSync(p))return res.status(404).json({error:'Vídeo ainda não está pronto'});res.set({'Cache-Control':'no-store','Content-Disposition':`attachment; filename="viral-studio-${j.id}.mp4"`});res.sendFile(p)});

setInterval(()=>{const cutoff=Date.now()-8*60*60*1000;for(const [id,j] of jobs){if((j.finishedAt||j.createdAt)<cutoff&&['ready','error'].includes(j.status)){jobs.delete(id);cleanFile(outPath(id))}}},30*60*1000).unref?.();
const PORT=Number(process.env.PORT||10000);
const server=app.listen(PORT,'0.0.0.0',()=>console.log(`Viral Studio Motor Cloud V6.2 pronto na porta ${PORT} — Gancho + Corpo + CTA — fila até 100 — ${MAX_CONCURRENCY} renderizações paralelas`));
server.requestTimeout=30*60*1000;server.headersTimeout=31*60*1000;server.keepAliveTimeout=65000;
