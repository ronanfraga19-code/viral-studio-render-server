const express=require('express'),multer=require('multer'),cors=require('cors');
const {spawn}=require('child_process');
const fs=require('fs'),os=require('os'),path=require('path'),crypto=require('crypto');

const app=express();app.disable('x-powered-by');
app.use(cors({origin:true,methods:['GET','POST','OPTIONS'],allowedHeaders:['Content-Type','Accept'],exposedHeaders:['Content-Disposition','Content-Length'],maxAge:86400}));
app.options('*',cors());app.use(express.json({limit:'6mb'}));

const ROOT=path.join(__dirname,'vs-data'),RAW=path.join(ROOT,'assets','raw'),NORM=path.join(ROOT,'assets','norm'),OUT=path.join(ROOT,'jobs'),TMP=path.join(ROOT,'tmp');
for(const d of [RAW,NORM,OUT,TMP])fs.mkdirSync(d,{recursive:true});
const upload=multer({dest:TMP,limits:{fileSize:2*1024*1024*1024,files:1}});
const jobs=new Map(), queue=[];let active=0;
const signatures=new Map();
const CPU_COUNT=Math.max(1,(os.cpus()||[]).length);
const AUTO_CONCURRENCY=CPU_COUNT>=8?2:1;
const MAX_CONCURRENCY=Math.max(1,Math.min(Number(process.env.VS_CONCURRENCY)||1,2));
const normLocks=new Map();

