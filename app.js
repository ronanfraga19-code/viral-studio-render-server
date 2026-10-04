const $=id=>document.getElementById(id);let user=null,qty=10,files={h:[],b:[],c:[]},results=[];
let vsStopProduction=false,vsActiveVideo=null,vsActiveRecorder=null;
const SUPABASE_URL='https://ptxxngwpnyrysmxwzyax.supabase.co';
const SUPABASE_KEY='sb_publishable__rLDXpg9QP_FNYg04Kvz5Q_TCpkbjpr';
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
const planLabels={monthly:'Mensal — R$ 39,90',quarterly:'Trimestral — R$ 99,90',annual:'PRO Anual — R$ 297,90'};
let selectedPlan='monthly';
function authMsg(msg,type='info'){const el=$('authMessage');el.textContent=msg;el.className='authMessage '+type;el.classList.remove('hidden')}
function setAuthTab(mode){$('loginPane').classList.toggle('hidden',mode!=='login');$('signupPane').classList.toggle('hidden',mode!=='signup');$('tabLogin').classList.toggle('active',mode==='login');$('tabSignup').classList.toggle('active',mode==='signup');$('authMessage').classList.add('hidden')}
$('tabLogin').onclick=()=>setAuthTab('login');$('tabSignup').onclick=()=>setAuthTab('signup');
const togglePassword=$('togglePassword');if(togglePassword){togglePassword.onclick=()=>{const input=$('password');const showing=input.type==='text';input.type=showing?'password':'text';togglePassword.textContent=showing?'👁':'🙈';togglePassword.setAttribute('aria-label',showing?'Mostrar senha':'Ocultar senha');togglePassword.title=showing?'Mostrar senha':'Ocultar senha';input.focus();};}
document.querySelectorAll('.choosePlan').forEach(b=>b.onclick=()=>{selectedPlan=b.dataset.plan;$('selectedPlanLabel').textContent=planLabels[selectedPlan];document.querySelectorAll('.authPlans article').forEach(a=>a.classList.toggle('selected',a.dataset.plan===selectedPlan));setAuthTab('signup');$('signupPane').scrollIntoView({behavior:'smooth',block:'center'})});
function enter(u){document.body.classList.add('authenticated');$('auth').classList.add('hidden');$('app').classList.remove('hidden');user={name:(u.email||'Cliente').split('@')[0],created:new Date().toLocaleDateString('pt-BR'),customerId:'VS',...u};$('auth').classList.add('hidden');$('app').classList.remove('hidden');$('sideEmail').textContent=user.email;$('sideName').textContent=user.role==='admin'?'Administrador':user.name;$('sideAvatar').textContent=(user.role==='admin'?'A':(user.name||'C')[0]).toUpperCase();$('sidePlan').textContent=user.role==='admin'?'Administrador':user.planLabel;renderProfile();renderAiAccess();$('licenseBadge').textContent=user.role==='admin'?'● ADMIN • ACESSO TOTAL':`● ${user.planLabel.toUpperCase()} • ATIVO`;$('adminNav').classList.toggle('hidden',user.role!=='admin');requestAnimationFrame(()=>{show('originals',document.querySelector('[data-page="originals"]'));window.scrollTo({top:0,left:0,behavior:'instant'})})}
async function loadAccess(session){if(!session?.user)return false;const {data,error}=await sb.from('profiles').select('email,role,subscription_status,plan,subscription_expires_at').eq('id',session.user.id).single();if(error||!data){await sb.auth.signOut();authMsg('Não foi possível validar seu acesso. Tente entrar novamente.','error');return false}const isAdmin=data.role==='admin';const active=data.subscription_status==='active';if(!isAdmin&&!active){await sb.auth.signOut();authMsg('Sua conta foi criada, mas a assinatura ainda não está ativa. Escolha um plano e conclua o pagamento quando a cobrança estiver conectada.','warn');return false}const labels={monthly:'Mensal',quarterly:'Trimestral',annual:'PRO Anual'};enter({email:data.email||session.user.email,role:data.role,plan:data.plan,planLabel:isAdmin?'Administrador':(labels[data.plan]||'Assinatura ativa'),days:null});return true}
function cleanLoginEmail(v){return String(v||'').replace(/[\u200B-\u200D\uFEFF\u00A0]/g,'').trim().toLowerCase()}
function cleanLoginPassword(v){return String(v||'').replace(/[\u200B-\u200D\uFEFF]/g,'').trim()}
async function directPasswordLogin(email,password){
 const res=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=password',{
  method:'POST',headers:{'apikey':SUPABASE_KEY,'Content-Type':'application/json'},
  body:JSON.stringify({email,password}),cache:'no-store'
 });
 const body=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(body?.msg||body?.error_description||body?.message||('HTTP '+res.status));
 if(!body?.access_token||!body?.refresh_token)throw new Error('Sessão não retornada pelo servidor.');
 const {data,error}=await sb.auth.setSession({access_token:body.access_token,refresh_token:body.refresh_token});
 if(error)throw error;
 return data?.session||null;
}
$('login').onclick=async()=>{
 const email=cleanLoginEmail($('email').value),password=cleanLoginPassword($('password').value);
 $('email').value=email;$('password').value=password;
 if(!email||!password)return authMsg('Digite seu e-mail e sua senha.','warn');
 $('login').disabled=true;$('login').textContent='ENTRANDO...';
 try{
  let session=null;let firstError=null;
  try{const r=await sb.auth.signInWithPassword({email,password});if(r.error)firstError=r.error;else session=r.data?.session||null}catch(e){firstError=e}
  if(!session){
   try{session=await directPasswordLogin(email,password)}catch(restErr){
    const raw=String(restErr?.message||firstError?.message||'').toLowerCase();
    if(raw.includes('invalid login credentials')||raw.includes('invalid credentials')||raw.includes('email or password'))return authMsg('E-mail ou senha incorretos. Toque no 👁, confira a senha e tente novamente.','error');
    return authMsg('Não foi possível entrar no app instalado: '+(restErr?.message||firstError?.message||'erro de conexão')+'.','error');
   }
  }
  if(!session)return authMsg('Não foi possível criar a sessão de acesso. Tente novamente.','error');
  await loadAccess(session);
 }catch(err){authMsg('Falha de conexão no celular. Verifique a internet e tente novamente.','error')}
 finally{$('login').disabled=false;$('login').textContent='ENTRAR NO VIRAL STUDIO'}
};
$('forgotPassword').onclick=async()=>{const email=$('email').value.trim();if(!email)return authMsg('Digite seu e-mail acima para receber o link de redefinição.','warn');const {error}=await sb.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)return authMsg(error.message||'Não foi possível enviar o link.','error');authMsg('Link para redefinir a senha enviado. Confira seu e-mail.','ok')};
$('resendConfirmation').onclick=async()=>{const email=($('signupEmail').value||$('email').value).trim();if(!email)return authMsg('Digite o e-mail da conta para reenviar a confirmação.','warn');const {error}=await sb.auth.resend({type:'signup',email,options:{emailRedirectTo:location.origin+location.pathname}});if(error)return authMsg(error.message||'Não foi possível reenviar agora.','error');authMsg('E-mail de confirmação reenviado. Confira também a caixa de spam.','ok')};
$('signup').onclick=async()=>{const email=$('signupEmail').value.trim(),password=$('signupPassword').value;if(!email||!password)return authMsg('Preencha e-mail e senha.','warn');if(password.length<8)return authMsg('Use uma senha com pelo menos 8 caracteres.','warn');$('signup').disabled=true;$('signup').textContent='CRIANDO...';const {data,error}=await sb.auth.signUp({email,password,options:{data:{requested_plan:selectedPlan}}});$('signup').disabled=false;$('signup').textContent='CRIAR MINHA CONTA';if(error)return authMsg(error.message||'Não foi possível criar a conta.','error');if(data.session){await loadAccess(data.session)}else{authMsg('Conta criada. Confira seu e-mail para confirmar o cadastro. Depois volte e faça login.','ok')}};
$('logout').onclick=async()=>{document.body.classList.remove('authenticated');await sb.auth.signOut();location.reload()};
(async()=>{const {data}=await sb.auth.getSession();if(data.session)await loadAccess(data.session)})();
document.querySelectorAll('nav button[data-page]').forEach(b=>b.onclick=()=>show(b.dataset.page,b));
function show(id,btn){document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$(id).classList.remove('hidden');document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));if(btn)btn.classList.add('active');$('pageTitle').textContent=id==='production'?'Produção':id==='results'?'Resultados':id==='library'?'Biblioteca':id==='admin'?'Administração':id==='profile'?'Meu Perfil':id==='viralshop'?'Viral Shop':id==='viralai'?'Viral IA':id==='creator'?'Criar Vídeo':id==='shopcheck'?'Verificador TikTok Shop':'Dashboard';const back=$('mobileHomeBack');if(back)back.classList.toggle('hidden',id==='dashboard');window.scrollTo({top:0,left:0,behavior:'instant'});if(id==='dashboard'&&window.vsRefreshDashboardStats)window.vsRefreshDashboardStats()}

// V4.38.3 — navegação móvel: retorno rápido ao menu principal
const mobileHomeBack=$('mobileHomeBack');if(mobileHomeBack){mobileHomeBack.onclick=()=>{const home=document.querySelector('[data-page="dashboard"]');show('dashboard',home);window.scrollTo({top:0,behavior:'smooth'});};}
document.querySelectorAll('.goProduction').forEach(b=>b.onclick=()=>show('production',document.querySelector('[data-page=production]')));
function sync(){files.h=[...$('hooks').files];files.b=[...$('bodies').files];files.c=[...$('ctas').files];$('hooksCount').textContent=files.h.length+' arquivos';$('bodiesCount').textContent=files.b.length+' arquivos';$('ctasCount').textContent=files.c.length+' arquivos';let n=files.h.length*files.b.length*files.c.length;$('comboCount').textContent=n;$('statCombos').textContent=n;$('dashCombos').textContent=n;renderLibrary()}
['hooks','bodies','ctas'].forEach(id=>$(id).onchange=sync);
document.querySelectorAll('.quantity button').forEach(b=>b.onclick=()=>{document.querySelectorAll('.quantity button').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');qty=b.dataset.q==='all'?'all':+b.dataset.q});
function combos(){
 // V4.4: agenda balanceada para lotes grandes.
 // NÃO percorre o produto cartesiano em ordem (isso causava G1+C1+CTA1, G1+C1+CTA2...).
 const H=files.h.length,B=files.b.length,C=files.c.length;
 if(!H||!B||!C)return [];
 const total=H*B*C, want=qty==='all'?total:Math.min(Number(qty)||total,total);
 const out=[], seen=new Set(), pairHB=new Set(),pairHC=new Set(),pairBC=new Set();
 const useH=Array(H).fill(0),useB=Array(B).fill(0),useC=Array(C).fill(0);
 const key=(a,b)=>a+'|'+b;
 function add(hi,bi,ci){
   const k=hi+'|'+bi+'|'+ci;if(seen.has(k))return false;
   seen.add(k);pairHB.add(key(hi,bi));pairHC.add(key(hi,ci));pairBC.add(key(bi,ci));
   useH[hi]++;useB[bi]++;useC[ci]++;
   out.push({h:files.h[hi],b:files.b[bi],c:files.c[ci],hi,bi,ci});return true;
 }
 // Original é sempre o primeiro.
 add(0,0,0);
 while(out.length<want){
   let best=null,bestScore=Infinity;
   // Para centenas de arquivos, avaliamos candidatos determinísticos balanceados
   // antes de cair em varredura completa.
   const rounds=Math.min(Math.max(H,B,C)*4,20000);
   for(let r=0;r<rounds;r++){
     const hi=(out.length+r)%H;
     const bi=(out.length*2+r*3)%B;
     const ci=(out.length*3+r*5)%C;
     const k=hi+'|'+bi+'|'+ci;if(seen.has(k))continue;
     const repeated=(pairHB.has(key(hi,bi))?1:0)+(pairHC.has(key(hi,ci))?1:0)+(pairBC.has(key(bi,ci))?1:0);
     const score=repeated*100000+(useH[hi]+useB[bi]+useC[ci])*100+(Math.max(useH[hi],useB[bi],useC[ci]));
     if(score<bestScore){best={hi,bi,ci};bestScore=score;if(repeated===0&&useH[hi]===Math.min(...useH)&&useB[bi]===Math.min(...useB)&&useC[ci]===Math.min(...useC))break;}
   }
   // Fallback exato para conjuntos pequenos ou quando o candidato determinístico esgota.
   if(!best){
     outer: for(let hi=0;hi<H;hi++)for(let bi=0;bi<B;bi++)for(let ci=0;ci<C;ci++){
       const k=hi+'|'+bi+'|'+ci;if(seen.has(k))continue;
       const repeated=(pairHB.has(key(hi,bi))?1:0)+(pairHC.has(key(hi,ci))?1:0)+(pairBC.has(key(bi,ci))?1:0);
       const score=repeated*100000+(useH[hi]+useB[bi]+useC[ci])*100;
       if(score<bestScore){best={hi,bi,ci};bestScore=score;if(repeated===0)break outer;}
     }
   }
   if(!best)break;
   add(best.hi,best.bi,best.ci);
 }
 return out;
}
function similarity(x,y){let same=(x.h.name===y.h.name)+(x.b.name===y.b.name)+(x.c.name===y.c.name);return Math.round(same/3*100)}
function tagFor(score){return score>=67?['BEM PARECIDO','red']:score>=34?['REPETE UM POUCO','yellow']:['ORIGINAL','green']}
function analyze(){let a=combos();if(!a.length)return alert('Adicione pelo menos 1 Gancho, 1 Corpo e 1 CTA.');$('analysis').classList.remove('hidden');$('analysisList').innerHTML='';a.forEach((x,i)=>{let max=0;for(let j=0;j<i;j++)max=Math.max(max,similarity(x,a[j]));let [t,c]=tagFor(max);let d=document.createElement('div');d.className='analysisItem';d.innerHTML=`<div><b>Vídeo ${i+1}</b><small style="display:block;color:#6f7b8d">Gancho ${x.hi+1} • Corpo ${x.bi+1} • CTA ${x.ci+1} • similaridade máxima ${max}%</small></div><span class="tag ${c}">${t}</span>`;$('analysisList').appendChild(d)})}
$('analyze').onclick=analyze;
$('generate').onclick=()=>produceAll();
function renderResults(){
 let el=$('resultList');el.className='';el.innerHTML='';
 results.forEach((x,i)=>{
  let max=0;for(let j=0;j<i;j++)max=Math.max(max,similarity(x,results[j]));
  let[t,c]=tagFor(max),d=document.createElement('div');d.className='resultItem';d.id='result_'+i;
  let state=x.url?`<div class="resultActions"><span class="tag ${c}">● ${t}</span><a href="${x.url}" download="${safeName($('product').value||'produto')}_${i+1}.${x.ext||'webm'}">↓ BAIXAR</a><button data-watch="${i}">▶ ASSISTIR</button></div>`:`<div class="resultActions"><span class="tag ${c}">● ${t}</span><span class="tag yellow">GERANDO...</span></div>`;
  d.innerHTML=`<div><b>Vídeo ${i+1}</b><small style="display:block;color:#6f7b8d">Gancho ${x.hi+1} → Corpo ${x.bi+1} → CTA ${x.ci+1} • similaridade ${max}%</small></div>${state}`;
  el.appendChild(d)
 });
 el.querySelectorAll('[data-watch]').forEach(b=>b.onclick=()=>watchResult(+b.dataset.watch));if(user)renderProfile();
}
function safeName(s){return s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9_-]+/gi,'_').toLowerCase()}
function wait(ms){return new Promise(r=>setTimeout(r,ms))}
async function loadVideo(file){
 const v=document.createElement('video');v.playsInline=true;v.muted=true;v.src=URL.createObjectURL(file);v.preload='auto';
 await new Promise((res,rej)=>{v.onloadedmetadata=res;v.onerror=()=>rej(new Error('Não consegui abrir '+file.name))});return v
}


const vsMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints>1 && innerWidth<900);
const vsIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);
// V4.86 — estrutura atual + conexão Motor PC restaurada exatamente da base V4.70.
const VS_RENDER_SERVER_FALLBACK='https://viral-studio-motor-cloud.onrender.com';
const VS_AUTO_PAIR_ID='vs-7f3c9a5e2d8146b8a1f0c4e9';
function vsRenderServer(){return (localStorage.getItem('vs_pc_render_url')||VS_RENDER_SERVER_FALLBACK).replace(/\/$/,'')}
function vsUsingPC(){return !!localStorage.getItem('vs_pc_render_url')}
async function vsDiscoverMotorPc(){
 try{
  const c=new AbortController(),t=setTimeout(()=>c.abort(),12000);
  const r=await fetch(VS_RENDER_SERVER_FALLBACK+'/motor/current/'+encodeURIComponent(VS_AUTO_PAIR_ID),{cache:'no-store',signal:c.signal});clearTimeout(t);
  if(!r.ok)return null;const j=await r.json();
  if(j?.online&&/^https:\/\//.test(j.url||'')){localStorage.setItem('vs_pc_render_url',String(j.url).replace(/\/$/,''));return j.url}
 }catch(_){}return null;
}

window.vsDiscoverMotorPc=vsDiscoverMotorPc;

async function fetchWithRetry(url,opts={},attempts=4){
 let last;
 for(let n=1;n<=attempts;n++){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),20*60*1000);
  try{
   const r=await fetch(url,{...opts,signal:controller.signal,cache:'no-store'});
   clearTimeout(timer); return r;
  }catch(e){
   clearTimeout(timer); last=e;
   if(n<attempts)await wait(Math.min(5000,700*n));
  }
 }
 throw last||new Error('Falha de rede');
}

// V4.44 — Motor PC V3.1 Auto Pair: cada arquivo fonte é enviado uma única vez.
// Depois, até 100 combinações viram jobs pequenos no PC. Se o túnel oscilar,
// a renderização já iniciada continua no computador e o celular só volta a consultar o status.
const vsPcAssetPromises=new Map();
async function vsSmallHash(text){
 const data=new TextEncoder().encode(text);
 const digest=await crypto.subtle.digest('SHA-256',data);
 return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function vsPcAssetId(file){
 return 'a'+(await vsSmallHash([file.name,file.size,file.lastModified,file.type].join('|'))).slice(0,40);
}
async function vsEnsurePcAsset(file){
 const id=await vsPcAssetId(file);
 if(vsPcAssetPromises.has(id))return vsPcAssetPromises.get(id);
 const task=(async()=>{
   try{
     const chk=await fetchWithRetry(vsRenderServer()+'/assets/'+id,{method:'GET'},3);
     if(chk.ok){const j=await chk.json().catch(()=>null);if(j?.exists)return id;}
   }catch(_){}
   const fd=new FormData();fd.append('id',id);fd.append('clip',file,file.name||'clip.mp4');
   const r=await fetchWithRetry(vsRenderServer()+'/assets',{method:'POST',body:fd},5);
   if(!r.ok){let msg='Falha ao preparar arquivo';try{const j=await r.json();msg=j.detail||j.error||msg}catch(_){}throw new Error(msg)}
   return id;
 })().catch(e=>{vsPcAssetPromises.delete(id);throw e});
 vsPcAssetPromises.set(id,task);return task;
}
async function vsCreatePcJob(job){
 const clips=await Promise.all([vsEnsurePcAsset(job.h),vsEnsurePcAsset(job.b),vsEnsurePcAsset(job.c)]);
 const r=await fetchWithRetry(vsRenderServer()+'/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips,label:`G${job.hi+1}+C${job.bi+1}+CTA${job.ci+1}`,preset:(localStorage.getItem('vs_viral_shop_enabled')==='1'?(localStorage.getItem('vs_viral_shop_preset')||'produto'):'original')})},5);
 if(!r.ok){let msg='Não consegui criar a tarefa no PC';try{const j=await r.json();msg=j.detail||j.error||msg}catch(_){}throw new Error(msg)}
 const j=await r.json();if(!j.id)throw new Error('Motor PC não retornou o ID da tarefa.');return j.id;
}
async function vsWaitPcJob(id){
 let misses=0;
 for(;;){
  try{
   const r=await fetchWithRetry(vsRenderServer()+'/jobs/'+encodeURIComponent(id),{method:'GET'},2);
   if(r.ok){const j=await r.json();misses=0;
     if(j.status==='ready')return {remoteUrl:vsRenderServer()+'/jobs/'+encodeURIComponent(id)+'/file',ext:'mp4',jobId:id};
     if(j.status==='error'||j.status==='missing')throw new Error(j.error||'Falha ao renderizar no Motor PC.');
   }else if(r.status===404){throw new Error('A tarefa não foi encontrada no Motor PC.');}
  }catch(e){
   if(String(e?.message||e).includes('Falha ao renderizar')||String(e?.message||e).includes('não foi encontrada'))throw e;
   misses++; if(misses>20)throw new Error('Motor PC ficou offline por muito tempo. A tarefa pode continuar no computador; reconecte e tente novamente.');
  }
  await wait(900);
 }
}
async function renderComboServer(job){
 try{
  // Quando o Motor PC estiver conectado, use o protocolo V3 (cache + fila persistente).
  if(vsUsingPC()){
    const id=job._pcJobId||await vsCreatePcJob(job);job._pcJobId=id;
    return await vsWaitPcJob(id);
  }
  // Fallback do servidor antigo: envia os 3 arquivos na mesma requisição.
  const fd=new FormData();
  fd.append('clips',job.h,job.h.name||'gancho.mp4');
  fd.append('clips',job.b,job.b.name||'corpo.mp4');
  fd.append('clips',job.c,job.c.name||'cta.mp4');
  const r=await fetchWithRetry(vsRenderServer()+'/render',{method:'POST',body:fd},3);
  if(!r.ok){let msg='Erro '+r.status;try{const j=await r.json();msg=j.detail||j.error||msg}catch(_){}throw new Error(msg)}
  const blob=await r.blob();if(!blob.size)throw new Error('Servidor retornou vídeo vazio.');
  return {blob,ext:'mp4'};
 }catch(e){
  if(e?.name==='AbortError')throw new Error('Tempo limite no Motor PC.');
  if(String(e?.message||e).toLowerCase().includes('load failed'))throw new Error('A conexão oscilou. O Viral Studio tentará reutilizar os arquivos já enviados ao PC.');
  throw e;
 }
}
async function wakeRenderServer(){try{await fetch(vsRenderServer()+'/health',{cache:'no-store'});return true}catch(_){return false}}
function vsRecorderOptions(mime){
 const o={}; if(mime)o.mimeType=mime;
 o.videoBitsPerSecond=vsMobile?1600000:4200000;
 o.audioBitsPerSecond=vsMobile?96000:192000;
 return o;
}
async function vsSaveMobile(href,name,mime){
 try{
  const blob=await fetch(href).then(r=>r.blob());
  const file=new File([blob],name,{type:blob.type||mime||'video/mp4'});
  if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
   await navigator.share({files:[file],title:'Viral Studio'});
   return true;
  }
 }catch(e){ if(e && e.name==='AbortError') return false; }
 const a=document.createElement('a');a.href=href;a.download=name;a.target='_blank';
 document.body.appendChild(a);a.click();a.remove();return true;
}

function vs323OutputFormat(){
 const choices=[
  ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"','mp4'],
  ['video/mp4;codecs="avc1.42E01E,opus"','mp4'],
  ['video/mp4','mp4'],
  ['video/webm;codecs=vp8,opus','webm'],
  ['video/webm;codecs=vp9,opus','webm'],
  ['video/webm','webm']
 ];
 for(const [mime,ext] of choices)if(MediaRecorder.isTypeSupported(mime))return {mime,ext};
 return {mime:'',ext:'webm'};
}
async function renderCombo(job,index,total,sharedAC=null){
 const W=vsMobile?540:720,H=vsMobile?960:1280;const cvs=document.createElement('canvas');cvs.width=W;cvs.height=H;const ctx=cvs.getContext('2d',{alpha:false});
 // V4.38.10 iPhone: durante uma fila, reutilize o AudioContext criado pelo toque do usuário.
 // Criar/resumir um AudioContext novo no 2º vídeo pode ser bloqueado pelo Safari fora do gesto inicial.
 const cs=cvs.captureStream(vsMobile?20:30),AC=window.AudioContext||window.webkitAudioContext,ac=sharedAC||new AC(),ownsAC=!sharedAC;
 if(ac.state==='suspended')await ac.resume();
 const dest=ac.createMediaStreamDestination(),out=new MediaStream([...cs.getVideoTracks(),...dest.stream.getAudioTracks()]);
 const fmt=vs323OutputFormat(),mime=fmt.mime,rec=new MediaRecorder(out,vsRecorderOptions(mime));
 vsActiveRecorder=rec;const chunks=[];rec.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
 const stopped=new Promise(r=>rec.addEventListener('stop',r,{once:true}));rec.start(300);
 let url=null,v=null,src=null,gain=null,mon=null;
 const clean=()=>{try{v?.pause()}catch(e){};try{src?.disconnect();gain?.disconnect();mon?.disconnect()}catch(e){};try{if(v){v.removeAttribute('src');v.load();v.remove();}}catch(e){};if(url)try{URL.revokeObjectURL(url)}catch(e){};url=v=src=gain=mon=null;vsActiveVideo=null};
 try{
  for(const [stage,file] of [['Gancho',job.h],['Corpo',job.b],['CTA',job.c]]){
   if(vsStopProduction)throw new DOMException('Interrompido','AbortError');
   if($('prodDetail'))$('prodDetail').textContent=`Vídeo ${index+1}/${total}: ${stage}`;
   v=document.createElement('video');vsActiveVideo=v;v.playsInline=true;v.setAttribute('playsinline','');v.setAttribute('webkit-playsinline','');v.preload='auto';url=URL.createObjectURL(file);v.src=url;
   await new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('Tempo excedido: '+file.name)),15000);v.onloadedmetadata=()=>{clearTimeout(t);res()};v.onerror=()=>{clearTimeout(t);rej(new Error('Falha ao abrir '+file.name))};v.load()});
   src=ac.createMediaElementSource(v);gain=ac.createGain();src.connect(gain);gain.connect(dest);mon=ac.createGain();mon.gain.value=0;gain.connect(mon);mon.connect(ac.destination);
   // V4.38.9 iOS: o Safari aceita iniciar o elemento mudo com mais consistência,
   // mas mantê-lo mudo também pode silenciar a trilha capturada pelo WebAudio.
   // Inicia mudo somente para liberar o play e reativa o áudio imediatamente.
   if(vsIOS){v.muted=true;v.defaultMuted=true;}
   await Promise.race([
    v.play(),
    new Promise((_,rej)=>setTimeout(()=>rej(new Error('Falha ao iniciar '+file.name)),8000))
   ]);
   if(vsIOS){v.muted=false;v.defaultMuted=false;}
   const began=performance.now(),limit=(Math.max(1,Number.isFinite(v.duration)?v.duration:30)+12)*1000;
   await new Promise((resolve,reject)=>{function draw(){if(vsStopProduction)return reject(new DOMException('Interrompido','AbortError'));if(v.ended||(Number.isFinite(v.duration)&&v.currentTime>=v.duration-.08))return resolve();if(performance.now()-began>limit)return reject(new Error('Trecho travou: '+file.name));if(v.readyState>=2&&v.videoWidth){ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);const sc=Math.min(W/v.videoWidth,H/v.videoHeight),w=v.videoWidth*sc,h=v.videoHeight*sc;ctx.drawImage(v,(W-w)/2,(H-h)/2,w,h)}requestAnimationFrame(draw)}draw()});
   clean();await new Promise(r=>setTimeout(r,vsIOS?90:25));
  }
 }catch(err){
  // Guarde o erro, mas finalize TODOS os recursos antes de devolvê-lo. No Safari,
  // deixar um AudioContext/MediaRecorder antigo vivo impede o próximo item da fila.
  var renderErr=err;
 }finally{
  clean();
  try{if(rec.state!=='inactive')rec.stop()}catch(e){}
  try{await Promise.race([stopped,new Promise(r=>setTimeout(r,1500))])}catch(e){}
  try{cs.getTracks().forEach(t=>t.stop())}catch(e){}
  try{out.getTracks().forEach(t=>t.stop())}catch(e){}
  if(ownsAC){try{await ac.close()}catch(e){}}
  vsActiveRecorder=null;vsActiveVideo=null;
 }
 if(renderErr)throw renderErr;
 if(!chunks.length)throw new Error('Nenhum dado de vídeo foi produzido.');
 return {blob:new Blob(chunks,{type:mime||rec.mimeType}),ext:fmt.ext};
}
async function produceAll(){
 let list=combos();if(!list.length)return alert('Adicione pelo menos 1 Gancho, 1 Corpo e 1 CTA.');
 vsStopProduction=false;
 results=list.map(x=>({...x,url:null}));show('results',document.querySelector('[data-page=results]'));renderResults();
 $('productionStatus').classList.remove('hidden');let started=Date.now();
 const stopBtn=$('stopGeneration320');if(stopBtn){stopBtn.classList.remove('hidden');stopBtn.disabled=false}
 for(let i=0;i<results.length;i++){
   if(vsStopProduction)break;
   $('prodTitle').textContent=`Seu vídeo está sendo gerado • ${i+1}/${results.length}`;
   let elapsed=(Date.now()-started)/1000,avg=i?elapsed/i:0,remain=Math.round(avg*(results.length-i));
   $('prodEta').textContent=i?`Tempo estimado restante: ~${Math.max(1,Math.ceil(remain/60))} min`:'Calculando tempo após o primeiro vídeo...';
   $('prodPercent').textContent=Math.round(i/results.length*100)+'%';$('prodBar').style.width=(i/results.length*100)+'%';
   try{let out=await renderCombo(results[i],i,results.length);results[i].url=URL.createObjectURL(out.blob);results[i].ext=out.ext}
   catch(e){if(e.name!=='AbortError')results[i].error=e.message}
   renderResults();if(!vsStopProduction)await wait(30)
 }
 if(vsStopProduction){
   $('prodTitle').textContent='■ Geração interrompida';
   $('prodEta').textContent=`${results.filter(x=>x.url).length} vídeo(s) concluído(s) antes de parar`;
   $('prodDetail').textContent='A fila restante foi cancelada. Os vídeos já concluídos continuam disponíveis.';
 }else{
   $('prodTitle').textContent='✓ Produção concluída';$('prodEta').textContent=`${results.filter(x=>x.url).length} vídeos prontos`;$('prodPercent').textContent='100%';$('prodBar').style.width='100%';$('prodDetail').textContent='Você já pode assistir ou baixar os resultados.'
 }
 if(stopBtn){stopBtn.disabled=true;stopBtn.classList.add('hidden')}
}
function watchResult(i){let x=results[i];if(!x||!x.url)return;let card=$('result_'+i);let old=card.querySelector('video');if(old){old.remove();return}let v=document.createElement('video');v.className='videoPreview';v.controls=true;v.autoplay=true;v.src=x.url;card.firstElementChild.appendChild(v)}
$('previewOne').onclick=async()=>{let list=combos();if(!list.length)return alert('Adicione Gancho, Corpo e CTA.');let old=qty;qty=1;await produceAll();qty=old};
function renderLibrary(){let n=files.h.length+files.b.length+files.c.length,el=$('libraryList');if(!n){el.className='empty';el.textContent='Nenhum produto carregado.';return}el.className='';el.innerHTML=`<div class="resultItem"><div><b>${$('product').value||'Produto sem nome'}</b><small style="display:block;color:#6f7b8d">${files.h.length} Ganchos • ${files.b.length} Corpos • ${files.c.length} CTAs</small></div><span class="tag green">SESSÃO ATUAL</span></div>`}
$('product').oninput=renderLibrary;$('clearAll').onclick=()=>{['hooks','bodies','ctas'].forEach(id=>$(id).value='');files={h:[],b:[],c:[]};results=[];sync();$('analysis').classList.add('hidden')};


