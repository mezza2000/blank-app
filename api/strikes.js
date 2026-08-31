const MIT_URL = 'https://scioperi.mit.gov.it/mit2/public/scioperi';

function clean(v='') {
  return String(v)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,' ')
    .replace(/<[^>]+>/g,' ')
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&agrave;/gi,'à').replace(/&egrave;/gi,'è').replace(/&igrave;/gi,'ì').replace(/&ograve;/gi,'ò').replace(/&ugrave;/gi,'ù')
    .replace(/\s+/g,' ').trim();
}
function norm(v=''){return clean(v).toUpperCase()}
function parseDateIT(v){const m=String(v).match(/(\d{2})\/(\d{2})\/(\d{4})/);return m?`${m[3]}-${m[2]}-${m[1]}`:null}
function isRelevant(x){
  const sector=norm(x.sector), cat=norm(x.category), mode=norm(x.mode), notes=norm(x.notes), reg=norm(x.region);
  const geographic = reg==='ITALIA' || reg==='PIEMONTE';
  const passengerRail = sector.includes('FERROVIARIO') || (sector.includes('PLURISETTORIALE') && (cat.includes('FERROVI')||mode.includes('FERROVI')||notes.includes('FERROVI')));
  const excludedRail = notes.includes('ESCLUS') && notes.includes('FERROVI');
  const tpl = sector.includes('TRASPORTO PUBBLICO LOCALE') && geographic && (cat.includes('GTT')||cat.includes('TORINO')||x.relevance.toUpperCase()==='NAZIONALE');
  const gttInMixed = sector.includes('PLURISETTORIALE') && geographic && (cat.includes('GTT')||mode.includes('GTT')||notes.includes('GTT'));
  return (passengerRail && geographic && !excludedRail) || tpl || gttInMixed;
}
function kindOf(x){const all=norm(`${x.sector} ${x.category} ${x.mode} ${x.notes}`);return all.includes('GTT')||norm(x.sector).includes('TRASPORTO PUBBLICO LOCALE')?'metro':'train'}
function parseRows(html){
  const tables=[...String(html).matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)];
  const table=tables[0]?.[1]||'';
  const rows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];
  const out=[];
  for(const row of rows){
    const cells=[...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>clean(m[1]));
    if(cells.length<11) continue;
    const [start,end,unions,sector,category,mode,relevance,notes,proclaimed,region,province,received='']=cells;
    const item={start,end,startISO:parseDateIT(start),endISO:parseDateIT(end),unions,sector,category,mode,relevance,notes,proclaimed,region,province,received};
    if(isRelevant(item)){item.kind=kindOf(item);out.push(item)}
  }
  return out;
}
function todayRome(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}

module.exports = async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Cache-Control','no-store, max-age=0');
  try{
    const r=await fetch(MIT_URL,{headers:{'Accept':'text/html,*/*','User-Agent':'RostaTravel/1.0'},cache:'no-store'});
    if(!r.ok) throw new Error(`MIT HTTP ${r.status}`);
    const html=await r.text();
    const today=todayRome();
    const strikes=parseRows(html)
      .filter(x=>!x.endISO || x.endISO>=today)
      .slice(0,8);
    return res.status(200).json({
      ok:true, checkedAt:new Date().toISOString(), source:'MIT - Osservatorio conflitti sindacali',
      protectedBands:{
        weekday:['06:00–09:00','18:00–21:00'],
        holiday:['07:00–10:00','18:00–21:00'],
        note:'Per il Regionale i servizi minimi sono individuati per numero di treno e orario effettivo di partenza: essere nella fascia non rende automaticamente garantito ogni treno.'
      },
      strikes
    });
  }catch(error){
    return res.status(502).json({ok:false,error:'Calendario scioperi temporaneamente non disponibile',detail:String(error?.message||error)});
  }
};