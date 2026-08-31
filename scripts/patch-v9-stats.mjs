import fs from 'node:fs';

const file = 'app-v9.html';
let html = fs.readFileSync(file, 'utf8');

if (html.includes('id="statsCard"')) {
  console.log('Stats already present, nothing to do.');
  process.exit(0);
}

const css = `
.stats-card{border-color:#2a466d}.stats-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:13px}.stats-table{background:var(--bg);border:1px solid var(--line);border-radius:15px;padding:12px}.stats-head{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:9px}.stats-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-top:1px solid var(--line);font-size:12px}.stats-row:first-of-type{border-top:0;padding-top:0}.stats-num{font-size:23px;font-weight:900;line-height:1}.stats-note{font-size:10px;color:var(--muted);line-height:1.4;margin-top:10px}@media(max-width:430px){.stats-grid{grid-template-columns:1fr 1fr;gap:8px}.stats-table{padding:10px}.stats-num{font-size:21px}.stats-row{font-size:11px}}
`;

const widget = `<section id="statsCard" class="card stats-card"><div class="eyebrow">STATISTICHE</div><div class="title">📊 Utilizzo RostaTravel</div><div class="stats-grid"><div class="stats-table"><div class="stats-head">Persone</div><div class="stats-row"><span>Visitatori unici</span><b id="statVisitors" class="stats-num">--</b></div><div class="stats-row"><span>Da Home</span><b id="statHome" class="stats-num">--</b></div></div><div class="stats-table"><div class="stats-head">Visualizzazioni</div><div class="stats-row"><span>Totali</span><b id="statViews" class="stats-num">--</b></div><div class="stats-note">Ogni apertura conta come una visualizzazione.</div></div></div><div class="stats-note">Lo stesso dispositivo/browser viene contato una sola volta tra i visitatori. “Da Home” si registra quando RostaTravel viene aperta dalla schermata Home.</div></section>\n`;

const js = `
function statsVisitorId(){
  try{
    let id=localStorage.getItem('rostaTravel.stats.visitorId');
    if(!id){id=(crypto.randomUUID?.()||('rt-'+Date.now()+'-'+Math.random().toString(36).slice(2)));localStorage.setItem('rostaTravel.stats.visitorId',id)}
    return id;
  }catch(_){return 'rt-session-'+Date.now()+'-'+Math.random().toString(36).slice(2)}
}
function isHomeLaunch(){return !!((window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches)||window.navigator.standalone===true)}
async function trackStats(){
  try{
    const r=await fetch(API+'/api/stats',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId:statsVisitorId(),standalone:isHomeLaunch()}),cache:'no-store'}),d=await r.json();
    if(!r.ok||!d.ok)throw new Error('stats');
    $('statVisitors').textContent=String(d.visitors??0);$('statHome').textContent=String(d.home??0);$('statViews').textContent=String(d.views??0);
  }catch(_){$('statVisitors').textContent='--';$('statHome').textContent='--';$('statViews').textContent='--'}
}
`;

if (!html.includes('</style></head>')) throw new Error('CSS marker not found');
html = html.replace('</style></head>', css + '</style></head>');

const strikeMarker = '<section class="card strike-card">';
if (!html.includes(strikeMarker)) throw new Error('Widget marker not found');
html = html.replace(strikeMarker, widget + strikeMarker);

const refreshMarker = 'async function refresh(){';
if (!html.includes(refreshMarker)) throw new Error('JS marker not found');
html = html.replace(refreshMarker, js + '\n' + refreshMarker);

const initMarker = "fillStations();renderPinned('andata');renderPinned('ritorno');refresh();searchTimes();";
if (!html.includes(initMarker)) throw new Error('Init marker not found');
html = html.replace(initMarker, "fillStations();renderPinned('andata');renderPinned('ritorno');trackStats();refresh();searchTimes();");

fs.writeFileSync(file, html);
console.log('Stable v9 patched with stats only.');