function loadProfilePhoto(){
 const photo=localStorage.getItem('vs_profile_photo');
 if(photo){
  $('profilePhoto').src=photo;$('profilePhoto').classList.remove('hidden');$('profileAvatar').classList.add('hidden');
  $('sidePhoto').src=photo;$('sidePhoto').classList.remove('hidden');$('sideAvatar').classList.add('hidden');$('removeProfilePhoto')?.classList.remove('hidden');
 }else{
  $('profilePhoto').classList.add('hidden');$('profileAvatar').classList.remove('hidden');
  $('sidePhoto').classList.add('hidden');$('sideAvatar').classList.remove('hidden');$('removeProfilePhoto')?.classList.add('hidden');
 }
}
async function saveProfilePhoto(file){
 if(!file||!file.type.startsWith('image/'))return alert('Escolha uma imagem JPG, PNG ou WEBP.');
 if(file.size>8*1024*1024)return alert('Escolha uma foto de até 8 MB.');
 const img=new Image(), url=URL.createObjectURL(file);
 await new Promise((res,rej)=>{img.onload=res;img.onerror=rej;img.src=url});
 const c=document.createElement('canvas'),size=360;c.width=size;c.height=size;const x=c.getContext('2d');
 const scale=Math.max(size/img.width,size/img.height),w=img.width*scale,h=img.height*scale;
 x.drawImage(img,(size-w)/2,(size-h)/2,w,h);URL.revokeObjectURL(url);
 const data=c.toDataURL('image/jpeg',.82);localStorage.setItem('vs_profile_photo',data);loadProfilePhoto();
}
function renderProfile(){
 if(!user||!$('profileName'))return;loadProfilePhoto();
 let n=user.name||'Cliente Viral Studio', initial=n.trim()[0]?.toUpperCase()||'C';
 $('profileAvatar').textContent=initial;$('profileName').textContent=n;$('profileEmail').textContent=user.email;
 $('infoName').textContent=n;$('infoEmail').textContent=user.email;$('infoCreated').textContent=user.created||'—';$('infoId').textContent=user.customerId||'—';
 $('profilePlan').textContent=user.plan;$('profileStatus').textContent=user.role==='admin'?'● ADMIN':'● ATIVO';
 $('profileRenewal').textContent=user.role==='admin'?'Acesso sem vencimento':`Validade demonstrativa: ${user.days} dias`;
 $('profileVideos').textContent=results.filter(x=>x.url).length;$('profileCombos').textContent=files.h.length*files.b.length*files.c.length;
}
$('editProfile').onclick=()=>{
 let n=prompt('Como você quer que seu nome apareça?',user.name||'');
 if(!n||!n.trim())return;user.name=n.trim();$('sideName').textContent=user.name;$('sideAvatar').textContent=user.name[0].toUpperCase();renderProfile();
};
$('changePassword').onclick=()=>alert('Na versão comercial, enviaremos um link seguro para alterar a senha. A senha não ficará salva dentro da extensão.');
$('managePlan').onclick=()=>alert('Esta área será conectada ao portal de assinatura quando ligarmos o checkout/backend.');
$('logoutEverywhere').onclick=()=>$('logout').click();

$('profilePhotoInput').onchange=async e=>{let f=e.target.files?.[0];if(f)await saveProfilePhoto(f);e.target.value=''};
$('profilePhoto').onclick=()=>$('profilePhotoInput').click();

function isProAnnual(){return user && (user.role==='admin'||/anual/i.test(String(user.plan||'')))}
function isQuarterlyOrAnnual(){return user && (user.role==='admin'||/trimestral|anual/i.test(String(user.plan||'')))}
function renderAiAccess(){
 if(!$('aiLocked')||!user)return;
 const ok=isProAnnual();$('aiLocked').classList.toggle('hidden',ok);$('aiContent').classList.toggle('hidden',!ok);
 $('aiCredits').textContent=ok?'500':'0';
}
document.querySelectorAll('.aiTab').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.aiTab').forEach(x=>x.classList.remove('active'));b.classList.add('active');
 document.querySelectorAll('.aiPane').forEach(x=>x.classList.add('hidden'));$('ai-'+b.dataset.ai).classList.remove('hidden');
});
$('upgradeAnnual').onclick=()=>alert('Na versão comercial este botão abrirá o checkout do Viral Studio PRO Anual — R$ 297,90/ano.');
function fakeAi(kind){
 if(!isProAnnual())return;
 if(kind==='script'){
  const p=($('scriptProduct').value||'um produto campeão').trim(), d=($('scriptDetails').value||'praticidade, qualidade e benefício no dia a dia').trim();
  $('scriptOutput').textContent=`GANCHO (0–3s)\n“Olha isso antes de escolher ${p}: tem um detalhe que faz muita diferença no uso.”\n\nCORPO\nMostre ${p} logo no início, aproxime a câmera e demonstre na prática. Destaque: ${d}. Transforme características em benefícios reais e evite promessas que o produto não comprova.\n\nCTA\n“Se fez sentido para você, confira os detalhes e a oferta disponível no carrinho.”`;
 } else if(kind==='video'){
  const idea=($('videoIdea').value||'produto sendo demonstrado em situação real').trim();
  $('videoOutput').textContent=`PROMPT\nVídeo vertical 9:16 para social commerce. ${idea}. Abrir com o produto visível nos primeiros segundos; demonstração natural e realista; close no material e nos detalhes; câmera suave; iluminação natural; mãos e movimentos coerentes; sem textos deformados; sem inventar funcionalidades; finalizar com enquadramento limpo do produto.`;
 } else if(kind==='image'){
  const q=($('imagePrompt').value||'produto em cenário comercial realista').trim();
  $('imageOutput').textContent=`PROMPT PREPARADO\n${q}. Fotografia comercial realista, produto fiel à referência, materiais e proporções coerentes, iluminação natural, composição vertical para social commerce.\n\nA geração externa de imagem ainda requer um modelo/API conectado ao backend.`;
 } else {
  const t=($('voiceText').value||'Conheça este produto e veja os detalhes disponíveis na oferta.').trim();
  $('voiceOutput').textContent='Voz preparada no dispositivo. Clique em ▶ OUVIR para escutar.\n\n'+t;
 }
}
document.querySelectorAll('.aiGenerate').forEach(b=>b.onclick=()=>fakeAi(b.dataset.kind));

$('runCheck').onclick=()=>{
 const text=($('checkText').value||'').toLowerCase();
 const checks=['cProduct','cDemo','cMatch','cRights','cAi','cCta'];
 let score=checks.filter(id=>$(id).checked).length;
 const risky=['garantido','100% garantido','cura','milagre','resultado certo','sem risco','nunca falha'];
 const found=risky.filter(x=>text.includes(x));
 let issues=[];
 if(!$('cProduct').checked)issues.push('Mostre o produto claramente e cedo no vídeo.');
 if(!$('cDemo').checked)issues.push('Inclua demonstração ou uso real quando fizer sentido.');
 if(!$('cMatch').checked)issues.push('Confirme que produto, variação, quantidade e acessórios correspondem à oferta.');
 if(!$('cRights').checked)issues.push('Confirme autorização/direitos dos vídeos, imagens, músicas e materiais usados.');
 if(!$('cAi').checked)issues.push('Revise conteúdo de IA para não inventar funções, aparência ou resultados.');
 if(!$('cCta').checked)issues.push('Inclua um CTA claro e compatível com a oferta.');
 if(found.length)issues.push('Revise possíveis promessas absolutas no texto: '+found.join(', ')+'.');
 const pct=Math.round(score/6*100);
 $('checkResult').classList.remove('hidden');
 $('checkResult').innerHTML=`<div class="checkScore"><strong>${pct}%</strong><span>checklist concluído</span></div><h3>${issues.length?'Pontos para revisar':'Checklist preenchido'}</h3><ul>${issues.map(x=>`<li>${x}</li>`).join('')||'<li>Nenhum alerta básico encontrado neste checklist. Isso não garante aprovação pela plataforma.</li>'}</ul><small>Ferramenta preventiva baseada em boas práticas. A moderação e as regras finais pertencem ao TikTok.</small>`;
};

// Voz local gratuita via Web Speech API (usa as vozes disponíveis no sistema/navegador)
let localVoices=[];
function loadLocalVoices(){
 localVoices=speechSynthesis.getVoices();
 if(!$('voiceSelect'))return;
 $('voiceSelect').innerHTML='';
 localVoices.forEach((v,i)=>{let o=document.createElement('option');o.value=i;o.textContent=`${v.name} — ${v.lang}`;$('voiceSelect').appendChild(o)});
 const pt=localVoices.findIndex(v=>String(v.lang).toLowerCase().startsWith('pt-br'));
 if(pt>=0)$('voiceSelect').value=pt;
}
if('speechSynthesis' in window){loadLocalVoices();speechSynthesis.onvoiceschanged=loadLocalVoices}
$('playVoice').onclick=()=>{
 if(!('speechSynthesis' in window))return alert('Este navegador não disponibiliza síntese de voz.');
 const text=($('voiceText').value||'Conheça este produto e veja os detalhes disponíveis na oferta.').trim();
 speechSynthesis.cancel(); const u=new SpeechSynthesisUtterance(text);
 const v=localVoices[Number($('voiceSelect').value)]; if(v)u.voice=v;
 u.rate=Number($('voiceRate').value);u.pitch=Number($('voicePitch').value);u.lang=v?.lang||'pt-BR';
 speechSynthesis.speak(u);$('voiceOutput').textContent='▶ Reproduzindo voz local...\\n\\n'+text;
};
$('stopVoice').onclick=()=>speechSynthesis.cancel();

$('imageReference').onchange=e=>{
 const f=e.target.files?.[0]; if(!f)return;
 if(!f.type.startsWith('image/'))return alert('Selecione uma imagem válida.');
 const url=URL.createObjectURL(f);
 $('imageReferencePreview').innerHTML=`<img src="${url}" alt="Referência"><span>${f.name}</span>`;
};

let gcUrl=null;
$('gcMedia').onchange=e=>{const f=e.target.files?.[0];if(!f)return;if(gcUrl)URL.revokeObjectURL(gcUrl);gcUrl=URL.createObjectURL(f);$('gcMediaPreview').innerHTML=f.type.startsWith('image/')?`<img src="${gcUrl}"><span>${f.name}</span>`:`<video src="${gcUrl}" controls muted></video><span>${f.name}</span>`};
function gcBuild(){
 const p=($('gcProduct').value||'este produto').trim(),b=($('gcBenefits').value||'praticidade, qualidade e facilidade no dia a dia').trim(),s=$('gcStyle').value,d=+$('gcDuration').value;
 const hooks=[`Olha esse detalhe de ${p} antes de escolher o seu.`,`Se você usa ${p}, presta atenção nisso.`,`Eu não esperava esse detalhe de ${p}.`], hook=hooks[Math.floor(Math.random()*hooks.length)];
 const body=`Mostre ${p} em uso e destaque ${b}. Foque somente no que pode ser visto ou comprovado.`,cta='Se gostou, confira os detalhes e a oferta disponível no carrinho.';
 $('gcScript').textContent=`GANCHO\n${hook}\n\nCORPO\n${body}\n\nCTA\n${cta}`;$('gcVoiceText').textContent=`${hook} ${body} ${cta}`;$('gcTitle').textContent=`${p} · ${s} · ${d}s`;
 const n=d<=8?3:d<=15?5:8;let a=[];for(let i=0;i<n;i++){let x=Math.round(i*d/n),y=Math.round((i+1)*d/n),q=i===0?'Produto visível + gancho':i===n-1?'Produto + CTA':i%2?'Close em detalhe':'Demonstração em uso';a.push(`<div class="sceneRow"><b>${x}–${y}s</b><span>${q}</span></div>`)}$('gcScenes').innerHTML=a.join('');$('gcResult').classList.remove('hidden');$('gcResult').scrollIntoView({behavior:'smooth'});
}
$('gcCreate').onclick=()=>{$('gcProgress').classList.remove('hidden');$('gcResult').classList.add('hidden');$('gcBar').style.width='20%';$('gcStatus').textContent='Analisando projeto...';setTimeout(()=>{$('gcBar').style.width='65%';$('gcStatus').textContent='Criando roteiro e cenas...'},250);setTimeout(()=>{$('gcBar').style.width='100%';$('gcStatus').textContent='Pronto';gcBuild()},650)};
$('gcAgain').onclick=gcBuild;
$('gcCopy').onclick=async()=>{await navigator.clipboard.writeText($('gcScript').textContent);$('gcCopy').textContent='✓ COPIADO';setTimeout(()=>$('gcCopy').textContent='COPIAR',1000)};
$('gcPlay').onclick=()=>{if(!('speechSynthesis'in window))return alert('Voz indisponível.');speechSynthesis.cancel();let u=new SpeechSynthesisUtterance($('gcVoiceText').textContent),v=speechSynthesis.getVoices().find(v=>v.lang.toLowerCase().startsWith('pt-br'));if(v)u.voice=v;u.lang='pt-BR';speechSynthesis.speak(u)};
$('gcStop').onclick=()=>speechSynthesis.cancel();

const hookBanks={
 'Moda / Roupa':['Olha como essa peça veste no corpo.','O detalhe dessa peça que muda o look é esse.','Antes de escolher seu tamanho, olha o caimento.'],
 'Calçados':['Olha como esse modelo fica no pé.','Antes de escolher seu próximo calçado, olha esse detalhe.','O acabamento desse modelo me chamou atenção.'],
 'Relógio / Eletrônicos':['Olha essa função antes de escolher o seu.','Eu testaria isso primeiro nesse produto.','O detalhe mais útil no dia a dia é esse.'],
 'Beleza':['Olha a aplicação e a textura de perto.','Antes de usar, olha como esse produto é aplicado.','O detalhe que eu observaria nesse produto é esse.'],
 'Casa / Cozinha':['Olha isso funcionando na prática.','Se você usa isso no dia a dia, olha esse detalhe.','Vou mostrar como isso funciona sem enrolação.'],
 'Ferramentas':['Olha essa ferramenta trabalhando na prática.','Antes de escolher uma ferramenta dessas, olha isso.','O que importa aqui é ver funcionando.'],
 'Outro':['Olha esse detalhe antes de escolher o seu.','Vou mostrar esse produto na prática.','Antes de comprar, presta atenção nisso.']
};
function currentCategory(){let c=$('gcCategory')?.value||'Outro';return c==='Automático'?'Outro':c}
function safeText(t){return t.replace(/\b(garantido|milagre|cura|resultado certo|100% garantido)\b/gi,'[REVISAR: $1]')}
const oldGcBuild=gcBuild;
gcBuild=function(){
 oldGcBuild();
 const p=($('gcProduct').value||'este produto').trim(),cat=currentCategory(),bank=hookBanks[cat]||hookBanks.Outro;
 let hook=bank[Math.floor(Math.random()*bank.length)];
 const benefits=($('gcBenefits').value||'qualidade, acabamento e uso no dia a dia').trim();
 let body=`Mostre ${p} em uso, faça closes e destaque ${benefits}. Transforme características em benefícios que possam ser demonstrados.`;
 let cta='Se fez sentido para você, confira os detalhes e a oferta disponível no carrinho.';
 let out=`GANCHO\n${hook}\n\nCORPO\n${body}\n\nCTA\n${cta}`;
 if($('gcSafe')?.checked)out=safeText(out);
 $('gcScript').textContent=out;$('gcVoiceText').textContent=out.replace(/GANCHO|CORPO|CTA/g,' ');
 vsBuild180(); vsBuildFullScript();
};
$('gcPreviewSource').onclick=()=>{const f=$('gcMedia').files?.[0];if(!f)return alert('Envie um vídeo primeiro.');if(!f.type.startsWith('video/'))return alert('A prévia de vídeo precisa de um arquivo de vídeo.');window.open(gcUrl,'_blank')};

let finalUrl=null;
$('gcAudioVolume').oninput=()=>{$('gcAudioVolumeLabel').textContent=Math.round(+$('gcAudioVolume').value*100)+'%'};

async function renderVideoWithAudio(){
 const f=$('gcMedia').files?.[0];
 if(!f)return alert('Envie um vídeo do produto primeiro.');
 if(!f.type.startsWith('video/'))return alert('Para renderizar, envie um arquivo de vídeo.');
 if(!vsRiskCheck() && !confirm('Foi detectado um sinal de alto risco. Recomendamos corrigir antes de renderizar. Continuar mesmo assim?'))return;

 $('gcRenderProgress').classList.remove('hidden');
 $('gcRenderBar').style.width='5%';$('gcRenderStatus').textContent='Preparando vídeo e áudio...';

 const v=document.createElement('video');
 v.src=gcUrl; v.playsInline=true; v.crossOrigin='anonymous'; v.preload='auto';
 await new Promise((ok,er)=>{v.onloadedmetadata=ok;v.onerror=()=>er(new Error('Não foi possível abrir o vídeo.'))});

 const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280;
 const ctx=canvas.getContext('2d',{alpha:false});
 const canvasStream=canvas.captureStream(30);

 // Captura o áudio REAL do arquivo via Web Audio e mistura no stream final.
 const AC=window.AudioContext||window.webkitAudioContext;
 let ac=null, source=null, gain=null, destination=null, audioTracks=[];
 const keepAudio=$('gcKeepAudio').checked;
 if(keepAudio && AC){
   ac=new AC(); await ac.resume();
   source=ac.createMediaElementSource(v);
   gain=ac.createGain(); gain.gain.value=+$('gcAudioVolume').value;
   destination=ac.createMediaStreamDestination();
   source.connect(gain); gain.connect(destination);
   // Não conectar ao speakers durante render: evita eco/duplicação.
   audioTracks=destination.stream.getAudioTracks();
 }
 const mixed=new MediaStream([...canvasStream.getVideoTracks(),...audioTracks]);

 let mime='video/webm;codecs=vp9,opus';
 if(!MediaRecorder.isTypeSupported(mime))mime='video/webm;codecs=vp8,opus';
 if(!MediaRecorder.isTypeSupported(mime))mime='video/webm';
 const rec=new MediaRecorder(mixed,{mimeType:mime,videoBitsPerSecond:5000000,audioBitsPerSecond:160000});
 let chunks=[];rec.ondataavailable=e=>{if(e.data&&e.data.size)chunks.push(e.data)};
 const stopped=new Promise(ok=>rec.onstop=ok);
 rec.start(400);

 v.currentTime=0; v.muted=false; v.volume=1;
 await v.play();
 const title=($('gcProduct').value||'Produto').trim(),cta='Confira no carrinho';

 await new Promise(resolve=>{
  function draw(){
   if(v.ended || v.currentTime>=v.duration-.03){resolve();return}
   const scale=Math.max(720/v.videoWidth,1280/v.videoHeight),w=v.videoWidth*scale,hh=v.videoHeight*scale;
   ctx.fillStyle='#000';ctx.fillRect(0,0,720,1280);ctx.drawImage(v,(720-w)/2,(1280-hh)/2,w,hh);
   ctx.fillStyle='rgba(0,0,0,.58)';ctx.fillRect(28,35,664,92);
   ctx.fillStyle='#fff';ctx.font='700 34px Arial';ctx.textAlign='left';ctx.fillText(title.slice(0,32),52,91);
   ctx.fillStyle='#ff603b';ctx.fillRect(70,1150,580,78);ctx.fillStyle='#fff';ctx.font='700 29px Arial';ctx.textAlign='center';ctx.fillText(cta,360,1200);ctx.textAlign='left';
   $('gcRenderBar').style.width=Math.min(98,Math.round(v.currentTime/Math.max(v.duration,.1)*100))+'%';
   $('gcRenderStatus').textContent=`Renderizando vídeo + áudio: ${Math.round(v.currentTime)}s / ${Math.round(v.duration)}s`;
   requestAnimationFrame(draw);
  } draw();
 });
 v.pause();rec.stop();await stopped;
 canvasStream.getTracks().forEach(t=>t.stop());mixed.getTracks().forEach(t=>t.stop());
 if(ac)await ac.close();

 if(!chunks.length)throw new Error('O navegador não gerou dados do vídeo.');
 const blob=new Blob(chunks,{type:mime});
 if(finalUrl)URL.revokeObjectURL(finalUrl); finalUrl=URL.createObjectURL(blob);
 $('gcFinalVideo').src=finalUrl;$('gcFinalVideo').muted=false;$('gcFinalVideo').volume=1;$('gcFinalVideo').classList.remove('hidden');
 $('gcDownload').href=finalUrl;$('gcDownload').download=`viral-studio-${Date.now()}.webm`;$('gcDownload').classList.remove('hidden');
 $('gcRenderBar').style.width='100%';
 $('gcRenderStatus').textContent=keepAudio?'✓ Vídeo pronto COM áudio original':'✓ Vídeo pronto sem áudio (opção escolhida)';
}
$('gcRender').onclick=()=>renderVideoWithAudio().catch(e=>{console.error(e);$('gcRenderStatus').textContent='Erro: '+e.message;alert('Não foi possível renderizar: '+e.message)});