function safeId(v){v=String(v||'').toLowerCase().replace(/[^a-z0-9_-]/g,'');return v.length>=8&&v.length<=128?v:null}
function rawPath(id){return path.join(RAW,id+'.bin')}
function normPath(id){return path.join(NORM,id+'.mp4')}
function outPath(id){return path.join(OUT,id+'.mp4')}
function cleanFile(p){try{fs.rmSync(p,{force:true})}catch{}}
function dirFiles(dir){try{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?dirFiles(p):[p]})}catch(_){return []}}
function fileAgeMs(p){try{return Date.now()-fs.statSync(p).mtimeMs}catch(_){return Infinity}}
function cleanDirOlderThan(dir,ageMs,keep=new Set()){
  let freed=0;
  for(const p of dirFiles(dir)){
    if(keep.has(p)||fileAgeMs(p)<ageMs)continue;
    try{const s=fs.statSync(p).size;fs.rmSync(p,{force:true});freed+=s}catch(_){ }
  }
  return freed;
}
function activeAssetPaths(){
  const keep=new Set();
  for(const j of jobs.values()) if(['queued','working'].includes(j.status)) for(const id of (j.clips||[])){keep.add(rawPath(id));keep.add(normPath(id));}
  return keep;
}
function diskInfo(){
  try{if(typeof fs.statfsSync==='function'){const s=fs.statfsSync(ROOT);const free=Number(s.bavail||s.bfree||0)*Number(s.bsize||s.frsize||4096);const total=Number(s.blocks||0)*Number(s.bsize||s.frsize||4096);return {free,total}}}catch(_){ }
  return {free:null,total:null};
}
function storageSummary(){
  const d=diskInfo(),mb=x=>x==null?null:Math.round(x/1024/1024);
  return {freeMB:mb(d.free),totalMB:mb(d.total),tmpMB:Math.round(dirFiles(TMP).reduce((a,p)=>{try{return a+fs.statSync(p).size}catch(_){return a}},0)/1024/1024),jobsMB:Math.round(dirFiles(OUT).reduce((a,p)=>{try{return a+fs.statSync(p).size}catch(_){return a}},0)/1024/1024)};
}
function cleanupStorage(aggressive=false){
  const keep=activeAssetPaths(); let freed=0;
  freed+=cleanDirOlderThan(TMP,aggressive?5*60*1000:25*60*1000);
  freed+=cleanDirOlderThan(OUT,aggressive?45*60*1000:2*60*60*1000);
  freed+=cleanDirOlderThan(RAW,aggressive?2*60*60*1000:6*60*60*1000,keep);
  freed+=cleanDirOlderThan(NORM,aggressive?2*60*60*1000:6*60*60*1000,keep);
  return freed;
}
function ensureStorage(minFreeMB=700){
  cleanupStorage(false); let d=diskInfo();
  if(d.free!=null&&d.free<minFreeMB*1024*1024){
app.get('/queue/state',(_req,res)=>res.json({ok:true,active,queued:queue.length,items:queue.slice(0,20)}));
app.post('/queue/kick',(_req,res)=>{pump();res.json({ok:true,active,queued:queue.length})});

cleanupStorage(true);d=diskInfo();}
  if(d.free!=null&&d.free<350*1024*1024){const mb=Math.max(0,Math.round(d.free/1024/1024));throw new Error(`Espaço insuficiente no Motor (${mb} MB livres). A limpeza automática já foi executada. Libere espaço no disco ou use o Motor Cloud.`)}
}
function run(args,timeoutMs=240000){return new Promise((ok,no)=>{const p=spawn('ffmpeg',args,{stdio:['ignore','ignore','pipe'],windowsHide:true});let e='',done=false;const t=setTimeout(()=>{if(done)return;done=true;try{p.kill('SIGKILL')}catch(_){};no(new Error('FFmpeg excedeu o tempo limite e foi reiniciado automaticamente.'))},timeoutMs);p.stderr.on('data',d=>{e=(e+d).slice(-16000)});p.on('error',err=>{if(done)return;done=true;clearTimeout(t);no(err)});p.on('close',c=>{if(done)return;done=true;clearTimeout(t);c===0?ok():no(new Error(e||('ffmpeg '+c)))})})}
function runOut(bin,args,timeoutMs=120000){return new Promise((ok,no)=>{const p=spawn(bin,args,{stdio:['ignore','pipe','pipe'],windowsHide:true});let out='',err='',done=false;const t=setTimeout(()=>{if(done)return;done=true;try{p.kill('SIGKILL')}catch(_){};no(new Error(bin+' excedeu o tempo limite.'))},timeoutMs);p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',e=>{if(done)return;done=true;clearTimeout(t);no(e)});p.on('close',c=>{if(done)return;done=true;clearTimeout(t);c===0?ok(out.trim()):no(new Error(err||out||bin+' '+c))})})}
function runInput(bin,args,input){return new Promise((ok,no)=>{const p=spawn(bin,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});let out='',err='';p.stdout.on('data',d=>out+=d);p.stderr.on('data',d=>err+=d);p.on('error',no);p.on('close',c=>c===0?ok(out.trim()):no(new Error(err||out||bin+' '+c)));p.stdin.end(input)})}
const wait=ms=>new Promise(r=>setTimeout(r,ms));

app.get('/',(_q,r)=>r.json({ok:true,service:'Viral Studio Motor Cloud',version:'9.3',maxBatch:20,concurrency:MAX_CONCURRENCY,mode:'cloud-render'}));
app.get('/health',(_q,r)=>r.json({ok:true,service:'Viral Studio Motor Cloud',engine:'cloud',version:'9.3',mode:'cloud-render',maxBatch:20,concurrency:MAX_CONCURRENCY,active,queued:queue.length,storage:storageSummary(),capabilities:{linkMp4:true,linkInfo:true,linkAnalyze:true,batchZip:false,autoCleanup:true,mobile720p:true,uploadMp4:true,aiReal:true,newVideoFromReference:true,originalFramesReused:false}}));
app.get('/storage',(_q,r)=>r.json({ok:true,...storageSummary()}));
app.post('/storage/cleanup',(_q,r)=>{const freed=
app.get('/queue/state',(_req,res)=>res.json({ok:true,active,queued:queue.length,items:queue.slice(0,20)}));
app.post('/queue/kick',(_req,res)=>{pump();res.json({ok:true,active,queued:queue.length})});

cleanupStorage(true);r.json({ok:true,freedMB:Math.round(freed/1024/1024),...storageSummary()})});
function isTikTokUrl(v){
  try{const u=new URL(String(v||'').trim());return (u.protocol==='https:'||u.protocol==='http:')&&/(^|\.)tiktok\.com$/i.test(u.hostname)}catch(_){return false}
}
async function resolveTikTokUrl(raw){
  let current=String(raw||'').trim();
  if(!isTikTokUrl(current))throw new Error('Link do TikTok inválido');
  for(let i=0;i<6;i++){
    let r;
    try{r=await fetch(current,{method:'GET',redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 TikTokLinkResolver/1.0','Accept':'text/html,application/xhtml+xml'}})}catch(_){break}
    const loc=r.headers.get('location');
    try{r.body?.cancel?.()}catch(_){ }
    if(!loc)break;
    try{current=new URL(loc,current).toString()}catch(_){break}
    if(!isTikTokUrl(current))break;
  }
  return current;
}


app.post('/tiktok/link-info',async(req,res)=>{
  try{
    const original=String(req.body?.url||'').trim();
    if(!isTikTokUrl(original))return res.status(400).json({error:'Link do TikTok inválido'});
    const u=await resolveTikTokUrl(original);
    const endpoint='https://www.tiktok.com/oembed?url='+encodeURIComponent(u);
    const r=await fetch(endpoint,{headers:{'User-Agent':'ViralStudio/6.5'}});
    if(!r.ok)return res.status(502).json({error:'TikTok não retornou os dados públicos desse vídeo'});
    const j=await r.json();
    res.json({ok:true,url:original,resolved_url:u,title:j.title||'',author_name:j.author_name||'',author_url:j.author_url||'',thumbnail_url:j.thumbnail_url||'',html:j.html||'',provider_name:j.provider_name||'TikTok'});
  }catch(e){res.status(500).json({error:'Falha ao consultar o link',detail:e.message})}
});


app.post('/tiktok/link-source',async(req,res)=>{
  let img='';
  try{
    const original=String(req.body?.url||'').trim();
    if(!isTikTokUrl(original))return res.status(400).json({error:'Link do TikTok inválido'});
    const duration=Math.max(8,Math.min(30,Number(req.body?.duration)||20));
    ensureStorage(500);
    const u=await resolveTikTokUrl(original);
    const endpoint='https://www.tiktok.com/oembed?url='+encodeURIComponent(u);
    const rr=await fetch(endpoint,{redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 ViralStudio/7.1','Accept':'application/json'}});
    if(!rr.ok)return res.status(502).json({error:'TikTok não retornou a referência pública desse vídeo'});
    const ref=await rr.json();
    const thumb=String(ref.thumbnail_url||'').trim();
    if(!thumb)return res.status(422).json({error:'Esse vídeo não forneceu uma imagem pública para criar o vídeo-base.'});

    const ir=await fetch(thumb,{redirect:'follow',headers:{
      'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36',
      'Referer':'https://www.tiktok.com/',
      'Accept':'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
    }});
    if(!ir.ok)return res.status(502).json({error:'Não consegui carregar a imagem pública do vídeo de referência.',detail:'HTTP '+ir.status});
    const contentType=String(ir.headers.get('content-type')||'').toLowerCase();
    const buf=Buffer.from(await ir.arrayBuffer());
    if(buf.length<512)return res.status(422).json({error:'A referência visual retornada pelo TikTok está vazia.'});
    if(contentType && !contentType.includes('image/'))return res.status(422).json({error:'O TikTok não retornou uma imagem válida para esse link.',detail:contentType});

    const id=('link-'+crypto.randomUUID()).toLowerCase();
    const ext=contentType.includes('webp')?'.webp':contentType.includes('png')?'.png':contentType.includes('avif')?'.avif':'.jpg';
    img=path.join(TMP,id+ext);
    const out=normPath(id);
    fs.writeFileSync(img,buf);

    // 1) movimento mais rico; 2) movimento simples; 3) base estática.
    const frames=Math.max(1,Math.round(duration*30));
    const attempts=[
      // Render Free / iPhone: caminho leve primeiro para reduzir memória e evitar queda do serviço.
      ['-y','-hide_banner','-loglevel','error','-loop','1','-i',img,'-t',String(duration),'-vf','scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=24,format=yuv420p','-an','-c:v','libx264','-preset','ultrafast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',out],
      ['-y','-hide_banner','-loglevel','error','-loop','1','-i',img,'-t',String(duration),'-vf','scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=20,format=yuv420p','-an','-c:v','libx264','-preset','ultrafast','-crf','26','-pix_fmt','yuv420p','-movflags','+faststart',out],
      ['-y','-hide_banner','-loglevel','error','-loop','1','-i',img,'-t',String(duration),'-vf',`scale=800:1422:force_original_aspect_ratio=increase,crop=720:1280:(iw-720)/2:(ih-1280)/2,zoompan=z=min(zoom+0.0006\,1.06):x=iw/2-(iw/zoom/2):y=ih/2-(ih/zoom/2):d=${Math.max(1,Math.round(duration*24))}:s=720x1280:fps=24,format=yuv420p`,'-an','-c:v','libx264','-preset','ultrafast','-crf','25','-pix_fmt','yuv420p','-movflags','+faststart',out]
    ];
    let lastErr=null, used=0;
    for(let i=0;i<attempts.length;i++){
      try{ cleanFile(out); await run(attempts[i]); used=i+1; lastErr=null; break; }
      catch(e){ lastErr=e; cleanFile(out); }
    }
    if(lastErr || !fs.existsSync(out) || fs.statSync(out).size<1024){
      return res.status(500).json({error:'Não consegui criar o vídeo-base desse link.',detail:String(lastErr?.message||'FFmpeg não gerou arquivo').slice(-1600)});
    }
    res.json({ok:true,asset:id,duration,render_mode:used,reference:{url:original,resolved_url:u,title:ref.title||'',author_name:ref.author_name||'',author_url:ref.author_url||'',thumbnail_url:thumb}});
  }catch(e){res.status(500).json({error:'Falha ao criar vídeo-base pelo link',detail:String(e.message||e).slice(-1600)})}
  finally{ if(img) cleanFile(img); }
});

app.post('/tiktok/link-analyze',async(req,res)=>{
  try{
    const original=String(req.body?.url||'').trim();
    if(!isTikTokUrl(original))return res.status(400).json({error:'Link do TikTok inválido'});
    const u=await resolveTikTokUrl(original);
    const endpoint='https://www.tiktok.com/oembed?url='+encodeURIComponent(u);
    const rr=await fetch(endpoint,{headers:{'User-Agent':'Mozilla/5.0 ViralStudioCloud/8.5'}});
    if(!rr.ok)return res.status(502).json({error:'TikTok não retornou os dados públicos desse vídeo'});
    const ref=await rr.json();
    const product=String(req.body?.product||'').trim().slice(0,160);
    const facts=String(req.body?.facts||'').trim().slice(0,700);
    const subject=product || String(ref.title||'produto').replace(/[#@]/g,' ').replace(/\s+/g,' ').trim().slice(0,80) || 'produto';
    const factLine=facts ? ` Destaque somente estes fatos confirmados: ${facts}.` : ' Mostre apenas características visíveis ou confirmadas.';
    const hooks=[
      `Olha esse detalhe de ${subject} antes de decidir.`,
      `Eu reparei numa coisa nesse ${subject} que vale mostrar.`,
      `Se você está olhando ${subject}, presta atenção nisso.`,
      `O que mais chama atenção nesse ${subject} é isso aqui.`,
      `Antes de escolher ${subject}, olha como ele aparece em uso.`
    ];
    const bodies=[
      `Mostre o produto de perto e depois em uso.${factLine}`,
      `Comece com close, mude o ângulo e demonstre o principal benefício real.${factLine}`,
      `Use POV e uma demonstração curta para mostrar acabamento, formato e uso.${factLine}`,
      `Mostre primeiro o detalhe, depois uma visão completa e uma situação real de uso.${factLine}`,
      `Faça uma demonstração dinâmica com close, plano aberto e movimento natural.${factLine}`
    ];
    const ctas=[
      'Se fez sentido para você, confira os detalhes no carrinho.',
      'Veja as informações e a oferta disponível no carrinho.',
      'Confira as opções disponíveis e os detalhes do produto no carrinho.',
      'Se você gostou, abra o carrinho e veja os detalhes antes de comprar.',
      'Quer ver mais informações? Confira o produto no carrinho.'
    ];
    const presets=['produto','ugc','problema','curiosidade','oferta'];
    const versions=hooks.map((hook,i)=>({name:`Versão ${i+1}`,preset:presets[i],hook:hook.slice(0,180),body:bodies[i].slice(0,180),cta:ctas[i].slice(0,180),script:`${hook} ${bodies[i]} ${ctas[i]}`}));
    res.json({ok:true,reference:{url:original,resolved_url:u,title:ref.title||'',author_name:ref.author_name||'',author_url:ref.author_url||'',thumbnail_url:ref.thumbnail_url||''},diagnosis:`Referência pública reconhecida${ref.author_name?` do creator ${ref.author_name}`:''}. O Cloud criou novas estruturas de Gancho + Corpo + CTA sem copiar o conteúdo original.`,versions});
  }catch(e){res.status(500).json({error:'Falha ao analisar o link',detail:String(e.message||e).slice(-1000)})}
});

app.post('/batch/zip',(_req,res)=>res.status(501).json({error:'ZIP em nuvem ainda não ativado nesta versão. Baixe os vídeos individualmente.'}));
app.get('/batch/:name.zip',(_req,res)=>res.status(404).json({error:'ZIP não disponível nesta versão'}));

app.get('/assets/:id',(req,res)=>{const id=safeId(req.params.id);if(!id)return res.status(400).json({ok:false});res.json({ok:true,exists:fs.existsSync(rawPath(id))||fs.existsSync(normPath(id)),normalized:fs.existsSync(normPath(id))})});
app.post('/assets',upload.single('clip'),(req,res)=>{const id=safeId(req.body.id);if(!id||!req.file){if(req.file)cleanFile(req.file.path);return res.status(400).json({error:'ID ou arquivo inválido'})}
 const dest=rawPath(id);try{if(fs.existsSync(dest))cleanFile(req.file.path);else fs.renameSync(req.file.path,dest);res.json({ok:true,id,cached:true})}catch(e){cleanFile(req.file.path);res.status(500).json({error:'Falha ao guardar arquivo',detail:e.message})}});

async function mediaInfo(file){
  try{
    const raw=await runOut('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=codec_name,width,height,pix_fmt,r_frame_rate','-of','json',file]);
    const v=(JSON.parse(raw||'{}').streams||[])[0]||{};
    let ac=''; try{ac=(await runOut('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_name','-of','default=noprint_wrappers=1:nokey=1',file])).trim()}catch(_){ }
    return {vcodec:String(v.codec_name||''),acodec:ac,width:Number(v.width||0),height:Number(v.height||0),pix:String(v.pix_fmt||'')};
  }catch(_){return {vcodec:'',acodec:'',width:0,height:0,pix:''}}
}

async function ensureNormalized(id){
  const n=normPath(id);
  if(fs.existsSync(n)){
    // Link-source pode gerar MP4 visual sem áudio. O remix usa filtros de áudio,
    // então garantimos uma faixa AAC silenciosa antes de qualquer corte.
    if(await hasAudio(n)) return n;
    if(normLocks.has(id)) return normLocks.get(id);
    const repair=(async()=>{
      const tmp=n+'.audio-'+Date.now()+'.mp4';
      await run(['-y','-hide_banner','-loglevel','error','-i',n,'-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100','-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','96k','-shortest','-movflags','+faststart',tmp]);
      fs.renameSync(tmp,n); return n;
    })().finally(()=>normLocks.delete(id));
    normLocks.set(id,repair); return repair;
  }
  if(normLocks.has(id)) return normLocks.get(id);
  const p=(async()=>{
    const src=rawPath(id); if(!fs.existsSync(src)) throw new Error('Asset ausente: '+id);
    const tmp=n+'.tmp-'+Date.now()+'.mp4';
    const audio=await hasAudio(src), info=await mediaInfo(src);
    // Fast path: vídeos já compatíveis não são reencodificados. Só reorganizamos o MP4 para streaming no iPhone.
    const copyOk=info.vcodec==='h264' && (!audio || info.acodec==='aac') && info.pix==='yuv420p';
    if(copyOk){
      const a=['-y','-hide_banner','-loglevel','error','-i',src,'-map','0:v:0'];
      if(audio)a.push('-map','0:a:0');
      a.push('-c','copy','-movflags','+faststart',tmp);
      await run(a);
    }else{
      const base=['-y','-hide_banner','-loglevel','error','-i',src];
      if(!audio) base.push('-f','lavfi','-i','anullsrc=channel_layout=stereo:sample_rate=44100');
      base.push('-map','0:v:0');
      if(audio) base.push('-map','0:a:0'); else base.push('-map','1:a:0');
      base.push('-vf','scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:black,setsar=1,fps=30',
        '-c:v','libx264','-preset','veryfast','-crf','24','-pix_fmt','yuv420p','-profile:v','main','-level','4.0',
        '-c:a','aac','-b:a','128k','-ar','44100','-ac','2','-movflags','+faststart');
      if(!audio) base.push('-shortest');
      base.push(tmp); await run(base);
    }
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

async function hasAudio(file){
  try{
    const out=await runOut('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=index','-of','csv=p=0',file]);
    return !!String(out||'').trim();
  }catch(_){return false}
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
  const z=Math.max(1,Math.min(1.18,Number(zoom)||1)); const sw=Math.round(720*z), sh=Math.round(1280*z);
  const vf=`scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=720:1280:(iw-720)/2:(ih-1280)/2,setsar=1,fps=30,setpts=${pts}`;
  await run(['-y','-hide_banner','-loglevel','error','-ss',String(Math.max(0,start||0)),'-t',String(Math.max(0.6,dur||1.2)),'-i',input,'-map','0:v:0?','-map','0:a:0?','-vf',vf,'-af',`atempo=${atempo}`,'-c:v','libx264','-preset','ultrafast','-crf','25','-pix_fmt','yuv420p','-c:a','aac','-b:a','128k','-ar','44100','-ac','2','-movflags','+faststart',out]);
  return out;
}

async function processOriginal(job,out){
  // V6.0: todos os trechos passam uma única vez pelo cache H.264/AAC.
  // Depois as combinações são apenas concat copy, rápidas e compatíveis com iPhone/Safari.
  job.progress=35;
  const norms=await Promise.all(job.clips.map(ensureNormalized));
  job.progress=75;
  const base=path.join(TMP,'base-'+job.id+'.mp4'); cleanFile(base);
  await concatCopy(norms,base);
  job.progress=90;
  fs.renameSync(base,out);
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
  // Cloud: voz neural via edge-tts. Serviços gratuitos podem oscilar;
  // tentamos novamente automaticamente antes de considerar falha.
  let last=null;
  for(let attempt=1;attempt<=3;attempt++){
    try{
      cleanFile(wav);
      await runOut('python3',[path.join(__dirname,'tts.py'),String(text||''),wav]);
      if(fs.existsSync(wav)&&fs.statSync(wav).size>512)return;
      throw new Error('A voz retornou um arquivo vazio.');
    }catch(e){last=e;if(attempt<3)await wait(900*attempt);}
  }
  throw last||new Error('Falha temporária ao gerar a voz.');
}
async function addNarration(video,out,text,targetDuration){
  const wav=path.join(TMP,'voice-'+crypto.randomUUID()+'.mp3');
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
    ensureStorage(700);
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
    if(job.narration){
      job.progress=92;
      try{
        await addNarration(narrated,out,job.narration,job.duration);
        cleanFile(narrated);
      }catch(narrErr){
        // O visual já está pronto. Se a voz falhar no fechamento, não jogamos o vídeo inteiro fora.
        // Publicamos o visual compatível como fallback e registramos um aviso para diagnóstico.
        if(fs.existsSync(narrated) && fs.statSync(narrated).size>1024){
          cleanFile(out);
          fs.renameSync(narrated,out);
          job.warning='A voz neural falhou no fechamento; vídeo concluído com o áudio-base disponível.';
        }else throw narrErr;
      }
    }
    if(!fs.existsSync(out)||fs.statSync(out).size<1024)throw new Error('Arquivo final vazio.');
    // Confirma que o arquivo final é realmente legível antes de marcar 100%.
    try{await runOut('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',out]);}
    catch(e){
      const repaired=path.join(TMP,'repair-'+job.id+'.mp4'); cleanFile(repaired);
      await run(['-y','-hide_banner','-loglevel','error','-i',out,'-map','0:v:0?','-map','0:a:0?','-c','copy','-movflags','+faststart',repaired]);
      cleanFile(out); fs.renameSync(repaired,out);
    }
    job.status='ready';job.progress=100;job.finishedAt=Date.now();job.size=fs.statSync(out).size;
  }catch(e){
    let msg=String(e.message||e);
    if(/No space left on device|code:\s*-28|Error writing trailer/i.test(msg)){
app.get('/queue/state',(_req,res)=>res.json({ok:true,active,queued:queue.length,items:queue.slice(0,20)}));
app.post('/queue/kick',(_req,res)=>{pump();res.json({ok:true,active,queued:queue.length})});

cleanupStorage(true);const s=storageSummary();msg=`Espaço insuficiente no Motor durante a renderização. Limpeza automática executada. Espaço livre agora: ${s.freeMB==null?'desconhecido':s.freeMB+' MB'}. Libere espaço ou reduza o lote.`}
    job.status='error';job.progress=Math.min(99,Math.max(1,Number(job.progress||1)));job.error=msg.slice(-900);job.finishedAt=Date.now()
  }finally{
    for(const p of [path.join(TMP,'visual-'+job.id+'.mp4'),path.join(TMP,'mult-'+job.id+'.mp4'),path.join(TMP,'base-'+job.id+'.mp4')])cleanFile(p);
    cleanDirOlderThan(TMP,20*60*1000);
  }
}
function pump(){while(active<MAX_CONCURRENCY&&queue.length){const id=queue.shift(),job=jobs.get(id);if(!job||job.status!=='queued')continue;active++;processJob(job).finally(()=>{active--;pump()})}}



function extractFiveScripts(raw){
  let t=String(raw||'').trim();
  try{const a=JSON.parse(t.match(/\[[\s\S]*\]/)?.[0]||'');if(Array.isArray(a)&&a.length>=5)return a.slice(0,5).map(x=>String(x).replace(/\s+/g,' ').trim()).filter(Boolean)}catch(_){}
  return t.split(/\n+/).map(x=>x.replace(/^\s*(?:[-*]|\d+[.)]|VERS[AÃ]O\s*\d+[:.-]?)\s*/i,'').trim()).filter(x=>x.length>45).slice(0,5);
}
app.post('/director/analyze',async(req,res)=>{
 try{
  const id=safeId(req.body?.asset);if(!id||(!fs.existsSync(rawPath(id))&&!fs.existsSync(normPath(id))))return res.status(409).json({error:'Vídeo não encontrado no Cloud.'});
  const source=fs.existsSync(rawPath(id))?rawPath(id):normPath(id);const duration=await probeDuration(source);
  const product=String(req.body?.product||'produto').slice(0,160),facts=String(req.body?.facts||'').slice(0,700);
  const angles=[['Produto Campeão','produto'],['UGC Natural','ugc'],['Problema → Solução','problema'],['Curiosidade','curiosidade'],['Venda Direta','oferta']];
  const cleanFacts=facts||'os detalhes visuais confirmados do produto';
  const hooks=[`Olha esse detalhe em ${product}.`,`Eu não esperava isso de ${product}.`,`Se você procura ${product}, olha isso.`,`Repara nesse detalhe antes de escolher ${product}.`,`Vou te mostrar ${product} de um jeito rápido.`];
  const bodies=[`Mostre o produto de perto, em uso, e destaque apenas ${cleanFacts}.`,`Comece com uma demonstração natural e mostre acabamento, movimento e uso real. ${cleanFacts}.`,`Apresente o problema visualmente e depois demonstre como o produto é usado. Use somente fatos confirmados: ${cleanFacts}.`,`Alterne close e plano aberto para mostrar o produto por ângulos diferentes. Destaque ${cleanFacts}.`,`Faça uma demonstração direta e objetiva, mostrando textura, formato e uso real. ${cleanFacts}.`];
  const ctas=['Confira os detalhes disponíveis no carrinho.','Se fez sentido para você, veja as opções no carrinho.','Confira a oferta e as informações do produto no carrinho.','Veja os detalhes e escolha sua opção no carrinho.','Toque no carrinho para conferir o produto.'];
  const versions=angles.map((a,i)=>{const plan=[];const n=Math.max(8,Math.min(14,Math.ceil(duration/1.6)));for(let k=0;k<n;k++)plan.push({start:Math.max(0,Math.min(duration-1,(k*1.37+i*.53)%Math.max(1,duration-1))),dur:Math.min(2.2,Math.max(.9,duration/n)),speed:[.96,1,1.04,1.08][(k+i)%4],zoom:1+((k+i)%5)*.025});const hook=hooks[i].slice(0,180),body=bodies[i].slice(0,180),cta=ctas[i].slice(0,180);return {name:a[0],preset:a[1],hook,body,cta,script:`${hook} ${body} ${cta}`,plan}});
  res.json({ok:true,duration,transcript:'',diagnosis:`Análise Cloud baseada no vídeo enviado e nas informações confirmadas de ${product}.`,versions});
 }catch(e){res.status(500).json({error:'Falha no Diretor Cloud.',detail:String(e.message||e).slice(-1000)})}
});

app.post('/ai/analyze',async(req,res)=>{
 try{
  const product=String(req.body?.product||'produto').slice(0,160),facts=String(req.body?.facts||'').slice(0,600);
  const f=facts||'características visíveis e confirmadas';
  const scripts=[`Olha esse detalhe em ${product}. Mostre ${f} de perto e em uso. Confira os detalhes no carrinho.`,`Eu não esperava esse resultado visual em ${product}. Demonstre ${f} naturalmente. Veja as opções no carrinho.`,`Se você procura ${product}, repara nisso. Mostre ${f} por outro ângulo e confira as informações no carrinho.`,`Tem um detalhe em ${product} que vale mostrar. Faça close em ${f} e termine mostrando o produto completo. Confira no carrinho.`,`Vou mostrar ${product} sem enrolação. Demonstre ${f}, varie os enquadramentos e convide a pessoa a ver o produto no carrinho.`];
  res.json({ok:true,transcript:'',scripts});
 }catch(e){res.status(500).json({error:'Falha ao analisar vídeo.',detail:String(e.message||e).slice(-1000)})}
});


// ===== V9.0 — IA REAL: referência entra, vídeo original NÃO é reutilizado =====
const REAL_AI_KEY_RAW=String(process.env.POLLINATIONS_API_KEY||'').trim();
const REAL_AI_KEY=REAL_AI_KEY_RAW.replace(/[\u2026\u2018\u2019\u201C\u201D]/g,'').replace(/\s+/g,'');
const REAL_AI_KEY_VALID=/^sk_[A-Za-z0-9._-]{12,}$/.test(REAL_AI_KEY) && !/\.{3,}/.test(REAL_AI_KEY_RAW) && !REAL_AI_KEY_RAW.includes('…');
const REAL_AI_VIDEO_MODEL=String(process.env.POLLINATIONS_VIDEO_MODEL||'minimax/minimax-h3-max-turbo').trim();
const REAL_AI_VISION_MODEL=String(process.env.POLLINATIONS_VISION_MODEL||'google/gemini-2.5-flash-lite').trim();
const aiJobs=new Map(), aiQueue=[]; let aiActive=0;

function stripJsonFence(v){return String(v||'').replace(/^```(?:json)?\s*/i,'').replace(/```\s*$/,'').trim()}
function safeText(v,n=1000){return String(v||'').replace(/[\u0000-\u001f]+/g,' ').replace(/\s+/g,' ').trim().slice(0,n)}
function defaultDNA(product,facts,meta={}){
  const title=safeText(meta.title||'',220);
  const p=safeText(product||title||'produto mostrado na referência',160);
  const f=safeText(facts||'',500);
  return {
    product:p,
    product_visual:f||'preserve as características visuais observáveis do produto, sem inventar marca, material ou função',
    idea:'vídeo UGC de venda curto, dinâmico e natural',
    selling_angle:'mostrar o produto em uso, alternando detalhe e plano completo',
    movement:'a influencer caminha, vira o corpo, aproxima o produto da câmera e demonstra com as mãos; câmera acompanha com movimento natural',
    scene:'ambiente realista e iluminado, adequado ao produto',
    voice_style:'português brasileiro natural, ritmo de TikTok Shop',
    source_title:title,
    variants:['entrada caminhando e demonstração em close','plano médio com giro e câmera acompanhando','POV de produto e corte para influencer em uso','entrada lateral, detalhe do produto e plano completo','demonstração rápida em cenário alternativo']
  };
}
async function extractIdeaFrames(asset){
  const id=safeId(asset); if(!id)throw new Error('Asset inválido');
  const src=fs.existsSync(rawPath(id))?rawPath(id):normPath(id); if(!fs.existsSync(src))throw new Error('Vídeo de referência não encontrado');
  const d=Math.max(1,await probeDuration(src)); const points=[.18,.5,.82].map(x=>Math.max(0,Math.min(d-.1,d*x)));
  const frames=[];
  for(let i=0;i<points.length;i++){
    const f=path.join(TMP,`dna-${id}-${i}-${Date.now()}.jpg`);
    await run(['-y','-hide_banner','-loglevel','error','-ss',points[i].toFixed(3),'-i',src,'-frames:v','1','-vf','scale=512:-2','-q:v','3',f]);
    const b=fs.readFileSync(f); cleanFile(f); frames.push('data:image/jpeg;base64,'+b.toString('base64'));
  }
  return frames;
}
async function visionDNA(images,product,facts,meta={}){
  if(!REAL_AI_KEY_VALID)return defaultDNA(product,facts,{...meta,key_warning:'Chave de IA ausente ou inválida'});
  const prompt=`Analise estas imagens de um vídeo de referência para TikTok Shop. NÃO identifique a pessoa e NÃO copie a identidade dela. O vídeo original servirá apenas como inspiração. Descreva o produto visível, a ideia criativa, cenário, movimentos, enquadramentos e ângulo de venda. O novo vídeo deve usar uma influencer adulta claramente diferente, sem copiar rosto/corpo/identidade, e deve manter apenas as características visuais observáveis do produto. Remova da ideia qualquer texto, legenda, marca d'água, interface ou logo do vídeo original. Produto informado: ${safeText(product||'não informado',160)}. Fatos confirmados: ${safeText(facts||'nenhum',500)}. Responda SOMENTE JSON com: product, product_visual, idea, selling_angle, movement, scene, voice_style, variants (array com 5 ideias curtas).`;
  const body={model:REAL_AI_VISION_MODEL,response_format:{type:'json_object'},messages:[{role:'user',content:[{type:'text',text:prompt},...images.map(u=>({type:'image_url',image_url:{url:u}}))]}]};
  try{
    const r=await fetch('https://gen.pollinations.ai/v1/chat/completions',{method:'POST',headers:{'Authorization':'Bearer '+REAL_AI_KEY,'Content-Type':'application/json'},body:JSON.stringify(body)});
    if(!r.ok){
      const detail=safeText(await r.text(),300);
      const d=defaultDNA(product,facts,meta); d.vision_warning='Análise visual indisponível; usando DNA automático. HTTP '+r.status+' '+detail; return d;
    }
    const j=await r.json(); const content=j?.choices?.[0]?.message?.content||'';
    try{const x=JSON.parse(stripJsonFence(content));return {...defaultDNA(product,facts,meta),...x,variants:Array.isArray(x.variants)?x.variants.slice(0,5):defaultDNA(product,facts,meta).variants};}
    catch(_){const d=defaultDNA(product,facts,meta);d.vision_warning='Resposta visual inválida; usando DNA automático.';return d}
  }catch(e){const d=defaultDNA(product,facts,meta);d.vision_warning='Análise visual falhou; usando DNA automático: '+safeText(e.message||e,220);return d}
}
async function linkDNA(url,product,facts){
  const original=safeText(url,500); if(!isTikTokUrl(original))throw new Error('Link do TikTok inválido');
  const u=await resolveTikTokUrl(original), endpoint='https://www.tiktok.com/oembed?url='+encodeURIComponent(u);
  const rr=await fetch(endpoint,{headers:{'User-Agent':'ViralStudioIAReal/9.0'}}); if(!rr.ok)throw new Error('TikTok não retornou a referência pública');
  const ref=await rr.json(), thumb=safeText(ref.thumbnail_url||'',1000); let imgs=[];
  if(thumb){try{const ir=await fetch(thumb);if(ir.ok){const b=Buffer.from(await ir.arrayBuffer());imgs=['data:image/jpeg;base64,'+b.toString('base64')]}}catch(_){}}
  return visionDNA(imgs,product,facts,{title:ref.title||'',author_name:ref.author_name||''});
}
function realPrompt(dna,variant,duration,index){
  const scenarios=['quarto moderno com luz natural','loja clean e elegante','área externa urbana durante o dia','closet minimalista','sala contemporânea bem iluminada'];
  const scene=safeText((dna.variants&&dna.variants[index%Math.max(1,dna.variants.length)])||variant||dna.scene||scenarios[index%scenarios.length],300);
  return `Vertical 9:16 realistic UGC TikTok Shop video, ${Math.max(4,Math.min(10,Number(duration)||8))} seconds. Create a COMPLETELY NEW video from scratch. Adult Brazilian female influencer with a clearly different appearance from any reference person; do not imitate, recreate, face-match or clone any real person. Product: ${safeText(dna.product,180)}. Preserve only these observable product characteristics: ${safeText(dna.product_visual,420)}. Creative idea: ${safeText(dna.idea,260)}. Selling angle: ${safeText(dna.selling_angle,260)}. Action and movement: ${safeText(dna.movement,360)}. Scene variation: ${scene}. Dynamic natural body movement: walk, turn, use hands, show product close to camera, then full-body or wider view; camera tracks naturally with multiple framings. Do not make a static photo animation and do not use repetitive zoom in/zoom out as the main motion. No on-screen text, no captions, no subtitles, no watermarks, no TikTok UI, no usernames, no logos copied from the reference. Clean realistic lighting, believable hands and product interaction, mobile phone UGC look, high detail. Do not copy any original video frame.`;
}
async function generateRealVideo(prompt,duration,dest){
  if(!REAL_AI_KEY_VALID)throw new Error('Chave da IA Real inválida. No Render, use a chave real completa em POLLINATIONS_API_KEY; não use sk_..., sk_… ou texto de exemplo.');
  const d=Math.max(4,Math.min(10,Number(duration)||8));
  const url='https://gen.pollinations.ai/video/'+encodeURIComponent(prompt)+'?model='+encodeURIComponent(REAL_AI_VIDEO_MODEL)+'&duration='+encodeURIComponent(d);
  const c=new AbortController(), timer=setTimeout(()=>c.abort(),12*60*1000);
  try{
    const r=await fetch(url,{headers:{'Authorization':'Bearer '+REAL_AI_KEY,'Accept':'video/mp4,application/octet-stream'},signal:c.signal});
    if(!r.ok)throw new Error('Gerador IA respondeu HTTP '+r.status+': '+safeText(await r.text(),500));
    const ct=String(r.headers.get('content-type')||'');
    if(!ct.includes('video')&&!ct.includes('octet-stream'))throw new Error('Gerador IA não retornou MP4: '+ct);
    const b=Buffer.from(await r.arrayBuffer()); if(b.length<10000)throw new Error('Gerador IA retornou arquivo vazio/pequeno.');
    const raw=dest+'.raw.mp4'; fs.writeFileSync(raw,b);
    await run(['-y','-hide_banner','-loglevel','error','-i',raw,'-vf','scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,setsar=1,fps=24,format=yuv420p','-an','-c:v','libx264','-preset','veryfast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',dest]);
    cleanFile(raw);
  }finally{clearTimeout(timer)}
}
async function processAIJob(job){
  job.status='working';job.progress=12;job.startedAt=Date.now();
  const out=outPath(job.id), visual=path.join(TMP,'aireal-'+job.id+'.mp4'); cleanFile(out);cleanFile(visual);
  try{
    ensureStorage(700);job.progress=20;
    await generateRealVideo(job.prompt,job.duration,visual);job.progress=82;
    if(job.narration){try{await addNarration(visual,out,job.narration,job.duration)}catch(e){fs.copyFileSync(visual,out);job.warning='Vídeo criado pela IA; a narração não pôde ser aplicada nesta tentativa.'}}
    else fs.copyFileSync(visual,out);
    job.progress=96;await runOut('ffprobe',['-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',out]);
    job.status='ready';job.progress=100;job.size=fs.statSync(out).size;job.finishedAt=Date.now();
  }catch(e){job.status='error';job.error=safeText(e.message||e,900);job.progress=Math.max(1,Math.min(99,job.progress||1));job.finishedAt=Date.now();}
  finally{cleanFile(visual)}
}
function aiPump(){while(aiActive<1&&aiQueue.length){const id=aiQueue.shift(),j=aiJobs.get(id);if(!j||j.status!=='queued')continue;aiActive++;processAIJob(j).finally(()=>{aiActive--;aiPump()})}}
app.get('/ai-real/status',(_q,res)=>res.json({ok:true,version:'9.3',mode:'new-video-from-reference',configured:REAL_AI_KEY_VALID,videoModel:REAL_AI_VIDEO_MODEL,visionModel:REAL_AI_VISION_MODEL,originalFramesReused:false,audio:'new-tts',mobileReferenceFrames:true}));
app.post('/ai-real/analyze',async(req,res)=>{
 try{
  const product=safeText(req.body?.product||'',160),facts=safeText(req.body?.facts||'',600);let dna;
  if(req.body?.asset){
    try{dna=await visionDNA(await extractIdeaFrames(req.body.asset),product,facts,{})}
    catch(e){dna=defaultDNA(product,facts,{});dna.vision_warning='Não foi possível ler os frames da referência; usando DNA automático: '+safeText(e.message||e,220)}
  }else if(req.body?.url){
    try{dna=await linkDNA(req.body.url,product,facts)}
    catch(e){dna=defaultDNA(product,facts,{});dna.vision_warning='Não foi possível analisar o link; usando DNA automático: '+safeText(e.message||e,220)}
  }else return res.status(400).json({error:'Envie asset ou url'});
  res.json({ok:true,dna,warning:dna.vision_warning||null,originalFramesReused:false});
 }catch(e){const dna=defaultDNA(req.body?.product||'',req.body?.facts||'',{});dna.vision_warning='Fallback automático ativado.';res.json({ok:true,dna,warning:safeText(e.message||e,300),originalFramesReused:false})}
});
app.post('/ai-real/analyze-images',async(req,res)=>{
 try{
  const product=safeText(req.body?.product||'',160),facts=safeText(req.body?.facts||'',600);
  const images=Array.isArray(req.body?.images)?req.body.images.slice(0,3).filter(x=>typeof x==='string'&&/^data:image\/(jpeg|jpg|png|webp);base64,/i.test(x)&&x.length<1800000):[];
  let dna;
  if(images.length){try{dna=await visionDNA(images,product,facts,{source:'mobile-frames'})}catch(e){dna=defaultDNA(product,facts,{});dna.vision_warning='Análise dos quadros falhou; usando DNA automático: '+safeText(e.message||e,220)}}
  else{dna=defaultDNA(product,facts,{});dna.vision_warning='Nenhum quadro válido recebido; usando DNA automático.'}
  res.json({ok:true,dna,warning:dna.vision_warning||null,originalFramesReused:false,referenceFramesUsed:images.length});
 }catch(e){const dna=defaultDNA(req.body?.product||'',req.body?.facts||'',{});dna.vision_warning='Fallback automático ativado.';res.json({ok:true,dna,warning:safeText(e.message||e,300),originalFramesReused:false,referenceFramesUsed:0})}
});
app.post('/ai-real/jobs',(req,res)=>{const dna=req.body?.dna||{};const idx=Math.max(0,Number(req.body?.index)||0),duration=Math.max(4,Math.min(10,Number(req.body?.duration)||8));const id=crypto.randomUUID();const job={id,status:'queued',progress:0,createdAt:Date.now(),duration,narration:safeText(req.body?.narration||'',900),prompt:realPrompt(dna,req.body?.variant, duration,idx),warning:null,error:null};aiJobs.set(id,job);aiQueue.push(id);aiPump();res.status(202).json({ok:true,id,status:'queued'});});
app.get('/ai-real/jobs/:id',(req,res)=>{const j=aiJobs.get(String(req.params.id));if(!j)return res.status(404).json({error:'Job IA não encontrado'});res.json({ok:true,id:j.id,status:j.status,progress:j.progress,error:j.error||null,warning:j.warning||null,size:j.size||0})});
app.get('/ai-real/jobs/:id/file',(req,res)=>{const j=aiJobs.get(String(req.params.id)),p=outPath(String(req.params.id));if(!j||j.status!=='ready'||!fs.existsSync(p))return res.status(404).json({error:'Vídeo IA ainda não está pronto'});const disposition=String(req.query.download||'')==='1'?'attachment':'inline';res.set({'Cache-Control':'no-store','Content-Type':'video/mp4','Content-Disposition':`${disposition}; filename="viral-studio-ia-${j.id}.mp4"`,'Access-Control-Allow-Origin':'*'});fs.createReadStream(p).pipe(res)});
// ===== FIM V9.0 IA REAL =====

app.post('/jobs',(req,res)=>{
  const signature=String(req.body?.signature||'').slice(0,180);
  if(signature&&signatures.has(signature)){const old=jobs.get(signatures.get(signature));if(old&&old.status!=='error')return res.status(200).json({ok:true,id:old.id,status:old.status,deduplicated:true});signatures.delete(signature)}
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
app.post('/jobs/:id/retry',(req,res)=>{
  const old=jobs.get(String(req.params.id));
  if(!old)return res.status(404).json({error:'Job não encontrado'});
  const id=crypto.randomUUID();
  const job={...old,id,status:'queued',progress:0,createdAt:Date.now(),startedAt:null,finishedAt:null,error:null,size:0};
  jobs.set(id,job); queue.push(id); pump();
  res.status(202).json({ok:true,id,status:'queued',retryOf:old.id});
});
app.post('/jobs/status',(req,res)=>{const ids=Array.isArray(req.body?.ids)?req.body.ids.slice(0,100):[];res.json({ok:true,jobs:ids.map(id=>{const j=jobs.get(String(id));return j?{id:j.id,status:j.status,progress:j.progress,preset:j.preset,mode:j.mode,error:j.error||null,warning:j.warning||null,size:j.size||0}: {id:String(id),status:'missing',progress:100,error:'Job não encontrado'}})})});
app.get('/jobs/:id',(req,res)=>{const j=jobs.get(String(req.params.id));if(!j)return res.status(404).json({error:'Job não encontrado'});res.json({ok:true,id:j.id,status:j.status,progress:j.progress,error:j.error||null,warning:j.warning||null,size:j.size||0})});
app.get('/jobs/:id/file',(req,res)=>{
  const j=jobs.get(String(req.params.id)),p=outPath(String(req.params.id));
  if(!j||j.status!=='ready'||!fs.existsSync(p))return res.status(404).json({error:'Vídeo ainda não está pronto'});
  const size=fs.statSync(p).size, range=req.headers.range;
  const disposition=String(req.query.download||'')==='1'?'attachment':'inline';
  const common={'Cache-Control':'no-store','Content-Type':'video/mp4','Content-Disposition':`${disposition}; filename="viral-studio-${j.id}.mp4"`,'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff'};
  if(range){
    const m=/bytes=(\d*)-(\d*)/.exec(range); let start=m&&m[1]?Number(m[1]):0, end=m&&m[2]?Number(m[2]):size-1;
    if(!Number.isFinite(start)||start<0)start=0; if(!Number.isFinite(end)||end>=size)end=size-1;
    if(start>end||start>=size)return res.status(416).set('Content-Range',`bytes */${size}`).end();
    res.writeHead(206,{...common,'Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':end-start+1});
    return fs.createReadStream(p,{start,end}).pipe(res);
  }
  res.writeHead(200,{...common,'Content-Length':size}); fs.createReadStream(p).pipe(res);
});


app.get('/queue/state',(_req,res)=>res.json({ok:true,active,queued:queue.length,items:queue.slice(0,20)}));
app.post('/queue/kick',(_req,res)=>{pump();res.json({ok:true,active,queued:queue.length})});

cleanupStorage(true);
setInterval(()=>{const cutoff=Date.now()-90*60*1000;for(const [id,j] of jobs){if((j.finishedAt||j.createdAt)<cutoff&&['ready','error'].includes(j.status)){jobs.delete(id);cleanFile(outPath(id))}}cleanupStorage(false)},10*60*1000).unref?.();
const server=app.listen(Number(process.env.PORT)||10000,'0.0.0.0',()=>console.log(`Viral Studio Cloud IA Real V9.2 pronto na porta 10000 — Multiplicador de Criativos — fila até 100 — ${MAX_CONCURRENCY} renderizações paralelas`));
server.requestTimeout=30*60*1000;server.headersTimeout=31*60*1000;server.keepAliveTimeout=65000;
