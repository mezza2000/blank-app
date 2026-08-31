const VT_BASE = 'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/';

const STATIONS = [
  { id:'torino-porta-nuova', label:'Torino Porta Nuova', api:'TORINO PORTA NUOVA' },
  { id:'grugliasco', label:'Grugliasco', api:'GRUGLIASCO' },
  { id:'collegno', label:'Collegno', api:'COLLEGNO' },
  { id:'alpignano', label:'Alpignano', api:'ALPIGNANO' },
  { id:'rosta', label:'Rosta', api:'ROSTA' },
  { id:'avigliana', label:'Avigliana', api:'AVIGLIANA' },
  { id:'sant-ambrogio', label:"Sant'Ambrogio", api:'S.AMBROGIO' },
  { id:'condove', label:'Condove', api:'CONDOVE' },
  { id:'sant-antonino-vaie', label:"Sant'Antonino-Vaie", api:'S.ANTONINO-VAIE' },
  { id:'borgone', label:'Borgone', api:'BORGONE' },
  { id:'bruzolo-di-susa', label:'Bruzolo di Susa', api:'BRUZOLO DI SUSA' },
  { id:'bussoleno', label:'Bussoleno', api:'BUSSOLENO' },
  { id:'meana', label:'Meana', api:'MEANA' },
  { id:'chiomonte', label:'Chiomonte', api:'CHIOMONTE' },
  { id:'salbertrand', label:'Salbertrand', api:'SALBERTRAND' },
  { id:'oulx', label:'Oulx-Cesana-Claviere', api:'OULX-CESANA-CLAVIERE' },
  { id:'beaulard', label:'Beaulard', api:'BEAULARD' },
  { id:'bardonecchia', label:'Bardonecchia', api:'BARDONECCHIA' }
];

const BUSSOLENO_INDEX = STATIONS.findIndex(x => x.id === 'bussoleno');