function vsRiskCheck(){
 const script=($('gcScript')?.textContent||'').toLowerCase();
 const product=($('gcProduct')?.value||'').trim();
 const benefits=($('gcBenefits')?.value||'').toLowerCase();
 const f=$('gcMedia')?.files?.[0];
 let high=[],warn=[],ok=[];
 const highPatterns=[
  [/\b(cura|cura garantida|milagre)\b/,'Possível alegação médica/resultado proibido.'],
  [/\b100%\s*garantid|\bresultado certo\b|\bnunca falha\b/,'Promessa absoluta ou garantia de resultado.'],
  [/\bcompre (no|pelo) (whatsapp|instagram|site|link da bio)\b/,'Possível redirecionamento de compra para fora do TikTok Shop.']
 ];
 highPatterns.forEach(([r,msg])=>{if(r.test(script+' '+benefits))high.push(msg)});
 if(!product)warn.push('Nome do produto não informado.');
 if(!f)warn.push('Nenhuma mídia real do produto foi anexada.');
 else if(f.type.startsWith('image/'))warn.push('Somente imagem anexada: vídeo estático pode ter risco de baixa qualidade.');
 else ok.push('Vídeo do produto anexado.');
 if(!/carrinho|oferta|detalhes/.test(script))warn.push('CTA de compra não identificado.');
 else ok.push('CTA identificado.');
 if(script.length<90)warn.push('Roteiro muito curto; confirme se há demonstração e informação suficiente.');
 else ok.push('Roteiro com estrutura de promoção.');
 if(/\[revisar:/.test(script))high.push('O próprio roteiro contém termo marcado para revisão.');
 const badge=$('riskBadge'), reasons=$('riskReasons'); badge.className='riskBadge';
 let label,sub;
 if(high.length){badge.classList.add('riskRed');label='ALTO RISCO DETECTADO';sub='Não publique antes de revisar estes pontos.'}
 else if(warn.length){badge.classList.add('riskYellow');label='ATENÇÃO / REVISAR';sub='Há pontos que podem aumentar o risco.'}
 else{badge.classList.add('riskGreen');label='NENHUM RISCO VERIFICADO DETECTADO';sub='Faça também a checagem oficial disponível na sua conta.'}
 badge.innerHTML=`<i></i><div><b>${label}</b><small>${sub}</small></div>`;
 reasons.innerHTML=[...high.map(x=>`<div class="rr bad">✕ ${x}</div>`),...warn.map(x=>`<div class="rr warn">! ${x}</div>`),...ok.map(x=>`<div class="rr good">✓ ${x}</div>`)].join('');
 return !high.length;
}
$('riskCheck').onclick=vsRiskCheck;
const prevRender=$('gcRender').onclick;
$('gcRender').onclick=async()=>{if(!vsRiskCheck()){if(!confirm('Foi detectado um sinal de alto risco. Recomendamos corrigir antes de renderizar. Continuar mesmo assim?'))return;}return prevRender()};

// V3.4 — limite comercial de roteiro: máximo 180 caracteres (texto falado)
function vsLimit180(text){
 text=String(text||'').replace(/\s+/g,' ').trim();
 if(text.length<=180)return text;
 let cut=text.slice(0,180);
 const last=Math.max(cut.lastIndexOf('.'),cut.lastIndexOf('!'),cut.lastIndexOf('?'));
 if(last>=125)cut=cut.slice(0,last+1);
 else{
   const sp=cut.lastIndexOf(' ');
   if(sp>0)cut=cut.slice(0,sp);
   cut=cut.replace(/[,:;-]+$/,'').trim()+'.';
 }
 return cut.slice(0,180);
}
function vsBuild180(){
 const p=($('gcProduct')?.value||'esse produto').trim();
 const cat=currentCategory(), bank=hookBanks[cat]||hookBanks.Outro;
 const hook=bank[Math.floor(Math.random()*bank.length)].replace(/\.$/,'');
 const raw=($('gcBenefits')?.value||'praticidade e ótimo acabamento').replace(/\s+/g,' ').trim();
 const benefit=raw.length>72?raw.slice(0,69).replace(/\s+\S*$/,'')+'...':raw;
 let spoken=`${hook}. ${benefit}. Gostou? Confira no carrinho.`;
 if($('gcSafe')?.checked)spoken=safeText(spoken);
 spoken=vsLimit180(spoken);
 $('gcScript').textContent=spoken;
 $('gcVoiceText').textContent=spoken;
 const counter=document.getElementById('gcCharCount');
 if(counter){counter.textContent=`${spoken.length}/180 caracteres`;counter.className='char180 ok'}
}


// V3.6 — Central de Conteúdo: implementações próprias, inspiradas em formatos de criação.
let hubTool='supremo';
const hubNames={supremo:'🚀 Venda Supremo',reels:'🎬 Mestre dos Reels',express:'⚡ Copy Express',bio:'👤 Bio Magnética',dance:'💃 Ideias de Movimento',copy:'✍️ Copy de Produto',finds:'🛍️ Achadinhos',image:'📸 Imagem Ultrarrrealista'};
document.querySelectorAll('.hubCard').forEach(b=>b.onclick=()=>{
 document.querySelectorAll('.hubCard').forEach(x=>x.classList.remove('active'));b.classList.add('active');hubTool=b.dataset.tool;
 $('hubTitle').textContent=hubNames[hubTool];$('hubImageFields').classList.toggle('hidden',hubTool!=='image');
});
document.querySelectorAll('[data-page="contentHub"]').forEach(b=>b.addEventListener('click',()=>{
 document.querySelectorAll('.page').forEach(x=>x.classList.add('hidden'));$('contentHub').classList.remove('hidden');
}));
function hubPick(a){return a[Math.floor(Math.random()*a.length)]}
function hub180(t){return vsLimit180(t.replace(/\s+/g,' ').trim())}
function hubData(){
 return {p:($('hubProduct').value||'esse produto').trim(),b:($('hubBenefits').value||'praticidade, bom acabamento e facilidade no dia a dia').trim(),a:($('hubAudience').value||'quem procura praticidade').trim(),c:$('hubCategory').value,t:$('hubTone').value,s:($('hubScene')?.value||'cenário limpo, iluminação natural e produto em destaque').trim()}
}
function hubGenerate(){
 const d=hubData(); let o='';
 const hooks=['Presta atenção nisso aqui','Olha esse achado','Se você gosta de praticidade, olha isso','Eu precisava mostrar isso','Olha como isso funciona na prática'];
 if(hubTool==='express'){
 const gh=vsLimitN(`${hubPick(hooks)}: ${d.p}. Se você procura praticidade, presta atenção nisso até o final.`,180);
 const bd=vsLimitN(`${d.b}. Veja os detalhes e como esse produto pode ser usado na prática.`,180);
 const ct=vsLimitN(`Gostou? Toque no carrinho e confira os detalhes e a oferta disponível para ${d.p}.`,180);
 o=`GANCHO (${gh.length}/180)\n${gh}\n\nCORPO (${bd.length}/180)\n${bd}\n\nCTA (${ct.length}/180)\n${ct}`;
}
 if(hubTool==='reels')o=`GANCHO 0–3s: ${hubPick(hooks)}.\nCORPO 3–10s: Mostre ${d.p} em uso e destaque: ${d.b}.\nCTA 10–15s: “Gostou? Confira os detalhes no carrinho.”\n\nFALA: ${hub180(`${hubPick(hooks)}. ${d.p}: ${d.b}. Confira no carrinho.`)}`;
 if(hubTool==='supremo')o=`ROTEIRO: ${hub180(`${hubPick(hooks)}. ${d.p}: ${d.b}. Confira no carrinho.`)}\n\nCENAS:\n1. Close rápido no produto.\n2. Demonstração real do principal benefício.\n3. Detalhe visual/acabamento.\n4. Produto em uso + CTA.\n\nTEXTO NA TELA: “Olha esse achado 👀”`;
 if(hubTool==='bio')o=`Opção 1: Conteúdo sobre ${d.c} ✨\nAchados, dicas e novidades\n👇 Confira meus conteúdos\n\nOpção 2: ${d.c} sem complicação\nConteúdo novo por aqui ✨\n👇 Veja os destaques`;
 if(hubTool==='dance')o=`SEQUÊNCIA DE MOVIMENTO PARA ${d.p.toUpperCase()}:\n1. Entre no quadro segurando/mostrando o produto.\n2. Aproxime o produto da câmera.\n3. Faça giro lateral ou mudança de ângulo.\n4. Mostre um detalhe com a mão.\n5. Afaste e revele o produto completo.\n6. Finalize apontando para a área do carrinho.\n\nUse movimentos naturais e compatíveis com o produto; não invente funções.`;
 if(hubTool==='copy')o=`VERSÃO 1: ${hub180(`${hubPick(hooks)}. ${d.p} tem ${d.b}. Confira no carrinho.`)}\n\nVERSÃO 2: ${hub180(`Você também procura ${d.b}? Dá uma olhada em ${d.p}. Veja os detalhes no carrinho.`)}\n\nVERSÃO 3: ${hub180(`Olha ${d.p} em uso. ${d.b}. Se fizer sentido pra você, confira no carrinho.`)}`;
 if(hubTool==='finds')o=`TÍTULO: Achadinho que vale conhecer 👀\nROTEIRO: ${hub180(`Olha esse achado: ${d.p}. ${d.b}. Quer ver mais detalhes? Confira no carrinho.`)}\nCENA: comece com close, demonstre o uso e termine mostrando o produto inteiro.`;
 if(hubTool==='image')o=`PROMPT DE IMAGEM:\nFotografia publicitária ultrarrealista de ${d.p}. ${d.s}. Preservar fielmente formato, cores, logotipo, textura e detalhes reais do produto de referência. Composição vertical 9:16, iluminação fotográfica natural, textura realista, profundidade de campo sutil, alta nitidez no produto, sem texto, sem alterar características do item. Contexto: ${d.c}.`;
 $('hubOutput').textContent=o;$('hubOutputWrap').classList.remove('hidden');$('hubCount').textContent=o.length+' caracteres';
}
$('hubGenerate').onclick=hubGenerate;$('hubVariation').onclick=hubGenerate;
$('hubCopy').onclick=async()=>{await navigator.clipboard.writeText($('hubOutput').textContent);$('hubCopy').textContent='✓ COPIADO';setTimeout(()=>$('hubCopy').textContent='📋 COPIAR',1200)};


// V3.7 — roteiro completo por blocos: Gancho até 180 + Corpo até 100 + CTA até 100.
function vsLimitN(text,n){
 text=String(text||'').replace(/\s+/g,' ').trim();
 if(text.length<=n)return text;
 let cut=text.slice(0,n), sp=cut.lastIndexOf(' ');
 if(sp>Math.floor(n*.72))cut=cut.slice(0,sp);
 return cut.replace(/[,:;\- ]+$/,'').trim()+'.';
}
function vsBuildFullScript(){
 const product=($('gcProduct')?.value||'esse produto').trim();
 const cat=currentCategory(), bank=hookBanks[cat]||hookBanks.Outro;
 const benefits=($('gcBenefits')?.value||'praticidade e ótimo acabamento').replace(/\s+/g,' ').trim();
 const hook=vsLimitN(`${bank[Math.floor(Math.random()*bank.length)]} ${product}. Se você procura algo que chame atenção e seja útil no dia a dia, olha isso até o final.`,180);
 const body=vsLimitN(`${benefits}. Olha os detalhes e como ${product} funciona na prática.`,180);
 const cta=vsLimitN(`Gostou? Toque no carrinho e confira os detalhes e a oferta disponível para ${product}.`,180);
 const full=`GANCHO (${hook.length}/180)\n${hook}\n\nCORPO (${body.length}/180)\n${body}\n\nCTA (${cta.length}/180)\n${cta}`;
 $('gcScript').textContent=full;
 $('gcVoiceText').textContent=`${hook} ${body} ${cta}`;
 const counter=document.getElementById('gcCharCount');
 if(counter)counter.textContent=`Gancho ${hook.length}/180 • Corpo ${body.length}/180 • CTA ${cta.length}/180`;
}


// V3.9 — variações de roteiro para o mesmo vídeo + substituição por arquivo de voz gravável.
let gcVarScripts=[];
function gcMakeVariation(i){
 const product=($('gcProduct')?.value||'esse produto').trim();
 const cat=currentCategory(), bank=hookBanks[cat]||hookBanks.Outro;
 const benefits=($('gcBenefits')?.value||'praticidade e ótimo acabamento').replace(/\s+/g,' ').trim();
 const h=vsLimitN(`${bank[i%bank.length]} ${product}. ${['Olha isso até o final','Presta atenção nos detalhes','Veja como fica na prática'][i%3]}.`,180);
 const b=vsLimitN(`${benefits}. ${['Repara nos detalhes e no uso','Olha como funciona no dia a dia','Veja o acabamento e a demonstração'][i%3]}.`,180);
 const c=vsLimitN(`${['Gostou','Quer conferir','Se fez sentido pra você'][i%3]}? Toque no carrinho e veja os detalhes e a oferta disponível.`,180);
 return `${h} ${b} ${c}`;
}
function gcDrawVars(){
 const box=$('gcAudioVarList');box.innerHTML='';
 gcVarScripts.forEach((s,i)=>{
  const d=document.createElement('div');d.className='audioVarItem';
  d.innerHTML=`<div class="audioVarTop"><b>VARIAÇÃO ${i+1}</b><span>${s.length} caracteres</span></div><textarea>${s}</textarea><div class="miniBtns"><button data-act="listen">▶ OUVIR</button><button data-act="copy">📋 ROTEIRO</button><button data-act="use">✓ USAR</button></div>`;
  const ta=d.querySelector('textarea');ta.oninput=()=>gcVarScripts[i]=ta.value;
  d.querySelector('[data-act="listen"]').onclick=()=>{speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(ta.value);u.lang='pt-BR';speechSynthesis.speak(u)};
  d.querySelector('[data-act="copy"]').onclick=()=>navigator.clipboard.writeText(ta.value);
  d.querySelector('[data-act="use"]').onclick=()=>{$('gcVoiceText').textContent=ta.value;alert('Roteiro selecionado. Para gravá-lo no vídeo, importe abaixo o áudio gerado com essa fala.')};
  box.appendChild(d);
 });
}
$('gcGenerateAudioVars').onclick=()=>{const n=+$('gcAudioVars').value;gcVarScripts=Array.from({length:n},(_,i)=>gcMakeVariation(i));gcDrawVars()};
$('gcNewVoiceVolume').oninput=()=>{$('gcNewVoiceVolumeLabel').textContent=Math.round(+$('gcNewVoiceVolume').value*100)+'%'};

async function gcRenderWithImportedVoice(){
 const vf=$('gcMedia').files?.[0], af=$('gcNewVoiceFile').files?.[0];
 if(!vf)return alert('Envie o vídeo base primeiro.');
 if(!af)return alert('Importe o novo áudio da fala primeiro.');
 $('gcRenderProgress').classList.remove('hidden');$('gcRenderStatus').textContent='Criando vídeo com a nova fala...';$('gcRenderBar').style.width='5%';
 const video=document.createElement('video'), audio=document.createElement('audio');
 video.src=URL.createObjectURL(vf);audio.src=URL.createObjectURL(af);video.preload=audio.preload='auto';
 await Promise.all([new Promise((ok,er)=>{video.onloadedmetadata=ok;video.onerror=er}),new Promise((ok,er)=>{audio.onloadedmetadata=ok;audio.onerror=er})]);
 const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280;const ctx=canvas.getContext('2d',{alpha:false}), cs=canvas.captureStream(30);
 const AC=window.AudioContext||window.webkitAudioContext, ac=new AC();await ac.resume();
 const srcA=ac.createMediaElementSource(audio), gain=ac.createGain(), dest=ac.createMediaStreamDestination();gain.gain.value=+$('gcNewVoiceVolume').value;srcA.connect(gain);gain.connect(dest);
 const stream=new MediaStream([...cs.getVideoTracks(),...dest.stream.getAudioTracks()]);
 let mime='video/webm;codecs=vp9,opus';if(!MediaRecorder.isTypeSupported(mime))mime='video/webm;codecs=vp8,opus';if(!MediaRecorder.isTypeSupported(mime))mime='video/webm';
 const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000,audioBitsPerSecond:160000}), chunks=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);const stop=new Promise(ok=>rec.onstop=ok);rec.start(400);
 video.muted=true;video.currentTime=0;audio.currentTime=0;await Promise.all([video.play(),audio.play()]);
 await new Promise(resolve=>{function draw(){if(video.ended){resolve();return}const sc=Math.max(720/video.videoWidth,1280/video.videoHeight),w=video.videoWidth*sc,hh=video.videoHeight*sc;ctx.drawImage(video,(720-w)/2,(1280-hh)/2,w,hh);$('gcRenderBar').style.width=Math.min(98,Math.round(video.currentTime/Math.max(video.duration,.1)*100))+'%';requestAnimationFrame(draw)}draw()});
 audio.pause();rec.stop();await stop;cs.getTracks().forEach(t=>t.stop());stream.getTracks().forEach(t=>t.stop());await ac.close();
 const blob=new Blob(chunks,{type:mime});if(finalUrl)URL.revokeObjectURL(finalUrl);finalUrl=URL.createObjectURL(blob);
 $('gcFinalVideo').src=finalUrl;$('gcFinalVideo').muted=false;$('gcFinalVideo').volume=1;$('gcFinalVideo').classList.remove('hidden');$('gcDownload').href=finalUrl;$('gcDownload').download=`viral-studio-nova-fala-${Date.now()}.webm`;$('gcDownload').classList.remove('hidden');$('gcRenderBar').style.width='100%';$('gcRenderStatus').textContent='✓ Novo vídeo pronto com a nova fala';
}
$('gcRenderNewVoice').onclick=()=>gcRenderWithImportedVoice().catch(e=>{console.error(e);alert('Erro ao criar o vídeo com a nova fala: '+(e.message||e))});


// V3.10 — Criar Vídeo é benefício exclusivo do PRO ANUAL (admin também acessa).
function vsCanCreateVideo(){
 try{
   if(typeof isQuarterlyOrAnnual==='function' && isQuarterlyOrAnnual()) return true;
   const u=JSON.parse(localStorage.getItem('vsUser')||localStorage.getItem('user')||'{}');
   return u.role==='admin'||/trimestral|anual/i.test(u.plan||'');
 }catch(e){return false}
}
function vsAnnualGate(){
 const page=document.getElementById('gcPage')||document.getElementById('generatorComplete')||document.querySelector('[data-creator-page]');
 if(!page)return;
 let gate=document.getElementById('annualVideoGate');
 if(vsCanCreateVideo()){
   if(gate)gate.remove();
   page.querySelectorAll('input,textarea,select,button').forEach(x=>{if(x.id!=='annualUpgrade')x.disabled=false});
   return;
 }
 if(!gate){
   gate=document.createElement('div');gate.id='annualVideoGate';gate.className='annualVideoGate';
   gate.innerHTML=`<div class="annualLockIcon">🔒</div><h2>CRIAR VÍDEO — TRIMESTRAL OU ANUAL</h2><p>O plano Mensal mantém este recurso bloqueado. Criar Vídeo é liberado nos planos Trimestral e Anual.</p><b>TRIMESTRAL • R$ 99,90 | PRO ANUAL • R$ 297,90/ano</b><button id="annualUpgrade">VER PLANOS COM CRIAR VÍDEO</button><small>O acesso é liberado quando uma assinatura Trimestral ou Anual estiver ativa.</small>`;
   page.prepend(gate);
 }
 page.querySelectorAll('input,textarea,select,button').forEach(x=>{if(x.id!=='annualUpgrade')x.disabled=true});
 document.getElementById('annualUpgrade')?.addEventListener('click',()=>alert('Conecte este botão ao checkout do plano PRO Anual na versão comercial.'));
}
document.querySelectorAll('[data-page]').forEach(b=>b.addEventListener('click',()=>setTimeout(vsAnnualGate,0)));
setTimeout(vsAnnualGate,150);


// V3.11 — roteiro escolhido -> voz local -> novo vídeo.
// Gratuito: captura o áudio da própria guia enquanto SpeechSynthesis fala.
let gcSelectedVar=0;
function gcLoadVoices(){
 const sel=$('gcAutoVoice'); if(!sel)return;
 const voices=speechSynthesis.getVoices().filter(v=>/^pt/i.test(v.lang));
 sel.innerHTML='';
 (voices.length?voices:speechSynthesis.getVoices()).forEach((v,i)=>{
   const o=document.createElement('option');o.value=v.voiceURI;o.textContent=`${v.name} — ${v.lang}`;sel.appendChild(o);
 });
}
gcLoadVoices(); speechSynthesis.onvoiceschanged=gcLoadVoices;
$('gcAutoRate').oninput=()=>{$('gcAutoRateLabel').textContent=(+$('gcAutoRate').value).toFixed(2)+'x'};

// Keep track of which generated variation the user selected.
const _oldDrawVars=gcDrawVars;
gcDrawVars=function(){
 _oldDrawVars();
 document.querySelectorAll('#gcAudioVarList .audioVarItem').forEach((d,i)=>{
   const use=d.querySelector('[data-act="use"]');
   if(use)use.addEventListener('click',()=>{gcSelectedVar=i;document.querySelectorAll('#gcAudioVarList .audioVarItem').forEach(x=>x.classList.remove('selectedVar'));d.classList.add('selectedVar')});
 });
};

