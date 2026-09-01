const VT_BASE='https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/';

const STATIONS={
  'torino-porta-nuova':{label:'Torino Porta Nuova',api:'TORINO PORTA NUOVA'},
  'grugliasco':{label:'Grugliasco',api:'GRUGLIASCO'},
  'collegno':{label:'Collegno',api:'COLLEGNO'},
  'alpignano':{label:'Alpignano',api:'ALPIGNANO'},
  'rosta':{label:'Rosta',api:'ROSTA'},
  'avigliana':{label:'Avigliana',api:'AVIGLIANA'},
  'sant-ambrogio':{label:"Sant'Ambrogio",api:'S.AMBROGIO'},
  'condove':{label:'Condove',api:'CONDOVE'},
  'sant-antonino-vaie':{label:"Sant'Antonino-Vaie",api:'S.ANTONINO-VAIE'},
  'borgone':{label:'Borgone',api:'BORGONE'},
  'bruzolo-di-susa':{label:'Bruzolo di Susa',api:'BRUZOLO DI SUSA'},
  'bussoleno':{label:'Bussoleno',api:'BUSSOLENO'},
  'susa':{label:'Susa',api:'SUSA'},
  'meana':{label:'Meana',api:'MEANA'},
  'chiomonte':{label:'Chiomonte',api:'CHIOMONTE'},
  'salbertrand':{label:'Salbertrand',api:'SALBERTRAND'},
  'oulx':{label:'Oulx-Cesana-Claviere',api:'OULX-CESANA-CLAVIERE'},
  'beaulard':{label:'Beaulard',api:'BEAULARD'},
  'bardonecchia':{label:'Bardonecchia',api:'BARDONECCHIA'}
};

const CORRIDOR=[
  {label:'Torino Porta Nuova',aliases:['TORINOPORTANUOVA']},
  {label:'Grugliasco',aliases:['GRUGLIASCO']},
  {label:'Collegno',aliases:['COLLEGNO']},
  {label:'Alpignano',aliases:['ALPIGNANO']},
  {label:'Rosta',aliases:['ROSTA']},
  {label:'Avigliana',aliases:['AVIGLIANA']},
  {label:"Sant'Ambrogio",aliases:['SANTAMBROGIO','SAMBROGIO']},
  {label:'Condove',aliases:['CONDOVE']},
  {label:"Sant'Antonino-Vaie",aliases:['SANTANTONINOVAIE','SANTONINOVAIE']},
  {label:'Borgone',aliases:['BORGONE']},
  {label:'Bruzolo di Susa',aliases:['BRUZOLODISUSA']},
  {label:'Bussoleno',aliases:['BUSSOLENO']},
  {label:'Susa',aliases:['SUSA']},
  {label:'Meana',aliases:['MEANA']},
  {label:'Chiomonte',aliases:['CHIOMONTE']},
  {label:'Salbertrand',aliases:['SALBERTRAND']},
  {label:'Oulx-Cesana-Claviere',aliases:['OULX','OULXCESANACLAVIERE']},
  {label:'Beaulard',aliases:['BEAULARD']},
  {label:'Bardonecchia',aliases:['BARDONECCHIA']}
];