function norm(v='') {
  return String(v).trim().toUpperCase().replace(/[.’']/g,"'").replace(/\s+/g,' ');
}

async function vtFetch(path, asText=false) {
  const r = await fetch(VT_BASE + path, {
    headers:{
      Accept: asText ? 'text/plain,*/*' : 'application/json,*/*',
      'User-Agent':'RostaTravel/1.0'
    },
    cache:'no-store'
  });
  if (!r.ok) throw new Error(`ViaggiaTreno HTTP ${r.status}`);
  return asText ? r.text() : r.json();
}

const codeCache = new Map([['TORINO PORTA NUOVA','S00219']]);
async function stationCode(name) {
  const key = norm(name);
  if (codeCache.has(key)) return codeCache.get(key);
  const text = await vtFetch(`autocompletaStazione/${encodeURIComponent(name)}`, true);
  const rows = text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const exact = rows.find(row => norm(row.split('|')[0]) === key) || rows[0];
  if (!exact?.includes('|')) throw new Error(`Codice stazione non trovato: ${name}`);
  const code = exact.split('|')[1].trim();
  codeCache.set(key, code);
  return code;
}

const WD=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const MO=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function queryDateString(date,time) {
  const [y,m,d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y,m-1,d,12,0,0));
  return `${WD[dt.getUTCDay()]} ${MO[m-1]} ${String(d).padStart(2,'0')} ${y} ${time}:00`;
}

function todayRome() {
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
}

function itemKey(x) {
  return `${x.codOrigine||''}:${x.numeroTreno||x.compNumeroTreno||''}:${x.dataPartenzaTreno||x.millisDataPartenza||''}`;
}

function itemDeparture(x) {
  return x.compOrarioPartenza || x.compOrarioPartenzaZero || x.compOrarioPartenzaZeroEffettivo || '';
}

function destinationIndex(name) {
  const n=norm(name);
  return STATIONS.findIndex(s => norm(s.api)===n || norm(s.label)===n);
}

function candidateForDirection(item, fromIdx, toIdx) {
  const regional = Number(item.codiceCliente) === 2 || norm(item.categoria).includes('REG') || norm(item.compNumeroTreno).includes('REG');
  if (!regional) return false;
  const dest=norm(item.destinazione);
  if (toIdx < fromIdx) return dest === 'TORINO PORTA NUOVA';
  if (dest === 'SUSA') return toIdx <= BUSSOLENO_INDEX;
  const di = destinationIndex(dest);
  return di >= toIdx;
}

async function andamento(item) {
  const origin=item.codOrigine;
  const number=item.numeroTreno;
  const date=item.dataPartenzaTreno || Number(item.millisDataPartenza);
  if (!origin || !number || !date) return null;
  try { return await vtFetch(`andamentoTreno/${origin}/${number}/${date}`); }
  catch (_) { return null; }
}

function stationMatch(stop, station) {
  const n=norm(stop?.stazione);
  const targets=[station.api,station.label];
  if (station.id==='sant-ambrogio') targets.push("S.AMBROGIO", "SANT'AMBROGIO");
  if (station.id==='sant-antonino-vaie') targets.push('S.ANTONINO-VAIE','SANT\'ANTONINO-VAIE');
  if (station.id==='oulx') targets.push('OULX-CESANA-CLAVIERE','OULX-CESANA-CLAVIERE-SESTRIERE');
  return targets.some(x=>norm(x)===n);
}

function timeFromMs(ms) {
  if (!Number.isFinite(Number(ms))) return null;
  const p=new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',hour12:false}).formatToParts(new Date(Number(ms)));
  const o={}; for(const x of p) if(x.type!=='literal')o[x.type]=x.value;
  return `${o.hour}:${o.minute}`;
}

function durationMinutes(a,b) {
  if (!Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) return null;
  const n=Math.round((Number(b)-Number(a))/60000);
  return n>=0?n:null;
}

function detailToTrip(item, detail, from, to) {
  if (!detail || !Array.isArray(detail.fermate)) return null;
  const fi=detail.fermate.findIndex(f=>stationMatch(f,from));
  const ti=detail.fermate.findIndex(f=>stationMatch(f,to));
  if (fi<0 || ti<0 || ti<=fi) return null;
  const fs=detail.fermate[fi], ts=detail.fermate[ti];
  if (Number(fs.actualFermataType)===3 || Number(ts.actualFermataType)===3) return null;
  const depMs=fs.partenza_teorica || fs.programmata;
  const arrMs=ts.arrivo_teorico || ts.programmata;
  const dep=timeFromMs(depMs) || itemDeparture(item);
  const arr=timeFromMs(arrMs);
  if (!dep || !arr) return null;
  const tipo=norm(detail.tipoTreno||'');
  const prov=Number(detail.provvedimento||item.provvedimento||0);
  const cancelled=tipo==='ST'||prov===1;
  const changed=!cancelled && (prov===2||prov===3||['SF','SI','SM','VD','VO','DV'].includes(tipo)||detail.riprogrammazione==='Y'||item.riprogrammazione==='Y');
  const delay=Number(fs.ritardoPartenza ?? fs.ritardo ?? detail.ritardo ?? item.ritardo ?? 0);
  const platform=fs.binarioEffettivoPartenzaDescrizione||fs.binarioProgrammatoPartenzaDescrizione||item.binarioEffettivoPartenzaDescrizione||item.binarioProgrammatoPartenzaDescrizione||null;
  return {
    trainNumber:detail.numeroTreno||item.numeroTreno||null,
    category:item.compNumeroTreno||item.categoriaDescrizione||item.categoria||'REG',
    departure:dep,
    arrival:arr,
    duration:durationMinutes(depMs,arrMs),
    delay:Number.isFinite(delay)?Math.round(delay):0,
    cancelled,
    changed,
    platform,
    terminal:detail.destinazione||item.destinazione||null
  };
}

async function collectDepartures(from,date,fromIdx,toIdx) {
  const code=await stationCode(from.api);
  const anchors=[];
  for(let h=0;h<24;h+=2) anchors.push(`${String(h).padStart(2,'0')}:00`);
  const responses=await Promise.allSettled(anchors.map(async time=>{
    const when=encodeURIComponent(queryDateString(date,time));
    const list=await vtFetch(`partenze/${code}/${when}`);
    return Array.isArray(list)?list:[];
  }));
  const map=new Map();
  for(const r of responses){
    if(r.status!=='fulfilled')continue;
    for(const item of r.value){
      if(candidateForDirection(item,fromIdx,toIdx)) map.set(itemKey(item),item);
    }
  }
  return [...map.values()];
}

async function mapLimit(items,limit,fn){
  const out=new Array(items.length); let cursor=0;
  async function worker(){
    while(true){const i=cursor++; if(i>=items.length)return; out[i]=await fn(items[i],i);}
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));
  return out;
}

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method==='OPTIONS')return res.status(204).end();

  const fromId=String(req.query.from||'');
  const toId=String(req.query.to||'');
  const date=String(req.query.date||todayRome());
  const fromIdx=STATIONS.findIndex(x=>x.id===fromId), toIdx=STATIONS.findIndex(x=>x.id===toId);
  if(fromIdx<0||toIdx<0||fromIdx===toIdx||!/^\d{4}-\d{2}-\d{2}$/.test(date)){
    return res.status(400).json({ok:false,error:'Parametri non validi',stations:STATIONS});
  }

  const from=STATIONS[fromIdx], to=STATIONS[toIdx];
  try{
    const candidates=await collectDepartures(from,date,fromIdx,toIdx);
    const trips=(await mapLimit(candidates,6,async item=>detailToTrip(item,await andamento(item),from,to)))
      .filter(Boolean)
      .sort((a,b)=>a.departure.localeCompare(b.departure));
    const unique=[]; const seen=new Set();
    for(const x of trips){const k=`${x.trainNumber}:${x.departure}:${x.arrival}`;if(!seen.has(k)){seen.add(k);unique.push(x)}}
    return res.status(200).json({
      ok:true,
      date,
      from:{id:from.id,label:from.label},
      to:{id:to.id,label:to.label},
      checkedAt:new Date().toISOString(),
      source:'ViaggiaTreno/RFI',
      stations:STATIONS.map(({id,label})=>({id,label})),
      trips:unique
    });
  }catch(error){
    return res.status(502).json({ok:false,error:'Orari SFM3 temporaneamente non disponibili',detail:String(error?.message||error)});
  }
};