async function gcAutoVideoFromScript(){
 const vf=$('gcMedia').files?.[0];
 if(!vf)return alert('Primeiro envie o vídeo original.');
 const text=(gcVarScripts[gcSelectedVar]||$('gcVoiceText')?.textContent||'').trim();
 if(!text)return alert('Gere e escolha um roteiro primeiro.');

 let capture;
 try{
   capture=await navigator.mediaDevices.getDisplayMedia({video:true,audio:true,preferCurrentTab:true,selfBrowserSurface:'include'});
 }catch(e){return alert('Para gerar gratuitamente, permita compartilhar esta guia e marque o áudio da guia.');}
 const at=capture.getAudioTracks();
 if(!at.length){capture.getTracks().forEach(t=>t.stop());return alert('O áudio da guia não foi compartilhado. Tente novamente e marque “Compartilhar áudio da guia”.');}

 const video=document.createElement('video');video.src=URL.createObjectURL(vf);video.preload='auto';video.playsInline=true;video.muted=true;
 await new Promise((ok,er)=>{video.onloadedmetadata=ok;video.onerror=er});
 const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280;
 const ctx=canvas.getContext('2d',{alpha:false}), cs=canvas.captureStream(30);
 const stream=new MediaStream([...cs.getVideoTracks(), at[0]]);
 let mime='video/webm;codecs=vp9,opus';if(!MediaRecorder.isTypeSupported(mime))mime='video/webm;codecs=vp8,opus';if(!MediaRecorder.isTypeSupported(mime))mime='video/webm';
 const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:5000000,audioBitsPerSecond:160000}),chunks=[];
 rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);const stopped=new Promise(ok=>rec.onstop=ok);

 const voice=speechSynthesis.getVoices().find(v=>v.voiceURI===$('gcAutoVoice').value);
 const u=new SpeechSynthesisUtterance(text);u.lang=voice?.lang||'pt-BR';if(voice)u.voice=voice;u.rate=+$('gcAutoRate').value;
 const spoken=new Promise((ok,er)=>{u.onend=ok;u.onerror=er});

 $('gcRenderProgress').classList.remove('hidden');$('gcRenderBar').style.width='3%';$('gcRenderStatus').textContent='Gerando nova fala e montando o vídeo...';
 video.currentTime=0;rec.start(300);await video.play();speechSynthesis.cancel();speechSynthesis.speak(u);

 let running=true;
 const draw=()=>{if(!running)return;const sc=Math.max(720/video.videoWidth,1280/video.videoHeight),w=video.videoWidth*sc,hh=video.videoHeight*sc;ctx.fillStyle='#000';ctx.fillRect(0,0,720,1280);ctx.drawImage(video,(720-w)/2,(1280-hh)/2,w,hh);$('gcRenderBar').style.width=Math.min(95,Math.round(video.currentTime/Math.max(video.duration,.1)*100))+'%';requestAnimationFrame(draw)};draw();

 // Finish when speech ends; freeze/loop video if speech is longer than source.
 video.onended=()=>{ if(speechSynthesis.speaking){video.currentTime=0;video.play().catch(()=>{});} };
 await spoken; await new Promise(r=>setTimeout(r,250)); running=false; video.pause(); rec.stop(); await stopped;
 capture.getTracks().forEach(t=>t.stop());cs.getTracks().forEach(t=>t.stop());stream.getTracks().forEach(t=>t.stop());

 const blob=new Blob(chunks,{type:mime});if(finalUrl)URL.revokeObjectURL(finalUrl);finalUrl=URL.createObjectURL(blob);
 $('gcFinalVideo').src=finalUrl;$('gcFinalVideo').muted=false;$('gcFinalVideo').volume=1;$('gcFinalVideo').classList.remove('hidden');
 $('gcDownload').href=finalUrl;$('gcDownload').download=`viral-studio-roteiro-novo-${Date.now()}.webm`;$('gcDownload').classList.remove('hidden');
 $('gcRenderBar').style.width='100%';$('gcRenderStatus').textContent='✓ Novo vídeo pronto com o roteiro escolhido';
}
$('gcAutoMakeVideo').onclick=()=>gcAutoVideoFromScript().catch(e=>{console.error(e);speechSynthesis.cancel();alert('Não foi possível gerar o vídeo: '+(e.message||e))});


// V3.12 — reliable replacement: selected new audio is the ONLY audio track in the rendered file.
async function vsReplaceAudio312(){
 const vf=$('gcMedia')?.files?.[0], af=$('vsNewAudio312')?.files?.[0];
 if(!vf)return alert('Envie o vídeo original primeiro.');
 if(!af)return alert('Selecione o áudio novo que será colocado no vídeo.');
 const st=$('vsReplaceStatus312'); st.textContent='Preparando vídeo e áudio novo...';

 const v=document.createElement('video'), a=document.createElement('audio');
 v.src=URL.createObjectURL(vf); a.src=URL.createObjectURL(af);
 v.preload='auto'; a.preload='auto'; v.playsInline=true; v.muted=true; v.volume=0;
 await Promise.all([
   new Promise((ok,er)=>{v.onloadedmetadata=ok;v.onerror=er}),
   new Promise((ok,er)=>{a.onloadedmetadata=ok;a.onerror=er})
 ]);

 const W=720,H=1280,canvas=document.createElement('canvas');canvas.width=W;canvas.height=H;
 const ctx=canvas.getContext('2d',{alpha:false}), cstream=canvas.captureStream(30);
 const ac=new (window.AudioContext||window.webkitAudioContext)();
 await ac.resume();
 const src=ac.createMediaElementSource(a), dest=ac.createMediaStreamDestination();
 src.connect(dest); // deliberately NOT connected to speakers
 const out=new MediaStream([...cstream.getVideoTracks(),...dest.stream.getAudioTracks()]);

 let mime='video/webm;codecs=vp9,opus';
 if(!MediaRecorder.isTypeSupported(mime))mime='video/webm;codecs=vp8,opus';
 if(!MediaRecorder.isTypeSupported(mime))mime='video/webm';
 const rec=new MediaRecorder(out,{mimeType:mime,videoBitsPerSecond:5000000,audioBitsPerSecond:160000}),chunks=[];
 rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);
 const done=new Promise(ok=>rec.onstop=ok);

 let active=true;
 function frame(){
   if(!active)return;
   const s=Math.max(W/v.videoWidth,H/v.videoHeight),dw=v.videoWidth*s,dh=v.videoHeight*s;
   ctx.fillStyle='#000';ctx.fillRect(0,0,W,H);ctx.drawImage(v,(W-dw)/2,(H-dh)/2,dw,dh);
   requestAnimationFrame(frame);
 }
 frame(); v.currentTime=0;a.currentTime=0;rec.start(250);
 await Promise.all([v.play(),a.play()]);
 st.textContent='Gerando NOVO vídeo. O áudio original está removido...';

 // Result duration follows the shorter source. If new audio is longer, loop visuals.
 const audioDone=new Promise(ok=>a.onended=ok);
 v.onended=()=>{if(!a.ended){v.currentTime=0;v.play().catch(()=>{})}};
 await audioDone;
 active=false;v.pause();a.pause();await new Promise(r=>setTimeout(r,150));rec.stop();await done;
 cstream.getTracks().forEach(t=>t.stop());out.getTracks().forEach(t=>t.stop());await ac.close();

 const blob=new Blob(chunks,{type:mime}),url=URL.createObjectURL(blob);
 const player=$('vsResult312'),dl=$('vsDownload312');
 player.src=url;player.muted=false;player.volume=1;player.classList.remove('hidden');
 dl.href=url;dl.download=`viral-studio-audio-trocado-${Date.now()}.webm`;dl.classList.remove('hidden');
 st.textContent='✓ Novo vídeo criado. O arquivo final contém somente o áudio novo.';
}
$('vsReplace312').onclick=()=>vsReplaceAudio312().catch(e=>{console.error(e);$('vsReplaceStatus312').textContent='Erro: '+(e.message||e);alert('Falha ao gerar: '+(e.message||e))});


// V3.16 — remover foto do perfil
(function(){
 const btn=document.getElementById('removeProfilePhoto');
 if(!btn)return;
 btn.addEventListener('click',()=>{
   ['vsProfilePhoto','profilePhoto','userPhoto','avatar'].forEach(k=>localStorage.removeItem(k));
   try{
     const u=JSON.parse(localStorage.getItem('vsUser')||'{}');
     delete u.photo; delete u.avatar; delete u.profilePhoto;
     localStorage.setItem('vsUser',JSON.stringify(u));
   }catch(e){}
   const img="sidePhoto" ? document.getElementById("sidePhoto") : null;
   if(img){ img.removeAttribute('src'); img.style.display='none'; }
   const input=document.getElementById("profilePhotoInput");
   if(input)input.value='';
   alert('Foto do perfil removida.');
 });
})();