function norm(v){return String(v||'').trim().toUpperCase().replace(/[.’]/g,"'").replace(/\s+/g,' ')}
async function vt(path,text=false){const r=await fetch(VT_BASE+path,{headers:{Accept:text?'text/plain,*/*':'application/json,*/*','User-Agent':'RostaTravel/2.0'},cache:'no-store'});if(!r.ok)throw new Error(`ViaggiaTreno HTTP ${r.status}`);return text?r.text():r.json()}
async function stationCode(station){if(norm(station.api)==='TORINO PORTA NUOVA')return'S00219';const text=await vt(`autocompletaStazione/${encodeURIComponent(station.api)}`,true);const rows=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);const exact=rows.find(row=>norm(row.split('|')[0])===norm(station.api))||rows[0];if(!exact||!exact.includes('|'))throw new Error(`Codice stazione non trovato: ${station.label}`);return exact.split('|')[1].trim()}
function romeDateParts(){const p=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Rome',weekday:'short',year:'numeric',month:'short',day:'2-digit'}).formatToParts(new Date()),o={};for(const x of p)if(x.type!=='literal')o[x.type]=x.value;return o}
function queryDate(time){const d=romeDateParts();return`${d.weekday} ${d.month} ${d.day} ${d.year} ${time}:00`}
function depTime(x){return x.compOrarioPartenza||x.compOrarioPartenzaZero||x.compOrarioPartenzaZeroEffettivo||''}
async function detail(item){const origin=item.codOrigine,number=item.numeroTreno,date=item.dataPartenzaTreno||Number(item.millisDataPartenza);if(!origin||!number||!date)return null;try{return await vt(`andamentoTreno/${origin}/${number}/${date}`)}catch(_){return null}}
function cancelState(item,d){const prov=Number(d?.provvedimento??item?.provvedimento??0),tipo=norm(d?.tipoTreno||d?.tipo||'');const cancelled=prov===1||tipo==='ST';const changed=!cancelled&&(prov===2||prov===3||['SF','SI','SM','VD','VO','DV'].includes(tipo)||d?.riprogrammazione==='Y'||item?.riprogrammazione==='Y');return{cancelled,changed}}
function stopIndex(d,station){return Array.isArray(d?.fermate)?d.fermate.findIndex(f=>norm(f.stazione)===norm(station.api)||norm(f.stazione)===norm(station.label)):-1}
function stopDelay(stop,d,item){const reached=stop?.arrivoReale||stop?.partenzaReale||stop?.effettiva,raw=reached?(stop?.ritardoArrivo??stop?.ritardoPartenza??stop?.ritardo??d?.ritardo??item?.ritardo??0):(d?.ritardo??item?.ritardo??stop?.ritardoArrivo??stop?.ritardoPartenza??stop?.ritardo??0),n=Number(raw);return Number.isFinite(n)?Math.round(n):0}
function platform(stop,item){return stop?.binarioEffettivoPartenzaDescrizione||item?.binarioEffettivoPartenzaDescrizione||stop?.binarioProgrammatoPartenzaDescrizione||item?.binarioProgrammatoPartenzaDescrizione||null}
function millisToTime(ms){if(!ms)return null;try{return new Intl.DateTimeFormat('it-IT',{timeZone:'Europe/Rome',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(Number(ms)))}catch(_){return null}}
function compact(v){return norm(v).replace(/^PC[. ]*/,'').replace(/[^A-Z0-9]/g,'')}
function corridorStation(name){const value=compact(name);if(!value||value==='--')return null;for(let pos=0;pos<CORRIDOR.length;pos++){const station=CORRIDOR[pos];if(station.aliases.some(alias=>value===alias||value.startsWith(alias)||alias.startsWith(value)))return{...station,pos}}return null}
function trainPosition(d,from,to,fromIndex,toIndex){const stops=Array.isArray(d?.fermate)?d.fermate:[],rawLast=String(d?.stazioneUltimoRilevamento||'').trim(),hasLast=rawLast&&rawLast!=='--';let detected=hasLast?stops.findIndex(stop=>norm(stop?.stazione)===norm(rawLast)):-1;if(detected<0){for(let i=0;i<stops.length;i++){const stop=stops[i];if(stop?.partenzaReale||stop?.arrivoReale||stop?.effettiva)detected=i}}const observedName=hasLast?rawLast:String(stops[detected]?.stazione||'').trim();if(!observedName)return null;const observed=corridorStation(observedName),origin=corridorStation(from?.label||from?.api),destination=corridorStation(to?.label||to?.api);let progress=0,beforeOrigin=false,afterDestination=false,nextStation=null;if(observed&&origin&&destination){const direction=Math.sign(destination.pos-origin.pos)||1,total=Math.max(1,Math.abs(destination.pos-origin.pos)),travelled=(observed.pos-origin.pos)*direction;beforeOrigin=travelled<0;afterDestination=travelled>total;progress=Math.max(0,Math.min(1,travelled/total));const next=CORRIDOR[observed.pos+direction];nextStation=next?.label||null}else if(detected>=0){const travelled=detected-fromIndex,total=Math.max(1,toIndex-fromIndex);beforeOrigin=travelled<0;afterDestination=travelled>total;progress=Math.max(0,Math.min(1,travelled/total));nextStation=String(stops[detected+1]?.stazione||'').trim()||null}return{currentStation:observed?.label||observedName,nextStation,progress:Number(progress.toFixed(3)),beforeOrigin,afterDestination,inStation:d?.inStazione===true,checkedAt:String(d?.compOraUltimoRilevamento||'').match(/^\d{2}:\d{2}$/)?.[0]||millisToTime(d?.oraUltimoRilevamento)||null}}

module.exports=async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Methods','GET, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.setHeader('Cache-Control','no-store, max-age=0');if(req.method==='OPTIONS')return res.status(204).end();
  const from=STATIONS[String(req.query.from||'')],to=STATIONS[String(req.query.to||'')],time=String(req.query.time||''),wanted=String(req.query.trains||'').split(',').map(Number).filter(Number.isFinite);
  if(!from||!to||from===to||!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return res.status(400).json({ok:false,error:'Parametri non validi'});
  try{
    const code=await stationCode(from),listRaw=await vt(`partenze/${code}/${encodeURIComponent(queryDate(time))}`),list=Array.isArray(listRaw)?listRaw:[];
    let exact=list.filter(x=>depTime(x)===time);
    if(wanted.length){const preferred=exact.filter(x=>wanted.includes(Number(x.numeroTreno)));if(preferred.length)exact=preferred.concat(exact.filter(x=>!preferred.includes(x)))}
    for(const item of exact){
      const d=await detail(item);if(!d)continue;const fi=stopIndex(d,from),ti=stopIndex(d,to);if(fi<0||ti<=fi)continue;
      const fromStop=d.fermate[fi],toStop=d.fermate[ti],state=cancelState(item,d),delay=stopDelay(toStop,d,item);
      return res.status(200).json({ok:true,found:true,checkedAt:new Date().toISOString(),from:from.label,to:to.label,time,trainNumber:d.numeroTreno||item.numeroTreno||null,delay,cancelled:state.cancelled,changed:state.changed,platform:platform(fromStop,item),destination:d.destinazione||item.destinazione||null,scheduledDeparture:millisToTime(fromStop.partenza_teorica||fromStop.programmata)||time,actualDeparture:millisToTime(fromStop.partenzaReale||fromStop.effettiva),scheduledArrival:millisToTime(toStop.arrivo_teorico||toStop.programmata),actualArrival:millisToTime(toStop.arrivoReale||toStop.effettiva),position:trainPosition(d,from,to,fi,ti),source:'ViaggiaTreno/RFI'});
    }
    return res.status(200).json({ok:true,found:false,checkedAt:new Date().toISOString(),from:from.label,to:to.label,time,message:'Corsa non ancora visibile nel quadro live'});
  }catch(error){return res.status(502).json({ok:false,error:'Servizio live temporaneamente non disponibile',detail:String(error?.message||error)})}
};
