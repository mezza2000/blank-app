const BASE = 'https://rosta-travel.vercel.app';
const token = process.env.TELEGRAM_BOT_TOKEN || '';
const repo = process.env.GITHUB_REPOSITORY || '';
const ghToken = process.env.GITHUB_TOKEN || '';
const stateRaw = process.env.ROSTA_STATE || '';
const trainAndata = process.env.ROSTA_TRAIN_ANDATA || '07:50';
const trainRitorno = process.env.ROSTA_TRAIN_RITORNO || '17:45';
const delayThreshold = Number(process.env.ROSTA_DELAY_THRESHOLD || 3);

function safeJson(v, fallback) { try { return v ? JSON.parse(v) : fallback; } catch { return fallback; } }
let state = safeJson(stateRaw, { version: 1, chatId: null, trains: {}, seenStrikes: [] });
if (!state || typeof state !== 'object') state = { version: 1, chatId: null, trains: {}, seenStrikes: [] };
state.trains ||= {}; state.seenStrikes ||= [];

function romeParts() {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone:'Europe/Rome', year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false
  }).formatToParts(new Date());
  const o={}; for(const x of p) if(x.type!=='literal') o[x.type]=x.value; return o;
}
function hm(v){const m=String(v).match(/^(\d{2}):(\d{2})$/);return m?Number(m[1])*60+Number(m[2]):null}
function isoDate(p){return `${p.year}-${p.month}-${p.day}`}
function inWindow(now, dep){let d=now-dep;if(d>720)d-=1440;if(d<-720)d+=1440;return d>=-45&&d<=15}
async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return r.json()}

async function setRepoVariable(name, value) {
  if (!repo || !ghToken) return false;
  const headers = {
    'Accept':'application/vnd.github+json',
    'Authorization':`Bearer ${ghToken}`,
    'X-GitHub-Api-Version':'2026-03-10',
    'Content-Type':'application/json'
  };
  const base=`https://api.github.com/repos/${repo}/actions/variables`;
  let r=await fetch(`${base}/${encodeURIComponent(name)}`,{method:'PATCH',headers,body:JSON.stringify({name,value})});
  if(r.status===404) r=await fetch(base,{method:'POST',headers,body:JSON.stringify({name,value})});
  return r.ok;
}

async function resolveChatId() {
  if (state.chatId) return String(state.chatId);
  const d=await json(`https://api.telegram.org/bot${token}/getUpdates?limit=100`);
  if(!d.ok)return null;
  const chats=d.result.map(u=>u.message?.chat||u.edited_message?.chat||u.callback_query?.message?.chat).filter(c=>c?.type==='private');
  if(!chats.length)return null;
  state.chatId=String(chats[chats.length-1].id);
  return state.chatId;
}

async function send(chatId,text){
  const r=await fetch(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chatId,text,disable_web_page_preview:true})});
  const d=await r.json(); if(!d.ok)throw new Error(d.description||'Telegram sendMessage failed');
}

function trainSignature(d){
  if(!d?.ok||!d.found)return 'unknown';
  if(d.cancelled)return 'cancelled';
  if(d.changed)return `changed:${Number(d.delay||0)}`;
  const delay=Number(d.delay||0);
  if(delay>=delayThreshold)return `delay:${delay}`;
  return 'ok';
}
function humanTrain(direction,time,d){
  const route=direction==='andata'?'Rosta → Porta Nuova':'Porta Nuova → Rosta';
  const bits=[d.trainNumber?`Treno ${d.trainNumber}`:null,d.platform?`Binario ${d.platform}`:null].filter(Boolean).join(' • ');
  let stateText='';
  if(d.cancelled)stateText='❌ CANCELLATO';
  else if(d.changed)stateText=d.delay>0?`⚠️ Corsa modificata · +${d.delay} min`:'⚠️ Corsa modificata';
  else if(Number(d.delay||0)>=delayThreshold)stateText=`⏱ Ritardo +${d.delay} min`;
  else stateText='✅ Tornato in orario';
  return `🚆 RostaTravel\n${route} · ${time}\n${stateText}${bits?`\n${bits}`:''}`;
}

async function checkTrain(chatId,direction,time,p){
  const dep=hm(time),now=Number(p.hour)*60+Number(p.minute); if(dep==null||!inWindow(now,dep))return;
  const d=await json(`${BASE}/api/status?direction=${direction}&time=${encodeURIComponent(time)}`);
  const key=`${isoDate(p)}:${direction}:${time}`;
  const prev=state.trains[key]||'none',sig=trainSignature(d);
  if(sig==='unknown'){state.trains[key]=sig;return}
  const prevProblem=prev.startsWith('delay:')||prev.startsWith('changed:')||prev==='cancelled';
  const nowProblem=sig.startsWith('delay:')||sig.startsWith('changed:')||sig==='cancelled';
  let shouldSend=false;
  if(nowProblem&&sig!==prev)shouldSend=true;
  if(!nowProblem&&prevProblem)shouldSend=true;
  if(shouldSend)await send(chatId,humanTrain(direction,time,d));
  state.trains[key]=sig;
  for(const k of Object.keys(state.trains))if(!k.startsWith(isoDate(p)+':'))delete state.trains[k];
}

function strikeKey(s){return s.guid||`${s.startISO}|${s.endISO}|${s.category}|${s.mode}`}
async function checkStrikes(chatId){
  const d=await json(`${BASE}/api/strikes`); if(!d?.ok||!Array.isArray(d.strikes))return;
  const seen=new Set(state.seenStrikes||[]),fresh=d.strikes.filter(s=>!seen.has(strikeKey(s)));
  for(const s of fresh.slice(0,4)){
    const kind=s.kind==='metro'?'🚇 Metro/TPL':'🚆 Ferroviario';
    const dates=s.end&&s.end!==s.start?`${s.start} → ${s.end}`:s.start;
    await send(chatId,`⚠️ RostaTravel — Nuovo sciopero rilevante\n${kind} · ${dates}\n${s.category||s.sector}\n${s.mode||''}\n\n🛡️ Fasce Regionale: feriali 06:00–09:00 e 18:00–21:00; festivi 07:00–10:00 e 18:00–21:00.`);
  }
  state.seenStrikes=d.strikes.map(strikeKey).slice(0,30);
}

async function main(){
  if(!token){console.log('TELEGRAM_BOT_TOKEN non configurato: nessuna notifica inviata.');return}
  if(!stateRaw){
    const ok=await setRepoVariable('ROSTA_STATE',JSON.stringify(state));
    if(!ok){console.log('Impossibile creare ROSTA_STATE: controllo notifiche non avviato per evitare duplicati.');return}
  }
  const chatId=await resolveChatId();
  if(!chatId){console.log('Chat Telegram non ancora rilevata. Invia /start a RostaTravel.');await setRepoVariable('ROSTA_STATE',JSON.stringify(state));return}
  if(!state.activated){
    await send(chatId,'🔔 RostaTravel: notifiche automatiche attivate. Controllerò ritardi, cancellazioni e nuovi scioperi rilevanti.');
    state.activated=true;
  }
  const p=romeParts();
  await Promise.allSettled([checkTrain(chatId,'andata',trainAndata,p),checkTrain(chatId,'ritorno',trainRitorno,p)]);
  await checkStrikes(chatId);
  const saved=await setRepoVariable('ROSTA_STATE',JSON.stringify(state));
  if(!saved)throw new Error('Impossibile salvare ROSTA_STATE');
  console.log('Controllo RostaTravel completato.');
}
main().catch(e=>{console.error(e.message||e);process.exitCode=1});