// V3.17 — Central TikTok. UI pronta; conexão real depende do backend + app TikTok registrado.
const VS_TIKTOK_BACKEND=(localStorage.getItem('vsTikTokBackend')||'').replace(/\/$/,'');
function ttMessage(x){const e=document.getElementById('ttMsg');if(e)e.textContent=x}
function ttBackendRequired(){
 if(!VS_TIKTOK_BACKEND){ttMessage('Aguardando backend TikTok. Cadastre o app no TikTok for Developers e configure a URL do backend.');return false}
 return true;
}
document.getElementById('ttConnect')?.addEventListener('click',()=>{
 if(!ttBackendRequired())return;
 window.open(VS_TIKTOK_BACKEND+'/auth/tiktok/start','_blank','noopener');
 ttMessage('Login oficial do TikTok aberto. Depois da autorização, atualize o status da conta.');
});
document.getElementById('ttDisconnect')?.addEventListener('click',async()=>{
 if(!ttBackendRequired())return;
 try{await fetch(VS_TIKTOK_BACKEND+'/auth/tiktok/disconnect',{method:'POST',credentials:'include'});ttMessage('TikTok desconectado.');document.getElementById('ttStatusDot').textContent='⚪ TikTok não conectado'}catch(e){ttMessage('Não foi possível desconectar: '+e.message)}
});
document.getElementById('ttVideo')?.addEventListener('change',e=>{
 const f=e.target.files?.[0],v=document.getElementById('ttPreview');if(!f||!v)return;v.src=URL.createObjectURL(f);v.classList.remove('hidden')
});
document.getElementById('ttGenCaption')?.addEventListener('click',()=>{
 const t=document.getElementById('ttCaption');if(t&&!t.value)t.value='Olha esse produto! Confira os detalhes no vídeo e veja se faz sentido para você. #TikTokShop #Achadinhos';
});
document.getElementById('ttGenTags')?.addEventListener('click',()=>{
 const t=document.getElementById('ttCaption');if(t&&!/#TikTok/.test(t.value))t.value=(t.value.trim()+' #TikTokShop #Achadinhos #DicaDeCompra').trim();
});
async function ttSend(mode){
 if(!ttBackendRequired())return;
 const f=document.getElementById('ttVideo')?.files?.[0];if(!f)return alert('Selecione um vídeo.');
 const fd=new FormData();fd.append('video',f);fd.append('mode',mode);fd.append('title',document.getElementById('ttCaption')?.value||'');fd.append('privacy_level',document.getElementById('ttPrivacy')?.value||'');fd.append('is_aigc',document.getElementById('ttAigc')?.checked?'true':'false');fd.append('disable_comment',document.getElementById('ttComments')?.checked?'false':'true');fd.append('disable_duet',document.getElementById('ttDuet')?.checked?'false':'true');fd.append('disable_stitch',document.getElementById('ttStitch')?.checked?'false':'true');
 ttMessage('Enviando para o backend...');
 try{const r=await fetch(VS_TIKTOK_BACKEND+'/api/tiktok/post',{method:'POST',body:fd,credentials:'include'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha no envio');ttMessage('✓ Enviado. ID: '+(j.publish_id||'processando'));}catch(e){ttMessage('Erro: '+e.message)}
}
document.getElementById('ttUpload')?.addEventListener('click',()=>ttSend('upload'));
document.getElementById('ttDirect')?.addEventListener('click',()=>ttSend('direct'));

// Variações rápidas: usam o gerador existente sem trocar a nomenclatura Gancho + Corpo + CTA.
function cvQuick(kind){
 const btn=document.getElementById('gcGenerateVars');
 if(btn){btn.click();return}
 alert('Gere uma nova variação e mantenha os blocos que quiser. O formato continua Gancho + Corpo + CTA.');
}
document.getElementById('cvSwapHook')?.addEventListener('click',()=>cvQuick('hook'));
document.getElementById('cvSwapBody')?.addEventListener('click',()=>cvQuick('body'));
document.getElementById('cvSwapCta')?.addEventListener('click',()=>cvQuick('cta'));
document.getElementById('cvSwapAll')?.addEventListener('click',()=>cvQuick('all'));


// V3.18 — fila sequencial de versões do Criar Vídeo.
let v318Queue=[];
function v318Draw(){
 const box=document.getElementById('v318Queue'); if(!box)return;
 if(!v318Queue.length){box.innerHTML='<small>Nenhuma versão adicionada.</small>';return}
 box.innerHTML=v318Queue.map((x,i)=>`<div class="v318QueueItem ${x.done?'done':''}"><span><b>#${i+1}</b> ${x.name}</span><span>${x.done?'✓ concluído':'aguardando'}</span></div>`).join('');
}
function v318SelectedText(){
 const candidates=[...document.querySelectorAll('textarea')].filter(x=>x.offsetParent!==null && x.value.trim());
 const t=candidates.map(x=>x.value.trim()).join(' ').slice(0,540);
 return t || 'Roteiro selecionado';
}
document.getElementById('v318AddSelected')?.addEventListener('click',()=>{
 const text=v318SelectedText();
 v318Queue.push({name:text.slice(0,70)+(text.length>70?'…':''),text,done:false});
 v318Draw();
});
document.getElementById('v318Clear')?.addEventListener('click',()=>{v318Queue=[];v318Draw()});
document.getElementById('v318Next')?.addEventListener('click',()=>{
 const i=v318Queue.findIndex(x=>!x.done);
 if(i<0)return alert('Adicione um roteiro à fila ou todas as versões já foram concluídas.');
 const renderBtn=document.getElementById('gcRenderNewVoice');
 if(renderBtn){
   renderBtn.click();
   v318Queue[i].done=true; v318Draw();
 }else{
   alert('Renderizador não localizado nesta tela. Abra Criar Vídeo e selecione o vídeo/áudio antes de gerar.');
 }
});

// Configuração simples do backend TikTok sem editar código.
(function(){
 const box=document.getElementById('tiktokCenter'); if(!box)return;
 const row=document.createElement('div');row.className='ttBackendConfig';
 row.innerHTML='<label>Backend TikTok <input id="ttBackendUrl" placeholder="https://seu-backend.com" value="'+(localStorage.getItem('vsTikTokBackend')||'')+'"></label><button id="ttSaveBackend">SALVAR BACKEND</button><small>Status da análise do TikTok não é alterado por este campo.</small>';
 box.insertBefore(row,box.children[1]||null);
 document.getElementById('ttSaveBackend')?.addEventListener('click',()=>{
   const u=document.getElementById('ttBackendUrl').value.trim().replace(/\/$/,'');
   localStorage.setItem('vsTikTokBackend',u); alert('Backend salvo. Reabra o Viral Studio para aplicar.');
 });
})();

// V3.20 — botão de emergência para interromper 3/5/10/27+ combinações.
(function(){
 const gen=document.getElementById('generate');if(!gen||document.getElementById('stopGeneration320'))return;
 const b=document.createElement('button');b.id='stopGeneration320';b.className='stopGeneration320 hidden';b.textContent='■ PARAR GERAÇÃO';
 gen.insertAdjacentElement('afterend',b);
 b.addEventListener('click',()=>{
   vsStopProduction=true;b.disabled=true;b.textContent='■ PARANDO...';
   try{speechSynthesis.cancel()}catch(e){}
   try{vsActiveVideo?.pause()}catch(e){}
   try{if(vsActiveRecorder&&vsActiveRecorder.state!=='inactive')vsActiveRecorder.stop()}catch(e){}
   setTimeout(()=>{b.textContent='■ PARAR GERAÇÃO'},600);
 });
})();

// V3.21 — agrupa Alterar/Remover foto num controle vertical compacto.
(function compactProfilePhotoButtons(){
 const buttons=[...document.querySelectorAll('button')];
 const change=buttons.find(b=>/alterar foto|trocar foto/i.test((b.textContent||'').trim()));
 const remove=buttons.find(b=>/remover foto|excluir foto/i.test((b.textContent||'').trim()));
 if(!change||!remove)return;
 let wrap=document.getElementById('profilePhotoActions');
 if(!wrap){
   wrap=document.createElement('div');wrap.id='profilePhotoActions';wrap.className='profilePhotoActions';
   change.parentNode.insertBefore(wrap,change);wrap.append(change,remove);
 } else {wrap.append(change,remove)}
 change.style.cssText+='width:auto!important;padding:4px 8px!important;font-size:9px!important;';
 remove.style.cssText+='width:auto!important;padding:3px 8px!important;font-size:8px!important;';
})();

// V3.22 — acabamento dos controles solicitado.
(function v322Controls(){
 const buttons=[...document.querySelectorAll('button')];
 const remove=buttons.find(b=>/remover foto|excluir foto/i.test((b.textContent||'').trim()));
 if(remove){
   remove.querySelectorAll('svg,img,i').forEach(x=>x.remove());
   remove.textContent='Remover foto';
   remove.setAttribute('aria-label','Remover foto');
   remove.style.setProperty('width','auto','important');
   remove.style.setProperty('min-width','0','important');
   remove.style.setProperty('height','auto','important');
   remove.style.setProperty('min-height','0','important');
   remove.style.setProperty('padding','2px 6px','important');
   remove.style.setProperty('font-size','8px','important');
 }
 const stop=document.getElementById('stopGeneration320');
 if(stop) stop.textContent='■ PARAR GERAÇÃO';
})();

// V4 — fluxo próprio de criação e verificação preventiva.
(function viralStudioV4(){
 const q=id=>document.getElementById(id);
 document.querySelectorAll('[data-v4step]').forEach(b=>b.addEventListener('click',()=>{
   document.querySelectorAll('[data-v4step]').forEach(x=>x.classList.remove('active'));b.classList.add('active');
 }));
 q('v4UseScript')?.addEventListener('click',()=>{
   const parts=[q('v4Hook')?.value,q('v4Dev')?.value,q('v4Proof')?.value,q('v4Obj')?.value,q('v4Cta')?.value].filter(Boolean);
   const visible=[...document.querySelectorAll('textarea')].filter(x=>x.offsetParent!==null && !x.closest('#v4CreatorFlow'));
   if(visible.length){visible[0].value=parts.join(' ');visible[0].dispatchEvent(new Event('input',{bubbles:true}))}
   alert('Roteiro preparado para o gerador. Revise antes de produzir.');
 });
 q('v4Check')?.addEventListener('click',()=>{
   const script=[q('v4Hook'),q('v4Dev'),q('v4Proof'),q('v4Obj'),q('v4Cta')].map(x=>x?.value||'').join(' ');
   const facts=(q('v4Facts')?.value||'')+' '+(q('v4Evidence')?.value||'');
   const price=q('v4Price')?.value||'';
   const flags=[];
   const tests=[
    [/\b(milagre|garantido|100%|cura|cura tudo|sem risco|nunca falha)\b/i,'Revise promessa absoluta/exagerada.'],
    [/\b(mais barato|menor preço|preço mais baixo|só hoje|últimas unidades|vai acabar|estoque acabando)\b/i,'Confirme preço, urgência ou estoque antes de publicar.'],
    [/\b(médico|doutor|especialista|cientista|aprovado cientificamente)\b/i,'Revise identidade profissional/certificação e mantenha somente o que tiver comprovação.'],
    [/\b(antes e depois|resultado em \d+|emagre|trata|previne)\b/i,'Conteúdo de resultado/saúde exige revisão especialmente cuidadosa.']
   ];
   tests.forEach(([rx,msg])=>{if(rx.test(script))flags.push(msg)});
   if(script && !facts.trim())flags.push('Adicione características/fonte do produto para conferir se a fala corresponde ao item real.');
   if(/\bR\$\s?\d|reais|desconto|% off/i.test(script) && !price.trim())flags.push('O roteiro menciona preço/desconto, mas não há promoção confirmada no campo Produto.');
   const out=q('v4CheckResult');out.classList.remove('hidden');
   out.innerHTML=flags.length
    ? '<b>⚠ Revisar antes de postar</b><ul>'+[...new Set(flags)].map(x=>'<li>'+x+'</li>').join('')+'</ul><small>Verificação local por regras; compare sempre com a página real do produto e as políticas atuais.</small>'
    : '<b>✓ Nenhum alerta básico encontrado</b><p>Ainda revise produto, fala, imagens, preço e uso de IA antes da publicação.</p>';
 });
 q('v4TikTok')?.addEventListener('click',()=>window.open('https://www.tiktok.com/upload','_blank','noopener,noreferrer'));
})();

// V4.02 — filtros simples por objetivo.
document.querySelectorAll('[data-filter-ai]').forEach(btn=>btn.addEventListener('click',()=>{
 const cat=btn.dataset.filterAi;
 document.querySelectorAll('[data-filter-ai]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');
 document.querySelectorAll('[data-ai-cat]').forEach(card=>card.classList.toggle('aiHidden',cat!=='all'&&card.dataset.aiCat!==cat));
}));

// V4.1 — Assistente local de fluxo. Não envia dados a terceiros.
(function(){
 let goal='produto', style='realista';
 const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 function page(n){$$('[data-wiz-page]').forEach(x=>x.classList.toggle('hidden',x.dataset.wizPage!=n));$$('.wizProgress i').forEach((x,i)=>x.classList.toggle('on',i<n));}
 $$('[data-next]').forEach(b=>b.onclick=()=>{if(b.dataset.next==='3')build();page(b.dataset.next)});
 $$('[data-back]').forEach(b=>b.onclick=()=>page(b.dataset.back));
 $$('[data-goal]').forEach(b=>b.onclick=()=>{$$('[data-goal]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');goal=b.dataset.goal});
 $$('[data-style]').forEach(b=>b.onclick=()=>{$$('[data-style]').forEach(x=>x.classList.remove('selected'));b.classList.add('selected');style=b.dataset.style});
 function build(){
  const product=$('#wizProduct').value.trim()||'produto'; const facts=$('#wizFacts').value.trim();
  $('#wizHook').value=`Olha como esse ${product} chama atenção logo de cara.`;
  $('#wizBody').value=facts?`Repara nos detalhes: ${facts}`:`Mostre de perto os detalhes reais do ${product}, o material, acabamento e como ele é usado.`;
  $('#wizCTA').value=`Gostou do ${product}? Confira os detalhes da oferta antes de finalizar a compra.`;
  $('#wizPrompt').value=`Vídeo ${style}, vertical 9:16, estilo ${goal}, mostrando ${product}. Luz natural, textura realista, movimentos humanos naturais, câmera de smartphone premium, close nos detalhes reais do produto, sem alterar marca, cor, formato ou características do item. ${facts?'Características que devem permanecer fiéis: '+facts+'.':''} Sem texto ilegível, sem deformações, sem objetos extras.`;
 }
 $('#wizCheck')?.addEventListener('click',()=>{
  const t=[$('#wizHook').value,$('#wizBody').value,$('#wizCTA').value].join(' '), f=$('#wizFacts').value;
  let a=[]; if(/\b100%|garantid|milagre|cura|sem risco\b/i.test(t))a.push('Revise promessa absoluta.');
  if(/\búltimas unidades|vai acabar|só hoje|menor preço\b/i.test(t))a.push('Confirme urgência/preço/estoque.');
  if(!f.trim())a.push('Adicione características reais do produto para melhorar a conferência.');
  $('#wizStatus').textContent=a.length?'⚠ '+a.join(' '):'✓ Nenhum alerta básico encontrado. Faça uma revisão visual final antes de publicar.';
 });
})();

// V4.2 — Laboratório local de criativos e resultados.
(function(){
 const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
 $$('.labTabs [data-lab]').forEach(b=>b.onclick=()=>{ $$('.labTabs [data-lab]').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('[data-lab-pane]').forEach(x=>x.classList.toggle('hidden',x.dataset.labPane!==b.dataset.lab));});
 const types=[
 ['Curiosidade','Eu não esperava que [P] tivesse esse detalhe.','Comece já mostrando o detalhe.'],
 ['Problema','Se você passa por isso, olha como [P] funciona.','Mostre o problema em 1 segundo e corte para o produto.'],
 ['Demonstração','Olha isso funcionando de perto.','Produto em uso desde o primeiro frame.'],
 ['Descoberta','Foi esse detalhe de [P] que me chamou atenção.','Close rápido no principal diferencial real.'],
 ['Pergunta','Você também olha isso antes de comprar [P]?','Aponte para a característica citada.'],
 ['Objeção','Eu também tinha dúvida sobre [P] até olhar isso.','Mostre exatamente o ponto que responde à dúvida.'],
 ['POV','POV: você encontra [P] e resolve testar de verdade.','Câmera de mão e uso natural.'],
 ['Comparação','Repara na diferença quando eu uso [P] desse jeito.','Comparação visual factual, sem atacar concorrentes.'],
 ['Benefício','O detalhe mais útil de [P] é esse aqui.','Demonstre o benefício, não apenas fale.'],
 ['Comentário','Me perguntaram se [P] realmente tem esse detalhe.','Comece como resposta a uma pergunta real.']
 ];
 $('#makeHooks')?.addEventListener('click',()=>{
  const p=$('#labProduct').value.trim()||'este produto', facts=$('#labFacts').value.trim();
  let cards=[]; for(let i=0;i<20;i++){let [t,v,vis]=types[i%types.length];v=v.replaceAll('[P]',p);cards.push(`<div class="hookCard"><b>${i+1}. ${t}</b><span>${v}</span><small>Visual: ${vis}${facts?' • Baseie a fala somente nestes fatos: '+facts:''}</small></div>`)}
  $('#hookOutput').innerHTML=cards.join('');
 });
 $('#winnerVideo')?.addEventListener('change',e=>{let f=e.target.files?.[0];if(!f)return;let v=$('#winnerPreview');v.src=URL.createObjectURL(f);v.classList.remove('hidden')});
 $('#winnerVariations')?.addEventListener('click',()=>{let p=$('#labProduct')?.value.trim()||'o mesmo produto';$('#winnerOut').innerHTML=types.map((x,i)=>`<div class="hookCard"><b>${i+1}. ${x[0]}</b><span>${x[1].replaceAll('[P]',p)}</span><small>${x[2]}</small></div>`).join('')});
 $('#copyScenePrompt')?.addEventListener('click',()=>{let p=$('#labProduct')?.value.trim()||'produto',f=$('#labFacts')?.value.trim();$('#scenePrompt').value=`Vídeo vertical 9:16 de ${p}. Cena 1 (0–3s): produto visível imediatamente, movimento forte mas natural, close e gancho. Cena 2: situação real/problema. Cena 3: demonstração em close e ângulo aberto. Cena 4: mostrar benefício real visualmente. Cena 5: encerramento limpo para CTA. Manter aparência, cor, formato, marca e características reais do produto.${f?' Fatos permitidos: '+f+'.':''} Sem inventar funções, preço, estoque ou resultados.`});
 let rows=[];
 $('#addResult')?.addEventListener('click',()=>{
  const n=$('#resName').value||`Versão ${rows.length+1}`,v=+$('#resViews').value||0,c=+$('#resClicks').value||0,s=+$('#resSales').value||0;
  rows.push({n,v,c,s});render();
 });
 function render(){ $('#resultTable').innerHTML=rows.map(r=>{let ctr=r.v?100*r.c/r.v:0,conv=r.c?100*r.s/r.c:0,spv=r.v?1000*r.s/r.v:0;return `<div class="resRow"><b>${r.n}</b><span>${r.v} views</span><span>${r.c} cliques</span><span>${r.s} vendas</span><span>CTR ${ctr.toFixed(1)}%</span><span>${spv.toFixed(2)} vendas/1k views</span></div>`}).join('') }
})();


// V4.5 — Publicação simples, gratuita e menu reorganizado.
(function(){
 const $=id=>document.getElementById(id);
 $('pubVideo')?.addEventListener('change',e=>{const f=e.target.files?.[0],v=$('pubPreview');if(!f||!v)return;v.src=URL.createObjectURL(f);v.classList.remove('hidden')});
 const tags=()=>{const p=($('pubProduct')?.value||'produto').trim().replace(/\s+/g,'');return `#TikTokShop #AchadinhosTikTok #${p} #Oferta #Review`};
 $('pubGenCaption')?.addEventListener('click',()=>{const p=$('pubProduct').value.trim()||'esse produto',b=$('pubBenefit').value.trim()||'os detalhes mostrados no vídeo';$('pubCaption').value=`Olha esse ${p}. ${b}. Confira os detalhes e a oferta disponível no carrinho.\n\n${tags()}`});
 $('pubGenTags')?.addEventListener('click',()=>{const t=tags(),box=$('pubCaption');box.value=(box.value.trim()?box.value.trim()+'\n\n':'')+t});
 $('pubCopy')?.addEventListener('click',async()=>{await navigator.clipboard.writeText($('pubCaption').value||'');$('pubCopy').textContent='✓ COPIADO';setTimeout(()=>$('pubCopy').textContent='📋 COPIAR',1200)});
 $('pubOpenTikTok')?.addEventListener('click',()=>window.open('https://www.tiktok.com/upload','_blank','noopener,noreferrer'));
 document.querySelectorAll('[data-open-contenthub]').forEach(b=>b.addEventListener('click',()=>{
   const nav=document.querySelector('[data-page="contentHub"]'); if(nav)nav.click();
   else {document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));$('contentHub')?.classList.remove('hidden')}
 }));
})();

// V4.7 — Navegação robusta: cada item do menu abre exatamente uma página.
(function(){
 const buttons=[...document.querySelectorAll('[data-page]')];
 buttons.forEach(btn=>{
   btn.addEventListener('click',function(e){
     const id=this.dataset.page, target=document.getElementById(id);
     if(!target)return;
     document.querySelectorAll('.page').forEach(p=>p.classList.add('hidden'));
     target.classList.remove('hidden');
     buttons.forEach(b=>b.classList.toggle('active',b===this));
     window.scrollTo({top:0,behavior:'instant'});
   },true);
 });
})();

// V4.9 — foto rápida no cartão superior
(function(){
 const add=document.getElementById('sideAddPhoto'), rem=document.getElementById('sideRemovePhoto'), inp=document.getElementById('sidePhotoInput');
 const profileInp=document.getElementById('profilePhotoInput'), profileRem=document.getElementById('removeProfilePhoto');
 add?.addEventListener('click',()=>inp?.click());
 inp?.addEventListener('change',()=>{
   const f=inp.files?.[0]; if(!f)return;
   const r=new FileReader();r.onload=()=>{
     localStorage.setItem('vs_profile_photo',r.result);
     ['sidePhoto','profilePhoto'].forEach(id=>{const im=document.getElementById(id);if(im){im.src=r.result;im.classList.remove('hidden')}});
     ['sideAvatar','profileAvatar'].forEach(id=>document.getElementById(id)?.classList.add('hidden'));
   };r.readAsDataURL(f);
 });
 rem?.addEventListener('click',()=>{
   localStorage.removeItem('vs_profile_photo');
   ['sidePhoto','profilePhoto'].forEach(id=>{const im=document.getElementById(id);if(im){im.src='';im.classList.add('hidden')}});
   ['sideAvatar','profileAvatar'].forEach(id=>document.getElementById(id)?.classList.remove('hidden'));
 });
})();

// V4.10 — Criador IA funcional: quantidade, duração e tipo de gancho realmente alteram a saída.
(function(){
 const $x=id=>document.getElementById(id);
 const banks={
  'Curiosidade':["Tem um detalhe desse produto que quase ninguém mostra.","Eu só percebi isso depois de olhar esse produto de perto.","Antes de passar esse produto, olha isso."],
  'Problema → solução':["Se isso te incomoda no dia a dia, olha essa solução.","Se você procura mais praticidade, presta atenção nisso.","Esse detalhe resolve uma dificuldade bem comum no uso."],
  'Demonstração':["Olha isso funcionando na prática.","Vou te mostrar esse produto em uso, sem enrolação.","Repara nesse detalhe enquanto eu mostro como funciona."],
  'Review':["Eu fui olhar os detalhes desse produto e isso chamou atenção.","O que eu observaria antes de comprar esse produto é isso.","Vamos ver se os detalhes desse produto fazem sentido no dia a dia."],
  'Comparação':["Antes de escolher um desses, compare este detalhe.","O que diferencia esse produto aparece quando você olha isso de perto.","Se você está comparando opções, presta atenção neste ponto."],
  'Automático':["Olha esse detalhe antes de escolher o seu.","Se você usa isso no dia a dia, presta atenção nisso.","Vou te mostrar o que realmente importa nesse produto.","Eu não escolheria sem olhar esse detalhe primeiro.","Repara como isso funciona na prática.","Antes de comprar, veja esse ponto de perto.","Esse produto chamou atenção por um motivo bem simples.","Olha o que acontece quando a gente mostra o produto em uso.","O detalhe mais útil pode ser justamente esse.","Se a sua dúvida é se vale olhar esse produto, começa por aqui."]
 };
 const angles=["benefício principal","demonstração","dor e solução","detalhe do produto","uso real","objeção","praticidade","descoberta","comparação de detalhe","review natural"];
 function lim(t,n){return t.length<=n?t:t.slice(0,n-1).trim()+"…"}
 function make(i){
   const p=($x('gcProduct')?.value||'este produto').trim(), ben=($x('gcBenefits')?.value||'praticidade e bom acabamento').trim();
   const aud=($x('gcAudience')?.value||'quem busca praticidade no dia a dia').trim(), offer=($x('gcOffer')?.value||'').trim();
   const mode=$x('gcHookMode')?.value||'Automático', bank=banks[mode]||banks.Automático, d=+$x('gcDuration').value;
   const hook=lim(bank[i%bank.length].replace(/esse produto|desse produto/gi,p),150);
   const bodies=[
    `Mostre ${p} logo no começo e demonstre ${ben}. Explique como isso ajuda ${aud}, usando somente características que podem ser vistas ou comprovadas.`,
    `Faça uma demonstração de ${p} em uso. Dê close nos detalhes ligados a ${ben} e transforme cada característica em um benefício prático.`,
    `Apresente uma situação real de uso de ${p}. Mostre o problema, a utilização e o detalhe que entrega ${ben}.`,
    `Comece pelo detalhe visual mais forte de ${p}, depois mostre outro ângulo e explique ${ben} de forma natural.`,
    `Faça um review curto de ${p}: o que chama atenção, como é usado e onde ${ben} aparece na prática.`
   ];
   let body=lim(bodies[i%bodies.length], d<=8?150:d<=15?260:460);
   let cta=offer?`Se fez sentido, toque no carrinho e confira ${offer}. Confirme os detalhes da oferta antes de finalizar.`:`Se fez sentido, toque no carrinho e confira os detalhes e a oferta disponível agora.`;
   cta=lim(cta,d<=8?100:160);
   return {hook,body,cta,text:`${hook} ${body} ${cta}`,angle:angles[i%angles.length],d};
 }
 function scenes(v){
   const n=v.d<=8?3:v.d<=15?5:7, labels=["Produto visível + gancho","Close no benefício","Demonstração em uso","Segundo ângulo","Prova visual / detalhe","Situação real","Produto + CTA"];
   return Array.from({length:n},(_,i)=>{let a=Math.round(i*v.d/n),b=Math.round((i+1)*v.d/n);return `${a}–${b}s: ${labels[i]}`}).join(" • ");
 }
 function draw(vars){
   const box=$x('gcMainVariations'); if(!box)return; box.innerHTML='';
   vars.forEach((v,i)=>{
     const el=document.createElement('article');el.className='mainVarCard';
     el.innerHTML=`<div class="mainVarHead"><b>VARIAÇÃO ${i+1}</b><span>${v.d}s • ${v.angle}</span></div><p><strong>🪝 GANCHO</strong>${v.hook}</p><p><strong>🥩 DESENVOLVIMENTO</strong>${v.body}</p><p><strong>📞 CTA</strong>${v.cta}</p><small>🎬 ${scenes(v)}</small><div class="mainVarBtns"><button data-use>✓ USAR</button><button data-listen>▶ OUVIR</button><button data-copy>📋 COPIAR</button></div>`;
     el.querySelector('[data-use]').onclick=()=>use(v,i);
     el.querySelector('[data-listen]').onclick=()=>{speechSynthesis.cancel();let u=new SpeechSynthesisUtterance(v.text);u.lang='pt-BR';u.rate=1.05;speechSynthesis.speak(u)};
     el.querySelector('[data-copy]').onclick=()=>navigator.clipboard.writeText(v.text);
     box.appendChild(el);
   });
   use(vars[0],0);
 }
 function use(v,i){
   $x('gcScript').textContent=`GANCHO\n${v.hook}\n\nCORPO\n${v.body}\n\nCTA\n${v.cta}`;
   $x('gcVoiceText').textContent=v.text;$x('gcTitle').textContent=`${($x('gcProduct').value||'Produto')} · Variação ${i+1} · ${v.d}s`;
   $x('gcScenes').innerHTML=scenes(v).split(' • ').map(x=>`<div class="sceneRow"><span>${x}</span></div>`).join('');
   $x('gcCharCount').textContent=`Gancho ${v.hook.length} • Corpo ${v.body.length} • CTA ${v.cta.length}`;
 }
 $x('gcCreate')?.addEventListener('click',e=>{
   e.preventDefault();e.stopImmediatePropagation();
   const n=+$x('gcCount').value||1, vars=Array.from({length:n},(_,i)=>make(i));
   $x('gcProgress').classList.remove('hidden');$x('gcResult').classList.add('hidden');$x('gcStatus').textContent=`Criando ${n} variações de ${$x('gcDuration').value}s...`;$x('gcBar').style.width='45%';
   setTimeout(()=>{$x('gcBar').style.width='100%';$x('gcStatus').textContent=`${n} variações prontas`;$x('gcResult').classList.remove('hidden');draw(vars);$x('gcResult').scrollIntoView({behavior:'smooth'});},350);
 },true);
})();

// V4.11 — Viral IA Studio: navegação robusta e saídas locais úteis.
(function(){
 const $=id=>document.getElementById(id);
 function openPane(kind){
  document.querySelectorAll('.aiPane').forEach(p=>p.classList.add('hidden'));
  $('ai-'+kind)?.classList.remove('hidden');
  document.querySelectorAll('.aiTab').forEach(b=>b.classList.toggle('active',b.dataset.ai===kind));
 }
 document.querySelectorAll('.aiTab').forEach(b=>b.addEventListener('click',()=>openPane(b.dataset.ai),true));
 document.querySelectorAll('[data-open-ai]').forEach(b=>b.addEventListener('click',()=>openPane(b.dataset.openAi)));
 document.querySelectorAll('.aiExternalRow [data-url]').forEach(b=>b.addEventListener('click',()=>window.open(b.dataset.url,'_blank','noopener')));
 const hooks=["Antes de escolher, olha esse detalhe.","Se você usa isso no dia a dia, presta atenção nisso.","Vou te mostrar o que realmente importa nesse produto.","Olha como esse produto funciona na prática.","Esse detalhe é o que eu observaria antes de comprar."];
 document.querySelectorAll('.aiGenerate').forEach(btn=>btn.addEventListener('click',e=>{
   const k=btn.dataset.kind;
   if(k==='script'){
    e.stopImmediatePropagation();
    const p=($('scriptProduct')?.value||'o produto').trim(), d=($('scriptDetails')?.value||'').trim();
    const hook=hooks[Math.floor(Date.now()/1000)%hooks.length];
    $('scriptOutput').textContent=`🪝 GANCHO\n${hook}\n\n🥩 DESENVOLVIMENTO\nMostre ${p} de perto e em uso. ${d?`Destaque somente estes detalhes informados: ${d}. `:''}Explique o benefício de forma natural, sincronizando a fala com closes e diferentes ângulos do produto.\n\n📞 CTA\nSe fez sentido para você, toque no carrinho e confira os detalhes e a oferta disponível.`;
   }
   if(k==='image'){
    e.stopImmediatePropagation();
    const idea=($('imagePrompt')?.value||'produto em destaque').trim();
    $('imageOutput').innerHTML=`<div class="promptReady"><b>🖼️ PROMPT PRONTO</b><p>Imagem publicitária vertical 9:16, ultra-realista, ${idea}. Produto como foco principal, iluminação comercial natural, composição limpa, textura realista, enquadramento de anúncio social, sem alterar marca, cor, formato ou características reais do produto. Sem textos inventados, sem preço inventado.</p><small>Copie este prompt e abra ChatGPT ou Firefly acima.</small></div>`;
   }
   if(k==='video'){
    e.stopImmediatePropagation();
    const idea=($('videoIdea')?.value||'produto sendo demonstrado').trim();
    $('videoOutput').textContent=`PROMPT DE VÍDEO\nVertical 9:16, estilo UGC ultra-realista. ${idea}. 0–3s: produto visível imediatamente + movimento de câmera e gancho visual. 3–10s: demonstração em uso, close em detalhes e segundo ângulo. Final: produto claramente visível e espaço visual para CTA. Movimento natural de mãos/câmera, iluminação realista, sem alterar características do produto, sem preço ou promoção inventados.`;
   }
 },true));
})();

// V4.46 — Central de Originais 10×10×10 + salvamento automático dos arquivos
(function(){
 const $=id=>document.getElementById(id);
 document.querySelectorAll('.goOriginals').forEach(b=>b.addEventListener('click',()=>document.querySelector('[data-page="originals"]')?.click()));
 const state={h:[],b:[],c:[]};

 // V4.46 — persistência real dos vídeos no aparelho.
 // O <input type=file> não pode ser repovoado após refresh por segurança do navegador,
 // então guardamos os próprios arquivos em armazenamento privado do site e reconstruímos o estado.
 const ORIG_DB='viral_studio_originais_v2', ORIG_STORE='clips';
 const ORIG_MANIFEST='vs_originais_manifest_v2';
 const ORIG_OPFS_DIR='viral-studio-originais';
 function origSetSaveStatus(txt,ok=true){
  const note=document.querySelector('.origAutosaveNote');
  if(note){note.textContent=txt;note.style.color=ok?'#8fe7df':'#ffb347'}
 }
 async function origRequestPersist(){
  try{ if(navigator.storage?.persist) await navigator.storage.persist(); }catch(_){}
 }
 function origDbOpen(){
  return new Promise((resolve,reject)=>{
   const req=indexedDB.open(ORIG_DB,1);
   req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(ORIG_STORE))db.createObjectStore(ORIG_STORE,{keyPath:'id'})};
   req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error||new Error('Falha ao abrir armazenamento local'));
  });
 }
 async function origSaveIdb(manifest){
  const db=await origDbOpen();
  await new Promise((resolve,reject)=>{
   const tx=db.transaction(ORIG_STORE,'readwrite'), st=tx.objectStore(ORIG_STORE); st.clear();
   for(const m of manifest){const f=state[m.kind][m.pos];st.put({id:m.storageName,kind:m.kind,pos:m.pos,name:m.name,type:m.type,lastModified:m.lastModified,size:m.size,blob:f})}
   tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  }); db.close();
 }
 async function origSaveOpfs(manifest){
  if(!navigator.storage?.getDirectory) throw new Error('OPFS indisponível');
  const root=await navigator.storage.getDirectory();
  const dir=await root.getDirectoryHandle(ORIG_OPFS_DIR,{create:true});
  for(const m of manifest){
   const f=state[m.kind][m.pos];
   const fh=await dir.getFileHandle(m.storageName,{create:true});
   const w=await fh.createWritable(); await w.write(f); await w.close();
  }
 }
 async function origSave(){
  const manifest=[];
  for(const k of ['h','b','c']) state[k].forEach((f,i)=>manifest.push({kind:k,pos:i,storageName:`${k}_${i}.bin`,name:f.name||`${k}_${i+1}.mp4`,type:f.type||'video/mp4',lastModified:f.lastModified||Date.now(),size:f.size||0}));
  try{
   origSetSaveStatus('💾 Salvando Ganchos, Corpos e CTAs neste aparelho…');
   await origRequestPersist();
   let savedBy='IndexedDB';
   try{await origSaveOpfs(manifest);savedBy='armazenamento privado'}catch(_){await origSaveIdb(manifest)}
   localStorage.setItem(ORIG_MANIFEST,JSON.stringify(manifest));
   localStorage.setItem('vs_originais_saved_at',String(Date.now()));
   origSetSaveStatus(`✅ ${manifest.length} arquivo(s) salvos automaticamente (${savedBy}). Pode atualizar a página.`);
  }catch(e){console.warn('Não foi possível salvar os Originais localmente:',e);origSetSaveStatus('⚠️ Não consegui salvar os vídeos neste navegador. Evite aba privada e confira espaço livre.',false)}
 }
 async function origRestoreOpfs(manifest){
  if(!navigator.storage?.getDirectory) throw new Error('OPFS indisponível');
  const root=await navigator.storage.getDirectory();
  const dir=await root.getDirectoryHandle(ORIG_OPFS_DIR,{create:false});
  const out=[];
  for(const m of manifest){
   const fh=await dir.getFileHandle(m.storageName,{create:false}); const f=await fh.getFile();
   out.push({m,file:new File([f],m.name,{type:m.type||f.type||'video/mp4',lastModified:m.lastModified||f.lastModified||Date.now()})});
  }
  return out;
 }
 async function origRestoreIdb(){
  const db=await origDbOpen();
  const rows=await new Promise((resolve,reject)=>{const tx=db.transaction(ORIG_STORE,'readonly'),req=tx.objectStore(ORIG_STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)});db.close();
  return rows.map(r=>({m:r,file:new File([r.blob],r.name,{type:r.type||r.blob?.type||'video/mp4',lastModified:r.lastModified||Date.now()})}));
 }
 async function origRestore(){
  try{
   origSetSaveStatus('💾 Restaurando seus vídeos salvos…');
   for(const k of ['h','b','c']) state[k]=[];
   let restored=[];
   let manifest=[];
   try{manifest=JSON.parse(localStorage.getItem(ORIG_MANIFEST)||'[]')||[]}catch(_){manifest=[]}
   if(manifest.length){try{restored=await origRestoreOpfs(manifest)}catch(_){restored=await origRestoreIdb()}}
   else{try{restored=await origRestoreIdb()}catch(_){restored=[]}}
   restored.forEach(({m,file})=>{const k=m.kind;if(['h','b','c'].includes(k))state[k][m.pos]=file});
   for(const k of ['h','b','c']) state[k]=state[k].filter(Boolean).slice(0,10);
   draw('h','ohCount','ohList');draw('b','obCount','obList');draw('c','ocCount','ocList');calc();
   const total=state.h.length+state.b.length+state.c.length;
   if(total) origSetSaveStatus(`✅ Restaurados automaticamente: ${state.h.length} Ganchos, ${state.b.length} Corpos e ${state.c.length} CTAs.`);
   else origSetSaveStatus('💾 Salvamento automático ativo: depois do primeiro upload, seus arquivos permanecem neste aparelho após atualizar a página.');
  }catch(e){console.warn('Não foi possível restaurar os Originais:',e);origSetSaveStatus('⚠️ Não consegui restaurar os vídeos salvos neste navegador.',false)}
 }
 origRequestPersist();
 function bind(k,input,count,list){
  $(input)?.addEventListener('change',async e=>{
   state[k]=[...state[k],...Array.from(e.target.files||[])].slice(0,10);
   e.target.value=''; draw(k,count,list);calc(); await origSave();
  });
 }
 function draw(k,count,list){
  $(count).textContent=`${state[k].length}/10`;
  $(list).innerHTML=state[k].map((f,i)=>`<div class="origFile"><span>🎬 ${i+1}. ${f.name}</span><button data-k="${k}" data-i="${i}">×</button></div>`).join('');
  $(list).querySelectorAll('button').forEach(b=>b.onclick=async()=>{state[b.dataset.k].splice(+b.dataset.i,1);draw(b.dataset.k,k==='h'?'ohCount':k==='b'?'obCount':'ocCount',k==='h'?'ohList':k==='b'?'obList':'ocList');calc();await origSave()});
 }
 bind('h','ohInput','ohCount','ohList');bind('b','obInput','obCount','obList');bind('c','ocInput','ocCount','ocList');
 // Restaura automaticamente ao abrir/recarregar o Viral Studio.
 origRestore();
 function schedule(H,B,C){
   if(!H||!B||!C)return [];
   const usedHB=new Set(),usedHC=new Set(),usedBC=new Set(),out=[];
   // Deterministic cyclic construction + fallback scan. For equal n gives n² (e.g. 10 => 100).
   const target=Math.min(H*B,H*C,B*C);
   for(let shift=0;shift<C && out.length<target;shift++){
    for(let hi=0;hi<H && out.length<target;hi++){
     for(let bi=0;bi<B && out.length<target;bi++){
      const ci=(hi+bi+shift)%C, a=`${hi}:${bi}`,b=`${hi}:${ci}`,c=`${bi}:${ci}`;
      if(!usedHB.has(a)&&!usedHC.has(b)&&!usedBC.has(c)){usedHB.add(a);usedHC.add(b);usedBC.add(c);out.push({hi,bi,ci})}
     }
    }
   }
   // Greedy fill any remaining feasible triples
   let changed=true;
   while(changed&&out.length<target){changed=false;
    outer:for(let hi=0;hi<H;hi++)for(let bi=0;bi<B;bi++)for(let ci=0;ci<C;ci++){
     const a=`${hi}:${bi}`,b=`${hi}:${ci}`,c=`${bi}:${ci}`;
     if(!usedHB.has(a)&&!usedHC.has(b)&&!usedBC.has(c)){usedHB.add(a);usedHC.add(b);usedBC.add(c);out.push({hi,bi,ci});changed=true;break outer}
    }
   }
   return out;
 }
 function calc(){
  const possible=state.h.length*state.b.length*state.c.length, combos=schedule(state.h.length,state.b.length,state.c.length);
  $('omPossible').textContent=possible.toLocaleString('pt-BR');$('omOriginal').textContent=combos.length.toLocaleString('pt-BR');$('omProduce').textContent=combos.length.toLocaleString('pt-BR');return combos;
 }
 $('origBuild')?.addEventListener('click',()=>{
   const combos=calc(); if(!combos.length){alert('Adicione pelo menos 1 Gancho, 1 Corpo e 1 CTA.');return}
   $('origReview').classList.remove('hidden');
   origSelected=new Set();
   $('origTable').innerHTML=`<div class="origSelectToolbar"><b>Escolha quais vídeos quer gerar</b><span id="origSelectedCount">0 selecionados</span><button type="button" id="origSelectAll" class="secondary">Selecionar todos</button><button type="button" id="origSelectNone" class="secondary">Limpar seleção</button></div><div class="origTR origTH"><span>VÍDEO</span><span>GANCHO</span><span>CORPO</span><span>CTA</span><span>GERAR</span></div>`+combos.map((x,i)=>`<div class="origTR"><span>#${String(i+1).padStart(3,'0')}</span><span>G${x.hi+1}</span><span>C${x.bi+1}</span><span>CTA${x.ci+1}</span><span class="origPickCell"><label><input type="checkbox" data-orig-select="${i}"> Selecionar</label></span></div>`).join('');
   $('origTable').querySelectorAll('[data-orig-select]').forEach(cb=>cb.onchange=()=>{const i=+cb.dataset.origSelect;cb.checked?origSelected.add(i):origSelected.delete(i);updateOrigSelectionUI()});
   $('origSelectAll').onclick=()=>{origSelected=new Set(combos.map((_,i)=>i));updateOrigSelectionUI()};
   $('origSelectNone').onclick=()=>{origSelected.clear();updateOrigSelectionUI()};
   $('origStatus').textContent=`${combos.length} combinações disponíveis. Selecione somente as que deseja produzir.`;updateOrigSelectionUI();$('origReview').scrollIntoView({behavior:'smooth'});
 });
 $('origClear')?.addEventListener('click',async()=>{state.h=[];state.b=[];state.c=[];draw('h','ohCount','ohList');draw('b','obCount','obList');draw('c','ocCount','ocList');$('origReview').classList.add('hidden');calc();await origSave();});
 let origRendered=[];
 let origSelected=new Set();
 function updateOrigSelectionUI(){
   const boxes=[...document.querySelectorAll('#origTable [data-orig-select]')];
   boxes.forEach(cb=>cb.checked=origSelected.has(+cb.dataset.origSelect));
   const n=origSelected.size;
   const btn=$('origProduce'); if(btn){btn.disabled=n===0;btn.textContent=n?`⚡ GERAR SELECIONADOS (${n})`:'⚡ SELECIONE OS VÍDEOS';}
   const counter=$('origSelectedCount'); if(counter)counter.textContent=`${n} selecionado${n===1?'':'s'}`;
 }
 function renderOrigOutputs(){
   const box=$('origOutputs'); if(!box)return;
   if(!origRendered.length){box.innerHTML='';if(window.vsRefreshDashboardStats)window.vsRefreshDashboardStats();return}
   if(window.vsStatsScanReady)window.vsStatsScanReady(origRendered);
   box.innerHTML='<div class="origOutputsTitle"><h3>🎬 Vídeos produzidos</h3><small>Assista ou baixe cada versão separadamente.</small></div>'+
   origRendered.map((x,i)=>`<article class="origOutputCard">
      <div class="origOutputInfo"><b>Vídeo ${String((x.sourceIndex??i)+1).padStart(2,'0')}</b><small>G${x.hi+1} + C${x.bi+1} + CTA${x.ci+1}${localStorage.getItem('vs_viral_shop_enabled')==='1'?' • 🔥 '+(localStorage.getItem('vs_viral_shop_label')||'Viral Shop'):''}</small><span class="${x.url?'origReady'+(x._historyReused?' reused':''):'origWorking'}">${x.url?(x._historyReused?'✓ SALVO • REUTILIZADO':'✓ PRONTO'):x.error?'ERRO — TOQUE EM TENTAR NOVAMENTE':x._state==='working'?'⚡ GERANDO AGORA':'NA FILA'}</span></div>
      <div class="origOutputActions">
       ${x.url?`<button data-orig-watch="${i}" class="secondary">▶ ASSISTIR</button><button data-orig-download="${i}" class="origDownload">↓ DOWNLOAD</button>`:x.error?`<button data-orig-retry="${i}" class="secondary">↻ TENTAR NOVAMENTE</button><small class="origErrorDetail">${String(x.error).replace(/[<>]/g,'')}</small>`:(vsIOS&&x._state==='waiting'?`<button data-orig-generate-one="${i}" class="origDownload">⚡ GERAR ESTE VÍDEO</button>`:'')}
      </div>
      <div id="origPreview_${i}" class="origPreview"></div>
   </article>`).join('');
   box.querySelectorAll('[data-orig-watch]').forEach(b=>b.onclick=async()=>{
      const i=+b.dataset.origWatch, slot=$(`origPreview_${i}`), item=origRendered[i];
      if(!slot||!item?.url)return;
      if(slot.querySelector('video')){
        try{slot.querySelector('video').pause()}catch(_){}
        if(item._watchUrl){try{URL.revokeObjectURL(item._watchUrl)}catch(_){};item._watchUrl=null}
        slot.innerHTML='';b.textContent='▶ ASSISTIR';return
      }
      b.disabled=true;b.textContent='ABRINDO...';
      try{
        slot.innerHTML='<video controls playsinline webkit-playsinline preload="metadata" style="width:100%;max-height:72vh;background:#000;border-radius:16px"></video>';
        const v=slot.querySelector('video');
        let playUrl='';
        if(String(item.url||'').startsWith('history:')||item._savedId){
          const hid=item._savedId||String(item.url).slice(8),row=await vsHistoryGet(hid);
          if(!row?.blob?.size)throw new Error('O vídeo salvo não foi encontrado neste aparelho.');
          playUrl=URL.createObjectURL(row.blob);item._watchUrl=playUrl;
        }else{
          playUrl=String(item.url).startsWith('blob:')?item.url:(item.url+(item.url.includes('?')?'&':'?')+'play='+Date.now());
        }
        v.src=playUrl; v.load();
        v.onerror=async()=>{
          if(String(item.url||'').startsWith('history:')||item._savedId){slot.innerHTML='<div class="origErrorDetail">Não consegui reproduzir o vídeo salvo neste navegador. Tente baixar o arquivo.</div>';b.textContent='▶ TENTAR ASSISTIR';return;}
          try{
            const oldBase=playUrl.replace(/\/jobs\/[^/]+\/file.*$/,'');
            await vsDiscoverMotorPc();
            const newBase=vsRenderServer();
            if(item._pcJobId&&newBase!==oldBase){item.url=newBase+'/jobs/'+encodeURIComponent(item._pcJobId)+'/file';v.src=item.url+'?play='+Date.now();v.load();return;}
          }catch(_){ }
          slot.innerHTML='<div class="origErrorDetail">Não consegui reproduzir este MP4. Tente baixar o arquivo.</div>';b.textContent='▶ TENTAR ASSISTIR';
        };
        try{await v.play()}catch(_){ }
        b.textContent='■ FECHAR';
      }catch(e){
        slot.innerHTML=`<div class="origErrorDetail">${String(e?.message||'Falha ao abrir o vídeo').replace(/[<>]/g,'')} <a href="${item.url}" target="_blank" rel="noopener">Abrir o vídeo diretamente</a></div>`;
        b.textContent='▶ TENTAR ASSISTIR';
      }finally{b.disabled=false}
   });
   box.querySelectorAll('[data-orig-download]').forEach(b=>b.onclick=async()=>{
     const i=+b.dataset.origDownload,item=origRendered[i];if(!item?.url)return;
     b.disabled=true;const old=b.textContent;b.textContent='PREPARANDO...';
     try{
       if(String(item.url).startsWith('history:')||item._savedId){
         const hid=item._savedId||String(item.url).slice(8),row=await vsHistoryGet(hid);if(!row?.blob?.size)throw new Error('Vídeo salvo não encontrado.');
         const u=URL.createObjectURL(row.blob),a=document.createElement('a');a.href=u;a.download=`viral_studio_original_${String((item.sourceIndex??i)+1).padStart(2,'0')}.${row.ext||item.ext||'mp4'}`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),12000);
       }else{
         const a=document.createElement('a');a.href=item.url+(String(item.url).includes('?')?'&':'?')+'download=1';a.download=`viral_studio_original_${String((item.sourceIndex??i)+1).padStart(2,'0')}.${item.ext||'mp4'}`;a.target='_blank';document.body.appendChild(a);a.click();a.remove();
       }
     }catch(e){alert(e?.message||'Não consegui baixar este vídeo.');}
     finally{b.disabled=false;b.textContent=old}
   });
   box.querySelectorAll('[data-orig-generate-one]').forEach(b=>b.onclick=async()=>{
     const i=+b.dataset.origGenerateOne,item=origRendered[i]; if(!item||item.url)return;
     // iPhone: cada render começa diretamente no toque do usuário. Isso evita o bloqueio
     // do Safari que impede play/decoder automático no 2º, 3º... vídeo da fila.
     b.disabled=true;b.textContent='⚡ PREPARANDO...';item.error=null;item._state='working';renderOrigOutputs();
     // V4.38.13 iPhone: o primeiro toque prepara o motor de áudio imediatamente,
     // enquanto o gesto do usuário ainda está ativo. Em seguida fazemos a renderização.
     // Se o primeiro passe falhar por aquecimento/decoder do Safari, repetimos UMA vez
     // internamente com recursos novos, sem exibir um erro intermediário ao usuário.
     let gestureAC=null;
     try{
       const AC=window.AudioContext||window.webkitAudioContext;
       if(AC){gestureAC=new AC(); if(gestureAC.state==='suspended') gestureAC.resume().catch(()=>{});}
       b.textContent='⚡ GERANDO...';
       let out;
       try{out=await renderCombo(item,i,origRendered.length,gestureAC);}
       catch(firstErr){
         try{await gestureAC?.close()}catch(_){} gestureAC=null;
         await new Promise(r=>setTimeout(r,180));
         // Segunda passagem limpa: equivale ao antigo "Tentar novamente", mas automática.
         out=await renderCombo(item,i,origRendered.length);
       }
       item.url=out.remoteUrl||URL.createObjectURL(out.blob);item.ext=out.ext;item.error=null;
     }catch(e){item.error=e?.message||'Falha ao produzir';}
     finally{try{await gestureAC?.close()}catch(_){}}
     item._state='done';renderOrigOutputs();
     const ready=origRendered.filter(x=>x.url).length;
     if($('origStatus'))$('origStatus').textContent=`${ready} de ${origRendered.length} prontos. Toque em GERAR ESTE VÍDEO no próximo.`;
     if($('origProdPct'))$('origProdPct').textContent=Math.round(ready/origRendered.length*100)+'%';
     if($('origProdBar'))$('origProdBar').style.width=Math.round(ready/origRendered.length*100)+'%';
   });
   box.querySelectorAll('[data-orig-retry]').forEach(b=>b.onclick=async()=>{
     const i=+b.dataset.origRetry,item=origRendered[i]; if(!item)return;
     b.disabled=true;b.textContent='TENTANDO...';item.error=null;renderOrigOutputs();
     try{
       const engine=await vsResolveEngineForGeneration();
       const out=await vsGeneratePersistedOutput(item,i,origRendered.length,engine,null);
       item.url=out.url;item._savedId=out.savedId||out.signature||null;item.ext=out.ext;item.error=null;item._historyReused=!!out.reused;
     }catch(e){item.error=e?.message||'Falha ao produzir';}
     renderOrigOutputs();
   });
 }
 $('origProduce')?.addEventListener('click',async()=>{
   const combos=calc(); if(!combos.length)return;
   const picked=[...origSelected].sort((a,b)=>a-b); if(!picked.length){alert('Selecione pelo menos 1 vídeo para gerar.');return}
   const btn=$('origProduce'); btn.disabled=true; btn.textContent='PREPARANDO...';
   const progress=$('origProductionProgress');progress?.classList.remove('hidden');
   origRendered=picked.map(sourceIndex=>{const x=combos[sourceIndex];return {...x,sourceIndex,h:state.h[x.hi],b:state.b[x.bi],c:state.c[x.ci],url:null,error:null,_state:'waiting'} });
   renderOrigOutputs();
   let engine;
   try{engine=await vsResolveEngineForGeneration();}
   catch(e){btn.disabled=false;btn.textContent='🎬 PRODUZIR LOTE';$('origStatus').textContent='❌ '+(e.message||e);alert(e.message||e);return}
   const engineLabel=engine==='pc'?'💻 MOTOR PC':'📱 MOTOR LOCAL';
   $('origStatus').textContent=`${engineLabel}: produzindo ${origRendered.length} vídeo(s).`;
   if($('origProdTitle'))$('origProdTitle').textContent=engineLabel;
   if($('origProdDetail'))$('origProdDetail').textContent=engine==='pc'?'O PC fará o processamento e cada resultado será salvo neste aparelho.':'Este aparelho fará o processamento, um vídeo por vez. Mantenha esta tela aberta.';
   if($('origProdPct'))$('origProdPct').textContent='0%'; if($('origProdBar'))$('origProdBar').style.width='0%';

   let queueAC=null;
   if(engine==='local'){
     if(!vsLocalEngineSupported()){
       btn.disabled=false;btn.textContent='🎬 PRODUZIR LOTE';
       const msg='Este navegador não oferece os recursos necessários para o Motor Local. Conecte o Motor PC ou abra em um navegador compatível.';
       $('origStatus').textContent='❌ '+msg;alert(msg);return;
     }
     try{const AC=window.AudioContext||window.webkitAudioContext;if(AC){queueAC=new AC();if(queueAC.state==='suspended')await queueAC.resume();}}catch(_){ }
   }

   let next=0,done=0;
   const concurrency=engine==='pc'?Math.min(vsMobile?1:2,origRendered.length):1;
   const update=()=>{
     const ready=origRendered.filter(x=>x.url).length,failed=origRendered.filter(x=>x.error).length,pct=Math.round(done/origRendered.length*100);
     if($('origProdPct'))$('origProdPct').textContent=pct+'%';if($('origProdBar'))$('origProdBar').style.width=pct+'%';
     if($('origProdTitle'))$('origProdTitle').textContent=`${engineLabel} • ${ready} prontos`;
     if($('origProdDetail'))$('origProdDetail').textContent=`${done}/${origRendered.length} concluídos • ${failed} erro(s) • salvamento automático ativo`;
   };
   update();
   async function worker(){
     while(true){
       const i=next++;if(i>=origRendered.length)return;
       const item=origRendered[i];item._state='working';item.error=null;renderOrigOutputs();update();
       try{
         const out=await vsGeneratePersistedOutput(item,i,origRendered.length,engine,queueAC);
         item.url=out.url;item._savedId=out.savedId||out.signature||null;item.ext=out.ext;item._historyReused=!!out.reused;item.error=null;
       }catch(e){item.error=e?.message||'Falha ao produzir';}
       item._state='done';done++;renderOrigOutputs();update();await wait(engine==='local'?(vsIOS?350:120):40);
     }
   }
   try{await Promise.all(Array.from({length:Math.max(1,concurrency)},()=>worker()));}
   finally{if(queueAC){try{await queueAC.close()}catch(_){}queueAC=null}}
   if($('origProdPct'))$('origProdPct').textContent='100%';if($('origProdBar'))$('origProdBar').style.width='100%';
   const ready=origRendered.filter(x=>x.url).length;
   if($('origProdTitle'))$('origProdTitle').textContent=ready===origRendered.length?'✓ Produção concluída':'Produção concluída com avisos';
   if($('origProdDetail'))$('origProdDetail').textContent=`${ready} de ${origRendered.length} prontos e salvos neste aparelho.`;
   $('origStatus').textContent=`${ready} vídeo(s) prontos. Se atualizar a página, eles continuam no Histórico salvo.`;
   await vsHistoryRender();
   btn.disabled=false;btn.textContent='🎬 PRODUZIR NOVAMENTE';
 });
})();

// V4.16 — Welcome carousel
(function(){
 const slides=[...document.querySelectorAll('.vsSlide')], dots=[...document.querySelectorAll('[data-vs-slide]')];
 if(!slides.length)return;
 let current=0,timer;
 const show=n=>{current=(n+slides.length)%slides.length;slides.forEach((x,i)=>x.classList.toggle('active',i===current));dots.forEach((x,i)=>x.classList.toggle('active',i===current));};
 const auto=()=>{clearInterval(timer);timer=setInterval(()=>show(current+1),6500)};
 document.querySelector('.vsPrev')?.addEventListener('click',()=>{show(current-1);auto()});
 document.querySelector('.vsNext')?.addEventListener('click',()=>{show(current+1);auto()});
 dots.forEach((d,i)=>d.addEventListener('click',()=>{show(i);auto()}));
 document.querySelectorAll('[data-page-jump]').forEach(b=>b.addEventListener('click',()=>document.querySelector(`[data-page="${b.dataset.pageJump}"]`)?.click()));
 document.querySelectorAll('.goOriginals').forEach(b=>b.addEventListener('click',()=>document.querySelector('[data-page="originals"]')?.click()));
 auto();
})();

// V4.17 — home visual rails
(function(){
 document.querySelectorAll('[data-scroll]').forEach(b=>b.addEventListener('click',()=>{
  const rail=document.getElementById(b.dataset.scroll==='start'?'vsRailStart':'vsRailTools');
  rail?.scrollBy({left:(+b.dataset.dir)*360,behavior:'smooth'});
 }));
 // Rebind navigation for new visual cards.
 document.querySelectorAll('[data-page-jump]').forEach(b=>{
  if(b.dataset.vsBound)return;b.dataset.vsBound='1';
  b.addEventListener('click',()=>document.querySelector(`[data-page="${b.dataset.pageJump}"]`)?.click());
 });
 document.querySelectorAll('.goOriginals').forEach(b=>{
  if(b.dataset.vsOrigBound)return;b.dataset.vsOrigBound='1';
  b.addEventListener('click',()=>document.querySelector('[data-page="originals"]')?.click());
 });
})();

// V4.18 — auto rails + generated results shortcut
(function(){
 const rails=[document.getElementById('vsRailStart'),document.getElementById('vsRailTools')].filter(Boolean);
 rails.forEach((rail,idx)=>{
   let dir=1,paused=false;
   rail.addEventListener('mouseenter',()=>paused=true);rail.addEventListener('mouseleave',()=>paused=false);
   setInterval(()=>{
     if(paused)return;
     const max=rail.scrollWidth-rail.clientWidth;
     if(max<=4)return;
     if(rail.scrollLeft>=max-8)dir=-1; else if(rail.scrollLeft<=8)dir=1;
     rail.scrollBy({left:dir*(idx?290:270),behavior:'smooth'});
   },3800+idx*500);
 });
 document.querySelector('[data-orig-results="1"]')?.addEventListener('click',()=>{
   setTimeout(()=>{
     const out=document.getElementById('origOutputs');
     if(out&&out.children.length)out.scrollIntoView({behavior:'smooth',block:'start'});
     else{
       const status=document.getElementById('origStatus');
       if(status)status.textContent='Seus vídeos produzidos aparecerão aqui depois de gerar um lote.';
       document.getElementById('origReview')?.scrollIntoView({behavior:'smooth',block:'start'});
     }
   },180);
 });
})();







// V4.35 — seleção real de vídeos + downloads por escolha
(function(){
 const KEY='vs_downloaded_v435';
 const $all=(q,r=document)=>[...r.querySelectorAll(q)];
 const db=()=>{try{return JSON.parse(localStorage.getItem(KEY)||'{}')}catch(e){return {}}};
 const save=x=>localStorage.setItem(KEY,JSON.stringify(x));
 const vidKey=a=>a.dataset.downloadId||a.getAttribute('download')||a.href||'';

 function cardOf(a){return a.closest('.origOutputCard')||a.parentElement}
 function paint(a){
   if(!a)return;a.classList.add('downloaded');a.textContent='✓ JÁ BAIXADO';
   const c=cardOf(a);if(c)c.classList.add('wasDownloaded');
 }
 function mark(a){const k=vidKey(a);if(!k)return;const d=db();d[k]=Date.now();save(d);paint(a)}
 function valid(a){const h=a?.getAttribute('href')||'';return h.startsWith('blob:')||h.startsWith('data:')||h.startsWith('https://')||h.startsWith('http://')}

 function enhanceCards(){
   const d=db();
   $all('a.origDownload').forEach((a,i)=>{
     if(!a.dataset.downloadId)a.dataset.downloadId=a.getAttribute('download')||('video-'+(i+1));
     const c=cardOf(a);if(!c)return;
     c.dataset.videoNumber=String(i+1);
     if(!c.querySelector('.vsPick')){
       const label=document.createElement('label');label.className='vsPick';
       label.innerHTML=`<input type="checkbox" class="vsPickBox"> <span>Selecionar vídeo ${i+1}</span>`;
       c.insertBefore(label,c.firstChild);
     } else {
       const sp=c.querySelector('.vsPick span');if(sp)sp.textContent=`Selecionar vídeo ${i+1}`;
     }
     if(d[vidKey(a)])paint(a);
   });
 }
 function selectedLinks(){
   return $all('.vsPickBox:checked').map(cb=>cardOf(cb)?.querySelector('a.origDownload')).filter(a=>a&&valid(a));
 }
 function readyNew(){
   const d=db();return $all('a.origDownload').filter(a=>valid(a)&&!d[vidKey(a)]);
 }
 async function trigger(a){
   if(!valid(a))return false;
   const href=a.getAttribute('href'),name=a.getAttribute('download')||('viral-studio-'+Date.now()+'.mp4');
   if(vsMobile){const ok=await vsSaveMobile(href,name,'video/mp4');if(ok)mark(a);return ok}
   const x=document.createElement('a');x.href=href;x.download=name;
   x.style.display='none';document.body.appendChild(x);x.click();x.remove();mark(a);return true;
 }
 async function downloadList(list){
   if(!list.length){alert('Selecione pelo menos um vídeo que já esteja pronto.');return}
   if(vsMobile && list.length>1)alert('No celular, vou abrir um vídeo por vez para você Salvar/Compartilhar. Assim o navegador não bloqueia vários downloads.');
   for(const a of list){const ok=await trigger(a);if(vsMobile&&!ok)break;await new Promise(r=>setTimeout(r,vsMobile?250:900))}
   update();
 }
 function ensurePanel(){
   if(document.getElementById('vsDownloadManager'))return;
   const first=$all('a.origDownload')[0];if(!first)return;
   const grid=first.closest('#origOutputs,.origOutputs,.origOutputGrid,#origOutputGrid')||cardOf(first)?.parentElement;
   if(!grid)return;
   const p=document.createElement('section');p.id='vsDownloadManager';p.className='vsDownloadManager';
   p.innerHTML=`<div class="vsDmHead"><div><b>ESCOLHA OS VÍDEOS PARA BAIXAR</b><small>Marque exatamente os vídeos que você quer.</small></div><strong id="vsDmCount">0 selecionados</strong></div>
   <div class="vsDmBtns">
     <button type="button" id="vsDownloadSelected">⬇ BAIXAR SELECIONADOS</button>
     <button type="button" id="vsSelectReady">Selecionar todos os prontos</button>
     <button type="button" id="vsClearSelection">Limpar seleção</button>
   </div>`;
   grid.parentNode.insertBefore(p,grid);
   p.querySelector('#vsDownloadSelected').onclick=()=>downloadList(selectedLinks());
   p.querySelector('#vsSelectReady').onclick=()=>{readyNew().forEach(a=>{const cb=cardOf(a)?.querySelector('.vsPickBox');if(cb)cb.checked=true});update()};
   p.querySelector('#vsClearSelection').onclick=()=>{$all('.vsPickBox').forEach(x=>x.checked=false);update()};
 }
 function update(){
   enhanceCards();ensurePanel();
   const n=$all('.vsPickBox:checked').length,c=document.getElementById('vsDmCount');
   if(c)c.textContent=`${n} selecionado${n===1?'':'s'}`;
 }
 let timer=0;
 new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(update,150)}).observe(document.documentElement,{childList:true,subtree:true});
 document.addEventListener('change',e=>{if(e.target.matches('.vsPickBox'))update()});
 // Individual button: keep browser native download, then mark.
 document.addEventListener('click',async e=>{
   const a=e.target.closest('a.origDownload');if(!a)return;
   if(!valid(a)){e.preventDefault();alert('Este vídeo ainda não terminou de gerar.');return}
   if(vsMobile){e.preventDefault();const ok=await trigger(a);if(ok)update();return}
   setTimeout(()=>mark(a),120);
 },false);
 document.addEventListener('DOMContentLoaded',update);setTimeout(update,400);
})();

(function(){window.addEventListener('DOMContentLoaded',()=>{
 if(!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream){
  const m=document.createElement('div');m.className='vsMobileCompatWarn';
  m.textContent='Seu navegador não oferece todos os recursos de geração. No Android, use Chrome atualizado. No iPhone, use Safari atualizado.';
  document.body.prepend(m);
 }
});})();

// V4.38 — perfil simplificado: clique na foto para trocar; X discreto para remover.
(function(){
 const side=document.getElementById('sideAvatarPicker'), main=document.getElementById('profileAvatarPicker');
 const sideInput=document.getElementById('sidePhotoInput'), mainInput=document.getElementById('profilePhotoInput'), rem=document.getElementById('removeProfilePhoto');
 side?.addEventListener('click',e=>{if(e.target.closest('button'))return;sideInput?.click()});
 main?.addEventListener('click',e=>{if(e.target.closest('#removeProfilePhoto'))return;mainInput?.click()});
 sideInput?.addEventListener('change',async e=>{const f=e.target.files?.[0];if(f)await saveProfilePhoto(f);e.target.value=''});
 rem?.addEventListener('click',e=>{e.stopPropagation();localStorage.removeItem('vs_profile_photo');loadProfilePhoto()});
})();

// Mantém o retorno ao início disponível também nas ferramentas abertas fora do menu lateral.
document.querySelectorAll('[data-open-contenthub]').forEach(b=>b.addEventListener('click',()=>mobileHomeBack?.classList.remove('hidden')));


// V4.53 — métricas simples e persistentes do painel de produção
(function(){
 const KEY='vs_prod_stats_v453';
 const today=()=>new Date().toISOString().slice(0,10);
 function load(){let x={date:today(),ready:0,downloads:0};try{x={...x,...JSON.parse(localStorage.getItem(KEY)||'{}')}}catch(_){}if(x.date!==today())x={date:today(),ready:0,downloads:0};return x}
 function save(x){localStorage.setItem(KEY,JSON.stringify(x))}
 function motorText(){const t=(document.getElementById('vsPcMotorStatus')?.textContent||'').toLowerCase();if(t.includes('conect')&&!t.includes('desconect'))return ['🟢','conectado'];if(t.includes('procur')||t.includes('reconect'))return ['🟡','reconectando'];return ['🔴','desconectado']}
 window.vsRefreshDashboardStats=function(){const x=load();const q=(typeof origRendered!=='undefined'&&Array.isArray(origRendered))?origRendered.filter(v=>!v.url&&!v.error).length:0;const [m,md]=motorText();if(document.getElementById('vsStatReadyToday'))document.getElementById('vsStatReadyToday').textContent=x.ready||0;if(document.getElementById('vsStatDownloadedToday'))document.getElementById('vsStatDownloadedToday').textContent=x.downloads||0;if(document.getElementById('vsStatQueue'))document.getElementById('vsStatQueue').textContent=q;if(document.getElementById('vsStatMotor'))document.getElementById('vsStatMotor').textContent=m;if(document.getElementById('vsStatMotorDetail'))document.getElementById('vsStatMotorDetail').textContent=md};
 window.vsStatsScanReady=function(items){const x=load();let add=0;(items||[]).forEach(v=>{if(v?.url&&!v._statsCounted){v._statsCounted=true;add++}});if(add){x.ready=(x.ready||0)+add;save(x)}window.vsRefreshDashboardStats()};
 document.addEventListener('click',e=>{const a=e.target.closest('a.origDownload, a[download]');if(!a)return;const x=load();x.downloads=(x.downloads||0)+1;save(x);window.vsRefreshDashboardStats()});
 setInterval(()=>window.vsRefreshDashboardStats(),3000);window.vsRefreshDashboardStats();
})();


// V4.54 — Viral Shop Engine + demonstração no login
(function(){
 const $v=id=>document.getElementById(id);
 const esc=t=>String(t||'').replace(/[<>]/g,'');
 const presetNames={produto:'Produto Campeão',problema:'Problema → Solução',ugc:'UGC / Vlog',pov:'POV Demonstração',oferta:'Oferta',curiosidade:'Curiosidade'};
 const timings={produto:'0–2s produto + gancho • 2–8s demonstração • 8–15s benefício • CTA',problema:'0–3s dor • 3–9s solução em uso • 9–15s benefício • CTA',ugc:'0–3s recomendação natural • 3–12s uso • 12–18s opinião/benefício • CTA',pov:'0–2s detalhe visual • 2–12s mãos demonstrando • 12–18s resultado visual • CTA',oferta:'0–2s oferta real • 2–8s produto • 8–15s por que vale • CTA',curiosidade:'0–3s curiosidade • 3–8s detalhe escondido • 8–15s demonstração • CTA'};
 function selectedPreset(){return localStorage.getItem('vs_viral_shop_preset')||'produto'}
 function setPreset(k){
  localStorage.setItem('vs_viral_shop_preset',k);localStorage.setItem('vs_viral_shop_label',presetNames[k]||k);
  document.querySelectorAll('#viralPresetGrid [data-preset]').forEach(b=>b.classList.toggle('selected',b.dataset.preset===k));
  if($v('vsShopTiming'))$v('vsShopTiming').textContent=timings[k]||timings.produto;
  const st=$v('origViralPresetStatus');if(st)st.textContent='Modo viral: '+(presetNames[k]||k)+(localStorage.getItem('vs_viral_shop_enabled')==='1'?' ✓ ATIVO':'');
 }
 document.querySelectorAll('#viralPresetGrid [data-preset]').forEach(b=>b.addEventListener('click',()=>setPreset(b.dataset.preset)));
 setPreset(selectedPreset());
 const templates={
  produto:(p,d,b)=>[`Olha esse ${p} — o detalhe que mais chama atenção é ${b||'o acabamento'}.`,`Se você procura ${b||'praticidade'}, presta atenção nesse ${p}.`,`Eu não esperava que esse ${p} entregasse tanto no uso.`],
  problema:(p,d,b)=>[`Se ${d||'isso te incomoda no dia a dia'}, olha como esse ${p} ajuda.`,`Pra quem sofre com ${d||'esse problema'}, esse ${p} faz sentido por um motivo.`,`Antes de conviver com ${d||'esse incômodo'}, olha essa solução.`],
  ugc:(p,d,b)=>[`Eu comecei a usar esse ${p} e o que mais gostei foi ${b||'a praticidade'}.`,`Testei esse ${p} no dia a dia e olha esse detalhe.`,`Se eu tivesse visto isso antes, teria prestado mais atenção nesse ${p}.`],
  pov:(p,d,b)=>[`POV: você pega o ${p} na mão e percebe esse detalhe.`,`Olha de perto como esse ${p} funciona.`,`Repara nessa parte do ${p} — é aqui que ele se destaca.`],
  oferta:(p,d,b)=>[`Se essa condição do ${p} ainda estiver disponível, olha isso antes.`,`O ${p} está com uma condição que vale conferir — mas olha primeiro o produto.`,`Antes de olhar só o preço do ${p}, vê esse benefício: ${b||'o uso no dia a dia'}.`],
  curiosidade:(p,d,b)=>[`Tem um detalhe nesse ${p} que quase ninguém mostra.`,`Eu só entendi por que esse ${p} chama atenção quando vi isso de perto.`,`O que muda nesse ${p} é justamente esse detalhe.`]
 };
 function analyze(){
  const p=esc($v('vsShopProduct')?.value||'produto'),d=esc($v('vsShopPain')?.value||''),b=esc(($v('vsShopBenefits')?.value||'').split(/[,.\n]/)[0]),o=esc($v('vsShopOffer')?.value||''),a=esc($v('vsShopAudience')?.value||'');
  const k=selectedPreset(), hooks=(templates[k]||templates.produto)(p,d,b);
  const ctas=[`Veja as opções do ${p} no produto antes de escolher.`,`Se o ${p} faz sentido pra você, confira os detalhes no carrinho.`,`Gostou do que viu? Abra o produto e confira tamanhos, cores e condições.`];
  const angles=[d?`Dor: ${d}`:`Dor: identifique o incômodo que o ${p} resolve`,b?`Benefício: ${b}`:`Benefício: mostre uma vantagem verdadeira do produto`,a?`Público: ${a}`:'Público: fale como uma pessoa real que usaria o produto',o?`Oferta informada: ${o}`:'Oferta: só destaque quando houver uma condição real'];
  const html=`<div class="viralResultBlock"><b>🎯 ÂNGULOS</b>${angles.map(x=>`<span>${x}</span>`).join('')}</div><div class="viralResultBlock"><b>🪝 GANCHOS</b>${hooks.map((x,i)=>`<span>${i+1}. ${x}</span>`).join('')}</div><div class="viralResultBlock"><b>🛒 CTAs</b>${ctas.map((x,i)=>`<span>${i+1}. ${x}</span>`).join('')}</div>`;
  const out=$v('vsShopAnalysis');if(out){out.classList.remove('empty');out.innerHTML=html;out.dataset.copy=angles.concat(hooks,ctas).join('\n');}
  localStorage.setItem('vs_viral_shop_product',p);localStorage.setItem('vs_viral_shop_analysis',out?.dataset.copy||'');
 }
 $v('vsShopAnalyze')?.addEventListener('click',analyze);
 $v('vsShopApply')?.addEventListener('click',()=>{localStorage.setItem('vs_viral_shop_enabled','1');setPreset(selectedPreset());document.querySelector('[data-page="originals"]')?.click();setTimeout(()=>document.getElementById('origViralPresetStatus')?.scrollIntoView({behavior:'smooth',block:'center'}),150)});
 $v('origOpenViralShop')?.addEventListener('click',()=>{
  // V4.55: o botão viral agora gera o lote diretamente na Central de Originais,
  // do mesmo jeito que "Gerar máximo de originais", sem navegar para outra página.
  const h=document.getElementById('ohCount')?.textContent||'0/10';
  const b=document.getElementById('obCount')?.textContent||'0/10';
  const c=document.getElementById('ocCount')?.textContent||'0/10';
  const n=x=>parseInt(String(x).split('/')[0],10)||0;
  if(!n(h)||!n(b)||!n(c)){alert('Adicione pelo menos 1 Gancho, 1 Corpo e 1 CTA antes de gerar os vídeos virais.');return;}
  localStorage.setItem('vs_viral_shop_enabled','1');
  setPreset(selectedPreset());
  const st=$v('origViralPresetStatus');
  if(st)st.textContent='🔥 Modo viral ATIVO: '+(presetNames[selectedPreset()]||selectedPreset());
  const build=document.getElementById('origBuild');
  if(build){build.click();
    setTimeout(()=>{
      const all=document.getElementById('origSelectAll');
      if(all)all.click();
      const review=document.getElementById('origReview');
      review?.scrollIntoView({behavior:'smooth',block:'start'});
    },120);
  }
});
$v('origViralSettings')?.addEventListener('click',()=>document.querySelector('[data-page="viralshop"]')?.click());
 $v('vsShopCopy')?.addEventListener('click',async()=>{const t=$v('vsShopAnalysis')?.dataset.copy||'';if(!t)return alert('Gere as ideias primeiro.');try{await navigator.clipboard.writeText(t);const b=$v('vsShopCopy');b.textContent='✓ COPIADO';setTimeout(()=>b.textContent='📋 COPIAR IDEIAS',1000)}catch(_){}});
 // restore inputs
 [['vsShopProduct','vs_viral_shop_product']].forEach(([id,key])=>{const el=$v(id),v=localStorage.getItem(key);if(el&&v)el.value=v});
 // V4.56 — demonstração guiada usando o visual real do Studio
 const modal=$v('loginDemoModal');
 const tutorial=$v('vsLoginTutorial');
 const scenes=[...document.querySelectorAll('.vsTutorialScene')];
 const dots=[...document.querySelectorAll('#vsTutorialDots i')];
 const labels=[
  ['1/6 • PAINEL','Acompanhe produção, downloads, fila e Motor PC.'],
  ['2/6 • CENTRAL DE ORIGINAIS','Suba Ganchos, Corpos e CTAs e gere combinações em lote.'],
  ['3/6 • VIRAL SHOP','Escolha estilos de venda, dores, ganchos e CTAs para TikTok Shop.'],
  ['4/6 • PRODUÇÃO','Produza em lote com o Motor PC e acompanhe a fila.'],
  ['5/6 • RESULTADOS','Assista e baixe cada vídeo pronto para postar.'],
  ['6/6 • FLUXO COMPLETO','Do arquivo ao TikTok Shop em um único estúdio.']
 ];
 let tutorialIndex=0,tutorialTimer=null,tutorialPlaying=true;
 function paintTutorial(i){
  tutorialIndex=(i+scenes.length)%scenes.length;
  scenes.forEach((s,n)=>s.classList.toggle('active',n===tutorialIndex));
  dots.forEach((d,n)=>d.classList.toggle('on',n===tutorialIndex));
  const pair=labels[tutorialIndex]||labels[0];
  if($v('vsTutorialStepLabel'))$v('vsTutorialStepLabel').textContent=pair[0];
  if($v('vsTutorialStepText'))$v('vsTutorialStepText').textContent=pair[1];
 }
 function startTutorial(){clearInterval(tutorialTimer);tutorialPlaying=true;if($v('vsTutorialPlay'))$v('vsTutorialPlay').textContent='❚❚ PAUSAR';tutorialTimer=setInterval(()=>paintTutorial(tutorialIndex+1),4200)}
 function pauseTutorial(){clearInterval(tutorialTimer);tutorialPlaying=false;if($v('vsTutorialPlay'))$v('vsTutorialPlay').textContent='▶ CONTINUAR'}
 $v('openLoginDemo')?.addEventListener('click',()=>{modal?.classList.remove('hidden');modal?.setAttribute('aria-hidden','false');paintTutorial(0);startTutorial()});
 $v('closeLoginDemo')?.addEventListener('click',()=>{pauseTutorial();modal?.classList.add('hidden');modal?.setAttribute('aria-hidden','true')});
 $v('vsTutorialPrev')?.addEventListener('click',()=>{paintTutorial(tutorialIndex-1);if(tutorialPlaying)startTutorial()});
 $v('vsTutorialNext')?.addEventListener('click',()=>{paintTutorial(tutorialIndex+1);if(tutorialPlaying)startTutorial()});
 $v('vsTutorialPlay')?.addEventListener('click',()=>tutorialPlaying?pauseTutorial():startTutorial());
 modal?.addEventListener('click',e=>{if(e.target===modal)$v('closeLoginDemo')?.click()});
})();


// V4.57 — 3 modos de criação + remix viral real
(function(){
 const $=id=>document.getElementById(id);
 const modeNames={original:'⚡ Original Rápido',director:'🎬 Diretor IA',shopia:'🧠 Viral Shop IA'};
 function setMode(mode){
   mode=mode||localStorage.getItem('vs_create_mode')||'original';
   localStorage.setItem('vs_create_mode',mode);
   [['origModeOriginal','original'],['origModeDirector','director'],['origModeShopIA','shopia']].forEach(([id,key])=>{const el=$(id); if(el)el.classList.toggle('selected',mode===key)});
   const st=$('origModeStatus'); if(st)st.textContent='Modo atual: '+(modeNames[mode]||modeNames.original);
   if(mode==='original'){localStorage.setItem('vs_viral_shop_enabled','0'); const s=$('origViralPresetStatus'); if(s)s.textContent='Modo original ativo: combinações rápidas';}
   if(mode==='director'){localStorage.setItem('vs_viral_shop_enabled','1'); const s=$('origViralPresetStatus'); if(s)s.textContent='🎬 Diretor IA ativo: envie um vídeo pronto para reconstruir'; const p=$('vsDirectorPanel'); if(p)p.style.display='grid';} else { const p=$('vsDirectorPanel'); if(p)p.style.display='none'; }
   if(mode==='shopia'){localStorage.setItem('vs_viral_shop_enabled','1'); const s=$('origViralPresetStatus'); if(s)s.textContent='🧠 Viral Shop IA ativo: '+(localStorage.getItem('vs_viral_shop_label')||'Produto Campeão');}
 }
 function bind(id,mode,extra){ const el=$(id); if(el)el.addEventListener('click',()=>{ setMode(mode); if(extra)extra(); }); }
 bind('origModeOriginal','original');
 bind('origModeDirector','director');
 bind('origModeShopIA','shopia',()=>document.querySelector('[data-page="viralshop"]')?.click());
 [['origRemixIntensity','vs_remix_intensity','forte'],['origRemixDuration','vs_remix_duration','20'],['origRemixGoal','vs_remix_goal','venda']].forEach(([id,key,def])=>{ const el=$(id); if(!el)return; el.value=localStorage.getItem(key)||def; el.addEventListener('change',()=>localStorage.setItem(key,el.value)); });
 const applyShop=$('vsShopApply'); if(applyShop)applyShop.addEventListener('click',()=>{localStorage.setItem('vs_create_mode','shopia');localStorage.setItem('vs_viral_shop_enabled','1');},true);
 setMode(localStorage.getItem('vs_create_mode')||'original');

 // reforça o botão de viral para ativar remix/shop IA antes de gerar o lote
 const viralBtn=$('origOpenViralShop_REMOVIDO');
 if(viralBtn){ viralBtn.addEventListener('click',()=>{ const current=localStorage.getItem('vs_create_mode')||'director'; if(current==='original') setMode('director'); }, true); }

 // substitui a criação de job para enviar metadados de remix ao Motor PC
 vsCreatePcJob = async function(job){
   const mode=localStorage.getItem('vs_create_mode')||'original';
   if(mode!=='original'){
     try{
       const hr=await fetchWithRetry(vsRenderServer()+'/health',{method:'GET'},2); const hj=await hr.json();
       const ver=String(hj.version||'0').split('.').map(Number); if((ver[0]||0)<5 || ((ver[0]||0)===5&&(ver[1]||0)<1)) throw new Error('old');
     }catch(_){ throw new Error('Para o Remix Viral real, abra o Motor PC V5.1 desta atualização. O Studio bloqueou o motor antigo para não gerar apenas Gancho + Corpo + CTA.'); }
   }
   const clips=await Promise.all([vsEnsurePcAsset(job.h),vsEnsurePcAsset(job.b),vsEnsurePcAsset(job.c)]);
   const payload={
     clips,
     label:`G${job.hi+1}+C${job.bi+1}+CTA${job.ci+1}`,
     preset:(mode==='original'?'original':(localStorage.getItem('vs_viral_shop_preset')||'produto')),
     mode,
     intensity:localStorage.getItem('vs_remix_intensity')||'forte',
     duration:Number(localStorage.getItem('vs_remix_duration')||20),
     goal:localStorage.getItem('vs_remix_goal')||'venda'
   };
   const r=await fetchWithRetry(vsRenderServer()+'/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},5);
   if(!r.ok){let msg='Não consegui criar a tarefa no PC';try{const j=await r.json();msg=j.detail||j.error||msg}catch(_){}throw new Error(msg)}
   const j=await r.json();if(!j.id)throw new Error('Motor Cloud não retornou o ID da tarefa.');return j.id;
 };
})();

// V4.59 — nova fala TikTok Shop + narração enviada ao Motor PC
(function(){
 const $=id=>document.getElementById(id);
 const nar=$('origNewNarration'), count=$('origNarrationCount');
 function sync(){if(count)count.textContent=((nar?.value||'').length)+' caracteres'; if(nar)localStorage.setItem('vs_new_narration',nar.value||'')}
 if(nar){nar.value=localStorage.getItem('vs_new_narration')||'';nar.addEventListener('input',sync);sync()}
 $('origOpenScriptIA')?.addEventListener('click',()=>{document.querySelector('[data-page="viralshop"]')?.click();setTimeout(()=>$('vsOriginalSpeech')?.focus(),100)});
 const clean=t=>String(t||'').replace(/\s+/g,' ').trim();
 function product(){return clean($('vsShopProduct')?.value)||'produto'}
 function benefit(){return clean(($('vsShopBenefits')?.value||'').split(/[,.\n]/)[0])||'praticidade no dia a dia'}
 function pain(){return clean($('vsShopPain')?.value)||'esse problema no dia a dia'}
 function offer(){return clean($('vsShopOffer')?.value)}
 function scripts(){
   const p=product(),b=benefit(),d=pain(),o=offer();
   return [
    `Para tudo e olha esse ${p}. O detalhe que mais chama atenção é ${b}. Dá pra ver no uso como ele pode ajudar com ${d}. ${o?o+'. ':''}Se fez sentido pra você, confira os detalhes no carrinho.`,
    `Eu achei que esse ${p} era comum, até reparar nisso: ${b}. Olha de perto como ele funciona e como pode facilitar quando o problema é ${d}. Gostou? Abre o carrinho e confere as opções.`,
    `Se ${d} te incomoda, presta atenção nesse ${p}. O ponto forte aqui é ${b}, e no vídeo dá pra ver o produto em uso. ${o?o+'. ':''}Confere no carrinho antes de escolher.`,
    `POV: você encontra um ${p} e percebe esse detalhe. ${b}. Em vez de só falar, olha como fica na prática. Se é o tipo de produto que você procura, toca no carrinho e veja os detalhes.`,
    `Tem um detalhe nesse ${p} que eu quase não percebi: ${b}. É justamente isso que chama atenção quando você vê de perto. ${o?o+'. ':''}Quer conferir? O produto está no carrinho.`
   ];
 }
 function renderScripts(){
   const box=$('vsScriptResults');if(!box)return; const original=clean($('vsOriginalSpeech')?.value); const arr=scripts();
   box.innerHTML=arr.map((t,i)=>`<div class="vsScriptOption"><small>VERSÃO ${i+1}${original?' • baseada no contexto informado':''}</small><div>${t}</div><button type="button" data-use-script="${i}">USAR ESTA FALA →</button></div>`).join('');
   box.querySelectorAll('[data-use-script]').forEach(b=>b.addEventListener('click',()=>{const t=arr[Number(b.dataset.useScript)]||arr[0];if(nar){nar.value=t;sync()}localStorage.setItem('vs_create_mode','shopia');localStorage.setItem('vs_viral_shop_enabled','1');document.querySelector('[data-page="originals"]')?.click();setTimeout(()=>nar?.scrollIntoView({behavior:'smooth',block:'center'}),100)}));
 }
 $('vsGenerateScripts')?.addEventListener('click',renderScripts);
 const old=vsCreatePcJob;
 vsCreatePcJob=async function(job){
   const clips=await Promise.all([vsEnsurePcAsset(job.h),vsEnsurePcAsset(job.b),vsEnsurePcAsset(job.c)]);
   const mode=localStorage.getItem('vs_create_mode')||'original';
   const payload={clips,label:`G${job.hi+1}+C${job.bi+1}+CTA${job.ci+1}`,preset:(mode==='original'?'original':(localStorage.getItem('vs_viral_shop_preset')||'produto')),mode,intensity:localStorage.getItem('vs_remix_intensity')||'forte',duration:Number(localStorage.getItem('vs_remix_duration')||20),goal:localStorage.getItem('vs_remix_goal')||'venda',narration:clean(nar?.value||'')};
   const r=await fetchWithRetry(vsRenderServer()+'/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)},5);
   if(!r.ok){let msg='Não consegui criar a tarefa no PC';try{const j=await r.json();msg=j.detail||j.error||msg}catch(_){}throw new Error(msg)}
   const j=await r.json();if(!j.id)throw new Error('Motor Cloud não retornou o ID da tarefa.');return j.id;
 };
})();

// V4.60 — fluxo 1 vídeo -> transcrição local -> 5 roteiros -> 5 vídeos TikTok Shop
(function(){
 const $=id=>document.getElementById(id), input=$('vsAISource'), btn=$('vsAIGenerate'), status=$('vsAIStatus'), results=$('vsAIResults');
 if(!input||!btn)return;
 input.addEventListener('change',()=>{$('vsAIFileName').textContent=input.files?.[0]?.name||'Nenhum vídeo selecionado.'});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function upload(file){
   const id=('ai-'+crypto.randomUUID()).toLowerCase(); const fd=new FormData();fd.append('id',id);fd.append('clip',file,file.name);
   const r=await fetch(vsRenderServer()+'/assets',{method:'POST',body:fd});if(!r.ok)throw new Error('Não consegui enviar o vídeo ao Motor PC.');return id;
 }
 async function waitJob(id){for(let n=0;n<900;n++){const r=await fetch(vsRenderServer()+'/jobs/'+id);const j=await r.json();if(j.status==='ready')return;if(j.status==='error')throw new Error(j.error||'Falha na renderização');status.textContent=`🎬 Renderizando vídeos... ${j.progress||0}%`;await sleep(1500)}throw new Error('Tempo de renderização excedido.');}
 btn.addEventListener('click',async()=>{
   const file=input.files?.[0];if(!file)return alert('Escolha primeiro um vídeo do produto.');
   btn.disabled=true;results.innerHTML='';
   try{
     status.textContent='📤 Enviando vídeo para o Motor IA Local...';const asset=await upload(file);
     status.textContent='🎧 Transcrevendo a fala e criando 5 roteiros no PC...';
     const ar=await fetch(vsRenderServer()+'/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({asset,product:$('vsAIProduct')?.value||'',facts:$('vsAIFacts')?.value||''})});
     const a=await ar.json();if(!ar.ok)throw new Error(a.error||a.detail||'Falha na IA local.');
     status.textContent='🎬 Roteiros prontos. Criando as 5 versões...';
     const presets=['produto','ugc','problema','curiosidade','oferta'];const jobs=[];
     for(let i=0;i<5;i++){const r=await fetch(vsRenderServer()+'/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips:[asset,asset,asset],label:'TikTok Shop IA '+(i+1),preset:presets[i],mode:'shopia',intensity:'forte',duration:20,goal:'venda',narration:a.scripts[i]})});const j=await r.json();if(!r.ok)throw new Error(j.error||'Falha ao criar vídeo '+(i+1));jobs.push(j.id)}
     await Promise.all(jobs.map(waitJob));
     results.innerHTML=jobs.map((id,i)=>`<div class="origOutput"><b>🔥 VERSÃO ${i+1} — ${['Produto Campeão','UGC Natural','Problema → Solução','Curiosidade','Oferta / CTA'][i]}</b><video controls playsinline src="${vsRenderServer()}/jobs/${id}/file"></video><p style="font-size:12px;color:#9fb0c9">${(a.scripts[i]||'').replace(/</g,'&lt;')}</p><a class="button" href="${vsRenderServer()}/jobs/${id}/file" download="tiktok-shop-${i+1}.mp4">⬇ BAIXAR MP4</a></div>`).join('');
     status.textContent='✅ 5 vídeos prontos para revisar e postar no TikTok Shop.';
   }catch(e){console.error(e);status.textContent='❌ '+(e.message||e);alert(e.message||e)}finally{btn.disabled=false}
 });
})();


// V4.70 — Diretor IA TikTok Shop: Gancho + Corpo + CTA completos, duração preservada
(function(){
 const $=id=>document.getElementById(id), src=$('vsDirectorSource'), btn=$('vsDirectorAnalyze'), st=$('vsDirectorStatus'), diag=$('vsDirectorDiagnosis'), out=$('vsDirectorResults');
 if(!src||!btn)return;
 $('origOpenDirector')?.addEventListener('click',()=>{localStorage.setItem('vs_create_mode','director');$('origModeDirector')?.click();setTimeout(()=>$('vsDirectorPanel')?.scrollIntoView({behavior:'smooth',block:'start'}),100)});
 src.addEventListener('change',()=>{$('vsDirectorFile').textContent=src.files?.[0]?.name||'Nenhum vídeo selecionado.'});
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 async function upload(file){const id=('director-'+crypto.randomUUID()).toLowerCase();const fd=new FormData();fd.append('id',id);fd.append('clip',file,file.name);const r=await fetch(vsRenderServer()+'/assets',{method:'POST',body:fd});if(!r.ok)throw new Error('Não consegui enviar o vídeo ao Motor PC.');return id}
 async function wait(id){for(let i=0;i<900;i++){const r=await fetch(vsRenderServer()+'/jobs/'+id);const j=await r.json();if(j.status==='ready')return;if(j.status==='error')throw new Error(j.error||'Falha ao produzir');await sleep(1200)}throw new Error('Tempo de produção excedido.')}
 btn.addEventListener('click',async()=>{
  const file=src.files?.[0];if(!file)return alert('Escolha um vídeo pronto do produto.');btn.disabled=true;out.innerHTML='';diag.textContent='Analisando...';
  try{
   st.textContent='📤 Enviando o vídeo...';const asset=await upload(file);
   st.textContent='🎧 Transcrevendo e analisando ritmo, cenas e roteiro...';
   const r=await fetch(vsRenderServer()+'/director/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({asset,product:$('vsDirectorProduct')?.value||'',facts:$('vsDirectorFacts')?.value||''})});const a=await r.json();if(!r.ok)throw new Error(a.error||a.detail||'Falha no Diretor IA.');
   diag.classList.remove('empty');diag.innerHTML=`<b>📊 DIAGNÓSTICO DO CRIATIVO</b><p>${String(a.diagnosis||'').replace(/</g,'&lt;')}</p><small>Duração detectada: ${Number(a.duration||0).toFixed(1)}s • fala transcrita automaticamente</small>`;
   st.textContent=`🎬 Reconstruindo 5 criativos de aproximadamente ${Number(a.duration||0).toFixed(0)}s...`;const jobs=[];
   for(let i=0;i<a.versions.length;i++){const v=a.versions[i];const jr=await fetch(vsRenderServer()+'/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips:[asset,asset,asset],label:'Diretor IA '+(i+1),preset:v.preset||'produto',mode:'director',intensity:'forte',duration:Number(a.duration||20),goal:'venda',narration:v.script,directorPlan:v.plan})});const j=await jr.json();if(!jr.ok)throw new Error(j.error||'Falha ao criar versão');jobs.push({id:j.id,v})}
   await Promise.all(jobs.map(x=>wait(x.id)));
   out.innerHTML=jobs.map((x,i)=>`<div class="origOutput"><b>🎬 ${String(x.v.name||('VERSÃO '+(i+1))).replace(/</g,'&lt;')}</b><video controls playsinline src="${vsRenderServer()}/jobs/${x.id}/file"></video><div style="font-size:12px;color:#9fb0c9;display:grid;gap:6px"><div><b>🔥 GANCHO:</b> ${String(x.v.hook||'').replace(/</g,'&lt;')}</div><div><b>🎯 CORPO:</b> ${String(x.v.body||'').replace(/</g,'&lt;')}</div><div><b>🛒 CTA:</b> ${String(x.v.cta||'').replace(/</g,'&lt;')}</div></div><a class="button" href="${vsRenderServer()}/jobs/${x.id}/file" download="diretor-ia-${i+1}.mp4">⬇ BAIXAR MP4</a></div>`).join('');
   st.textContent='✅ Diretor IA terminou. Compare as 5 versões completas e escolha as melhores para testar.';
  }catch(e){console.error(e);st.textContent='❌ '+(e.message||e);alert(e.message||e)}finally{btn.disabled=false}
 });
})();


// V4.76 — modo focado: somente Multiplicador Gancho + Corpo + CTA
(()=>{
 const bindFocus=()=>{
  const f=document.getElementById('vsFocusLogout'), old=document.getElementById('logout');
  if(f&&!f.dataset.bound){f.dataset.bound='1';f.addEventListener('click',()=>old?.click());}
  if(document.body.classList.contains('authenticated')){
   document.querySelectorAll('.page').forEach(p=>p.classList.toggle('hidden',p.id!=='originals'));
   document.getElementById('originals')?.classList.remove('hidden');
  }
 };
 document.addEventListener('DOMContentLoaded',bindFocus);
 setTimeout(bindFocus,0);
})();


/* V4.82 COPYFAST — patch final: força apenas Gancho + Corpo + CTA e evita heranças de modos antigos. */
try{localStorage.setItem('vs_create_mode','original');localStorage.setItem('vs_viral_shop_enabled','0');}catch(_){ }
vsCreatePcJob = async function(job){
  const clips=await Promise.all([vsEnsurePcAsset(job.h),vsEnsurePcAsset(job.b),vsEnsurePcAsset(job.c)]);
  const r=await fetchWithRetry(vsRenderServer()+'/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips,label:`G${job.hi+1}+C${job.bi+1}+CTA${job.ci+1}`})},3);
  if(!r.ok){let msg='Não consegui criar a tarefa no Motor Cloud';try{const j=await r.json();msg=j.detail||j.error||msg}catch(_){}throw new Error(msg)}
  const j=await r.json();if(!j.id)throw new Error('Motor Cloud não retornou o ID da tarefa.');return j.id;
};
vsWaitPcJob = async function(id){
  const started=Date.now();
  for(;;){
    if(Date.now()-started>4*60*1000) throw new Error('Motor Cloud passou de 4 minutos. Abra os logs do Render para ver o erro.');
    const r=await fetch(vsRenderServer()+'/jobs/'+encodeURIComponent(id),{cache:'no-store'});
    const j=await r.json().catch(()=>({}));
    if(r.status===404||j.status==='missing') throw new Error('A tarefa sumiu do Motor Cloud.');
    if(j.status==='ready') return {remoteUrl:vsRenderServer()+'/jobs/'+encodeURIComponent(id)+'/file',ext:'mp4',jobId:id};
    if(j.status==='error') throw new Error(j.error||'Falha ao renderizar no Motor Cloud.');
    await wait(900);
  }
};


/* V4.88 — Motor PC automático e robusto. Patch final PC-only.
   - nunca usa Motor Cloud para renderizar
   - valida URL salva antes de usar
   - acorda/consulta o registro da V4.70 e redescobre o Quick Tunnel sozinho
   - se o túnel mudar durante um job, reconecta e continua consultando o mesmo job
   - evita espera infinita com limites claros e mensagens úteis
*/
(function(){
 const REGISTRY='https://ptxxngwpnyrysmxwzyax.supabase.co/functions/v1/viral-studio-motor-pair';
 const PAIR='vs-7f3c9a5e2d8146b8a1f0c4e9';
 const URL_KEY='vs_pc_render_url';
 let connectPromise=null;
 const sleep=ms=>new Promise(r=>setTimeout(r,ms));
 const clean=u=>String(u||'').trim().replace(/\/$/,'');
 const statusEl=()=>document.getElementById('vsPcMotorStatus');
 const urlEl=()=>document.getElementById('vsPcMotorUrl');
 const motorBtn=()=>document.getElementById('vsPcMotor');
 function paint(kind,msg,url=''){
   const s=statusEl(); if(s){s.textContent=msg;s.style.color=kind==='ok'?'#36d6c9':kind==='bad'?'#ff7b8a':'#ffd166'}
   const i=urlEl(); if(i)i.value=url||localStorage.getItem(URL_KEY)||'';
   const b=motorBtn(); if(b)b.textContent=kind==='ok'?'💻 MOTOR PC ✓':kind==='bad'?'💻 MOTOR PC ⚠':'💻 MOTOR PC ↻';
   if(window.vsRefreshDashboardStats)try{window.vsRefreshDashboardStats()}catch(_){ }
 }
 async function fetchTimeout(url,opts={},ms=7000){
   const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
   try{return await fetch(url,{...opts,signal:c.signal,cache:'no-store'})}finally{clearTimeout(t)}
 }
 async function testPc(url,ms=6500){
   url=clean(url); if(!/^https:\/\//i.test(url))return false;
   try{const r=await fetchTimeout(url+'/health',{},ms);if(!r.ok)return false;const j=await r.json().catch(()=>({}));return !!j.ok && (j.engine==='pc'||String(j.service||'').toLowerCase().includes('render pc'));}catch(_){return false}
 }
 async function discoverPc(maxWait=65000){
   const started=Date.now(); let attempt=0;
   paint('wait','🟡 Procurando Motor PC automaticamente…');
   while(Date.now()-started<maxWait){
     attempt++;
     try{
       // Consulta o registro persistente do Motor PC no Supabase.
       const r=await fetchTimeout(REGISTRY+'?pairId='+encodeURIComponent(PAIR),{},attempt===1?12000:6500);
       if(r.ok){
         const j=await r.json().catch(()=>({})); const u=clean(j.url);
         if(j.online&&u&&await testPc(u,7000)){
           localStorage.setItem(URL_KEY,u); paint('ok','🟢 Motor PC conectado automaticamente',u); return u;
         }
       }
     }catch(_){ }
     paint('wait',attempt<3?'🟡 Motor PC aberto? Estou procurando…':'🟡 Aguardando o túnel do Motor PC aparecer…');
     await sleep(attempt<3?1800:3000);
   }
   paint('bad','🔴 Motor PC não encontrado. Abra INICIAR-MOTOR-PC.bat no computador.');
   return null;
 }
 async function ensurePc(force=false){
   if(connectPromise)return connectPromise;
   connectPromise=(async()=>{
     const saved=clean(localStorage.getItem(URL_KEY));
     if(!force&&saved){
       paint('wait','🟡 Verificando Motor PC salvo…',saved);
       if(await testPc(saved,5500)){paint('ok','🟢 Motor PC conectado automaticamente',saved);return saved}
       localStorage.removeItem(URL_KEY);
     }
     return await discoverPc(65000);
   })().finally(()=>{connectPromise=null});
   return connectPromise;
 }

 // Sobrescreve as funções antigas para que nenhuma rota de cloud seja usada na produção.
 vsRenderServer=function(){return clean(localStorage.getItem(URL_KEY))};
 vsUsingPC=function(){return !!clean(localStorage.getItem(URL_KEY))};
 vsDiscoverMotorPc=async function(){return await ensurePc(true)};
 window.vsDiscoverMotorPc=vsDiscoverMotorPc;
 window.vsEnsurePcConnection=ensurePc;

 const assetPromises=new Map();
 vsEnsurePcAsset=async function(file){
   const base=await ensurePc(false); if(!base)throw new Error('Motor PC não conectado. Abra o Motor PC no computador e aguarde a conexão automática.');
   const id=await vsPcAssetId(file);
   if(assetPromises.has(id))return assetPromises.get(id);
   const task=(async()=>{
     let current=await ensurePc(false); if(!current)throw new Error('Motor PC não conectado.');
     try{const chk=await fetchTimeout(current+'/assets/'+id,{},8000);if(chk.ok){const j=await chk.json().catch(()=>null);if(j?.exists)return id}}catch(_){
       current=await ensurePc(true); if(!current)throw new Error('A conexão com o Motor PC caiu.');
     }
     const fd=new FormData();fd.append('id',id);fd.append('clip',file,file.name||'clip.mp4');
     const r=await fetchTimeout(current+'/assets',{method:'POST',body:fd},20*60*1000);
     if(!r.ok){let msg='Falha ao enviar o vídeo ao Motor PC';try{const j=await r.json();msg=j.detail||j.error||msg}catch(_){}throw new Error(msg)}
     return id;
   })().catch(e=>{assetPromises.delete(id);throw e});
   assetPromises.set(id,task);return task;
 };

 vsCreatePcJob=async function(job){
   let base=await ensurePc(false); if(!base)throw new Error('Motor PC não conectado.');
   const clips=await Promise.all([vsEnsurePcAsset(job.h),vsEnsurePcAsset(job.b),vsEnsurePcAsset(job.c)]);
   base=await ensurePc(false)||base;
   const signature=[...clips,job.hi,job.bi,job.ci].join('|');
   let r;
   try{r=await fetchTimeout(base+'/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips,label:`G${job.hi+1}+C${job.bi+1}+CTA${job.ci+1}`,preset:'original',mode:'original',signature})},20000)}
   catch(_){base=await ensurePc(true);if(!base)throw new Error('A conexão com o Motor PC caiu antes de criar a tarefa.');r=await fetchTimeout(base+'/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({clips,label:`G${job.hi+1}+C${job.bi+1}+CTA${job.ci+1}`,preset:'original',mode:'original',signature})},20000)}
   if(!r.ok){let msg='Não consegui criar a tarefa no Motor PC';try{const j=await r.json();msg=j.detail||j.error||msg}catch(_){}throw new Error(msg)}
   const j=await r.json();if(!j.id)throw new Error('Motor PC não retornou o ID da tarefa.');return j.id;
 };

 vsWaitPcJob=async function(id){
   const started=Date.now();let misses=0,lastProgress=-1;
   for(;;){
     if(Date.now()-started>20*60*1000)throw new Error('A renderização passou de 20 minutos. Verifique a janela do Motor PC para identificar o arquivo que travou.');
     let base=await ensurePc(false); if(!base)base=await ensurePc(true);
     if(!base)throw new Error('Motor PC ficou offline. Deixe o Motor aberto e tente novamente.');
     try{
       const r=await fetchTimeout(base+'/jobs/'+encodeURIComponent(id),{},9000);
       if(r.ok){const j=await r.json();misses=0;lastProgress=Number(j.progress||lastProgress);
         if(j.status==='ready')return {remoteUrl:base+'/jobs/'+encodeURIComponent(id)+'/file',ext:'mp4',jobId:id};
         if(j.status==='error'||j.status==='missing')throw new Error(j.error||'Falha ao renderizar no Motor PC.');
       }else if(r.status===404)throw new Error('A tarefa não foi encontrada no Motor PC.');
     }catch(e){
       const m=String(e?.message||e);if(m.includes('Falha ao renderizar')||m.includes('não foi encontrada'))throw e;
       misses++; localStorage.removeItem(URL_KEY);
       if(misses>=4){const rebased=await ensurePc(true);if(!rebased)throw new Error('A conexão com o Motor PC caiu. A tarefa pode continuar no computador; aguarde o Motor reconectar.');misses=0}
     }
     await sleep(1000);
   }
 };

 renderComboServer=async function(job){
   const base=await ensurePc(false);if(!base)throw new Error('Motor PC não encontrado. Abra o Motor PC no computador.');
   const id=job._pcJobId||await vsCreatePcJob(job);job._pcJobId=id;
   return await vsWaitPcJob(id);
 };
 wakeRenderServer=async function(){return !!(await ensurePc(false))};

 async function refreshUi(force=false){
   const u=await ensurePc(force);return !!u;
 }
 window.addEventListener('DOMContentLoaded',()=>{
   const connect=document.getElementById('vsPcMotorConnect');
   const clear=document.getElementById('vsPcMotorDisconnect');
   connect?.addEventListener('click',()=>refreshUi(true));
   clear?.addEventListener('click',()=>{localStorage.removeItem(URL_KEY);paint('wait','🟡 URL limpa. Procurando Motor PC novamente…');refreshUi(true)});
   motorBtn()?.addEventListener('click',()=>refreshUi(false));
   refreshUi(false);
   setInterval(()=>{if(!document.hidden)refreshUi(false)},25000);
 });
 window.addEventListener('online',()=>refreshUi(true));
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshUi(false)});
})();


/* V4.90 — Motor Híbrido + Histórico Persistente + Pair Supabase + Local leve.
   AUTO: usa Motor PC quando ele responde rapidamente; sem PC, usa Motor Local do navegador.
   Todos os vídeos concluídos são salvos em IndexedDB e reaproveitados pela assinatura Gancho+Corpo+CTA.
*/
const VS_OUT_DB='viral-studio-output-history-v1';
const VS_OUT_STORE='videos';
let vsHistoryObjectUrls=[];
function vsOutputDb(){return new Promise((resolve,reject)=>{const q=indexedDB.open(VS_OUT_DB,1);q.onupgradeneeded=()=>{const db=q.result;if(!db.objectStoreNames.contains(VS_OUT_STORE)){const s=db.createObjectStore(VS_OUT_STORE,{keyPath:'id'});s.createIndex('createdAt','createdAt')}};q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
async function vsHistoryGet(id){const db=await vsOutputDb();return await new Promise((res,rej)=>{const q=db.transaction(VS_OUT_STORE,'readonly').objectStore(VS_OUT_STORE).get(id);q.onsuccess=()=>res(q.result||null);q.onerror=()=>rej(q.error)})}
async function vsHistoryPut(row){const db=await vsOutputDb();return await new Promise((res,rej)=>{const q=db.transaction(VS_OUT_STORE,'readwrite').objectStore(VS_OUT_STORE).put(row);q.onsuccess=()=>res(true);q.onerror=()=>rej(q.error)})}
async function vsHistoryDelete(id){const db=await vsOutputDb();await new Promise((res,rej)=>{const q=db.transaction(VS_OUT_STORE,'readwrite').objectStore(VS_OUT_STORE).delete(id);q.onsuccess=()=>res();q.onerror=()=>rej(q.error)});await vsHistoryRender()}
async function vsHistoryAll(){const db=await vsOutputDb();return await new Promise((res,rej)=>{const q=db.transaction(VS_OUT_STORE,'readonly').objectStore(VS_OUT_STORE).getAll();q.onsuccess=()=>res((q.result||[]).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)));q.onerror=()=>rej(q.error)})}
async function vsOutputSignature(item){const ids=await Promise.all([vsPcAssetId(item.h),vsPcAssetId(item.b),vsPcAssetId(item.c)]);return 'combo-'+(await vsSmallHash(ids.join('|'))).slice(0,48)}
function vsLocalEngineSupported(){return !!(window.MediaRecorder&&HTMLCanvasElement.prototype.captureStream&&(window.AudioContext||window.webkitAudioContext))}
async function vsQuickPcAvailable(){
 const saved=String(localStorage.getItem('vs_pc_render_url')||'').replace(/\/$/,'');
 if(saved){try{const c=new AbortController(),t=setTimeout(()=>c.abort(),3500);const r=await fetch(saved+'/health',{cache:'no-store',signal:c.signal});clearTimeout(t);if(r.ok){const j=await r.json().catch(()=>({}));if(j.ok)return true}}catch(_){}}
 if(window.vsEnsurePcConnection){try{const u=await Promise.race([window.vsEnsurePcConnection(false),new Promise(r=>setTimeout(()=>r(null),5500))]);return !!u}catch(_){}}
 return false;
}
async function vsResolveEngineForGeneration(){
 const mode=localStorage.getItem('vs_engine_mode')||'auto';
 if(mode==='local'){vsSetEngineUi('local','📱 Motor Local selecionado. Este aparelho fará a geração.');return 'local'}
 if(mode==='pc'){
   const ok=await vsQuickPcAvailable();if(!ok)throw new Error('Motor PC não encontrado. Abra o Motor no computador ou escolha AUTO/MOTOR LOCAL.');
   vsSetEngineUi('pc','💻 Motor PC conectado e selecionado.');return 'pc';
 }
 const ok=await vsQuickPcAvailable();
 if(ok){vsSetEngineUi('pc','✨ AUTO escolheu o Motor PC porque ele está disponível.');return 'pc'}
 if(!vsLocalEngineSupported())throw new Error('Motor PC não foi encontrado e este navegador não suporta o Motor Local.');
 vsSetEngineUi('local','✨ AUTO não encontrou o PC; usando o Motor Local deste aparelho.');return 'local';
}
async function vsFetchPcOutput(remoteUrl){
 let last;
 for(let n=0;n<3;n++){
   try{const c=new AbortController(),t=setTimeout(()=>c.abort(),3*60*1000);const r=await fetch(remoteUrl,{cache:'no-store',signal:c.signal});clearTimeout(t);if(!r.ok)throw new Error('Erro '+r.status+' ao baixar resultado do PC');const b=await r.blob();if(!b.size)throw new Error('O Motor PC retornou arquivo vazio.');return b}catch(e){last=e;await new Promise(r=>setTimeout(r,700*(n+1)))}
 }
 throw last||new Error('Não consegui salvar o vídeo vindo do Motor PC.');
}
async function vsGeneratePersistedOutput(item,index,total,engine,sharedAC){
 const signature=await vsOutputSignature(item),cached=await vsHistoryGet(signature);
 if(cached?.blob?.size){return {url:'history:'+signature,savedId:signature,ext:cached.ext||'mp4',reused:true,signature}}
 let blob,ext='mp4';
 if(engine==='pc'){
   const out=await renderComboServer(item);ext=out.ext||'mp4';blob=out.blob||await vsFetchPcOutput(out.remoteUrl);
 }else{
   const out=await renderCombo(item,index,total,sharedAC);blob=out.blob;ext=out.ext||'webm';
 }
 if(!blob?.size)throw new Error('O vídeo foi gerado vazio.');
 await vsHistoryPut({id:signature,blob,ext,createdAt:Date.now(),engine,product:(document.getElementById('product')?.value||'').trim(),hi:item.hi,bi:item.bi,ci:item.ci,hName:item.h?.name||'',bName:item.b?.name||'',cName:item.c?.name||'',size:blob.size});
 // Não mantém um ObjectURL grande preso na memória do iPhone. O arquivo é aberto do histórico só quando o usuário toca.
 blob=null;
 return {url:'history:'+signature,savedId:signature,ext,reused:false,signature};
}
function vsSetEngineUi(active,msg){
 const saved=localStorage.getItem('vs_engine_mode')||'auto';
 document.querySelectorAll('[data-vs-engine]').forEach(b=>b.classList.toggle('selected',b.dataset.vsEngine===saved));
 const st=document.getElementById('vsEngineStatus');if(st)st.textContent=msg||'';
 const badge=document.getElementById('vsEngineLiveBadge');if(badge)badge.textContent=active==='pc'?'MOTOR PC':active==='local'?'MOTOR LOCAL':'AUTO';
}
function vsInitEngineUi(){
 const saved=localStorage.getItem('vs_engine_mode')||'auto';
 document.querySelectorAll('[data-vs-engine]').forEach(b=>{b.classList.toggle('selected',b.dataset.vsEngine===saved);b.onclick=()=>{localStorage.setItem('vs_engine_mode',b.dataset.vsEngine);vsInitEngineUi()}});
 if(saved==='auto')vsSetEngineUi('auto','AUTO: usa o PC quando disponível; sem PC, gera neste aparelho.');
 if(saved==='pc')vsSetEngineUi('pc','MOTOR PC: exige o Motor aberto e conectado.');
 if(saved==='local')vsSetEngineUi('local',vsLocalEngineSupported()?'MOTOR LOCAL: este aparelho fará a geração.':'MOTOR LOCAL indisponível neste navegador.');
}
async function vsHistoryRender(){
 const box=document.getElementById('vsSavedHistory');if(!box)return;
 vsHistoryObjectUrls.forEach(u=>{try{URL.revokeObjectURL(u)}catch(_){}});vsHistoryObjectUrls=[];
 let rows=[];try{rows=await vsHistoryAll()}catch(e){box.className='vsSavedHistoryEmpty';box.textContent='Não consegui abrir o histórico: '+(e.message||e);return}
 if(!rows.length){box.className='vsSavedHistoryEmpty';box.textContent='Nenhum vídeo salvo ainda.';return}
 box.className='vsHistoryGrid';
 box.innerHTML=rows.map((r,i)=>`<article class="vsHistoryCard" data-hid="${r.id}"><div class="vsHistoryTop"><div><b>Vídeo salvo ${String(i+1).padStart(2,'0')}</b><small>G${Number(r.hi)+1} + C${Number(r.bi)+1} + CTA${Number(r.ci)+1} • ${new Date(r.createdAt).toLocaleString('pt-BR')}</small></div><span class="vsHistoryBadge">${r.engine==='pc'?'💻 PC':'📱 LOCAL'}</span></div><div class="vsHistoryActions"><button type="button" data-hwatch="${r.id}">▶ ASSISTIR</button><button type="button" data-hdownload="${r.id}">↓ BAIXAR</button><button type="button" data-hdelete="${r.id}">🗑 EXCLUIR</button></div><div class="vsHistoryPreview"></div></article>`).join('');
 box.querySelectorAll('[data-hwatch]').forEach(b=>b.onclick=async()=>{const row=await vsHistoryGet(b.dataset.hwatch),card=b.closest('.vsHistoryCard'),slot=card.querySelector('.vsHistoryPreview');if(!row?.blob)return;if(slot.querySelector('video')){slot.innerHTML='';b.textContent='▶ ASSISTIR';return}const u=URL.createObjectURL(row.blob);vsHistoryObjectUrls.push(u);slot.innerHTML='<video controls playsinline webkit-playsinline preload="metadata"></video>';slot.querySelector('video').src=u;b.textContent='■ FECHAR'});
 box.querySelectorAll('[data-hdownload]').forEach(b=>b.onclick=async()=>{const row=await vsHistoryGet(b.dataset.hdownload);if(!row?.blob)return;const u=URL.createObjectURL(row.blob),a=document.createElement('a');a.href=u;a.download=`viral_studio_${new Date(row.createdAt).toISOString().slice(0,10)}_G${Number(row.hi)+1}_C${Number(row.bi)+1}_CTA${Number(row.ci)+1}.${row.ext||'mp4'}`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000)});
 box.querySelectorAll('[data-hdelete]').forEach(b=>b.onclick=async()=>{if(confirm('Excluir este vídeo salvo deste aparelho?'))await vsHistoryDelete(b.dataset.hdelete)});
}
window.vsHistoryRender=vsHistoryRender;
window.addEventListener('DOMContentLoaded',()=>{vsInitEngineUi();vsHistoryRender();document.getElementById('vsHistoryRefresh')?.addEventListener('click',vsHistoryRender)});
