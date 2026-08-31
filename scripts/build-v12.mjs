import fs from 'node:fs';

const src = fs.readFileSync('app-v9.html', 'utf8');
let h = src;

h = h.replace('SFM3 • live, orari e scioperi', 'SFM3 • live, orari, biglietti e scioperi');
h = h.replace('RostaTravel v9', 'RostaTravel v12');

const css = `.ticketbox{margin-top:14px;padding-top:13px;border-top:1px solid var(--line)}.ticketbtn{width:100%;border:0;background:#f4d354;color:#181300;border-radius:14px;min-height:48px;padding:0 14px;font-weight:900;font-size:16px}.modal{position:fixed;inset:0;background:rgba(0,0,0,.72);display:flex;align-items:flex-end;justify-content:center;z-index:999;padding:14px}.sheet{width:min(100%,600px);background:var(--card);border:1px solid var(--line);border-radius:22px;padding:18px}.sheet h2{margin:0 0 6px;font-size:20px}.route-summary{background:var(--bg);border:1px solid var(--line);border-radius:14px;padding:12px;margin:13px 0;font-weight:800}.sheet input[type=date]{width:100%;height:50px;border-radius:13px;border:1px solid var(--line);background:var(--bg);color:var(--text);padding:0 12px;margin-top:6px;font:inherit}.modal-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:8px;margin-top:14px}.buy-main{background:#f4d354!important;border-color:#f4d354!important;color:#181300!important}.notice{font-size:11px;color:var(--muted);margin-top:10px;line-height:1.4}@media(max-width:430px){.modal-actions{grid-template-columns:1fr}}`;
if (!h.includes('</style>')) throw new Error('style marker missing');
h = h.replace('</style>', css + '</style>');

const ticket = slot => `<div class="ticketbox"><button class="ticketbtn" onclick="openBuy('${slot}')">🎟 Compra biglietto</button></div>`;
const a = '<div id="andataMeta" class="small"></div>';
const r = '<div id="ritornoMeta" class="small"></div>';
if (!h.includes(a) || !h.includes(r)) throw new Error('card markers missing');
h = h.replace(a, a + ticket('andata')).replace(r, r + ticket('ritorno'));

const modal = `<div id="buyModal" class="modal hidden" role="dialog" aria-modal="true"><div class="sheet"><h2>🎟 Compra biglietto</h2><div class="small">Scegli il giorno esatto del viaggio.</div><div id="buySummary" class="route-summary"></div><label class="small" for="buyDate">Giorno del viaggio</label><input id="buyDate" type="date"><div class="modal-actions"><button class="btn" onclick="closeBuy()">Annulla</button><button class="btn buy-main" onclick="continueBuy()">Apri Trenitalia</button></div><div class="notice">Passo a Trenitalia partenza, arrivo, data e fascia oraria. L'orario esatto del treno fissato resta indicato qui. Su iPhone il collegamento può aprire l'app Trenitalia se iOS lo associa all'app; altrimenti si apre il sito.</div></div></div>`;
if (!h.includes('</body>')) throw new Error('body marker missing');
h = h.replace('</body>', modal + '</body>');

const js = `\nlet buySlot=null;\nfunction todayISO(){const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),o={};for(const x of p)if(x.type!=='literal')o[x.type]=x.value;return o.year+'-'+o.month+'-'+o.day}\nfunction addDay(iso){const a=iso.split('-').map(Number),d=new Date(Date.UTC(a[0],a[1]-1,a[2]+1,12));return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-'+String(d.getUTCDate()).padStart(2,'0')}\nfunction suggestedDate(time){const n=now(),nowM=n.hour*60+n.minute;return min(time)>=nowM-5?todayISO():addDay(todayISO())}\nfunction openBuy(slot){buySlot=slot;const p=getPinned(slot),from=stationMap[p.from]?.label||p.from,to=stationMap[p.to]?.label||p.to;$('buySummary').textContent=from+' → '+to+' · treno fissato '+p.departure;$('buyDate').min=todayISO();$('buyDate').value=suggestedDate(p.departure);$('buyModal').classList.remove('hidden');try{tg?.HapticFeedback?.impactOccurred('light')}catch(_){}}\nfunction closeBuy(){$('buyModal').classList.add('hidden');buySlot=null}\nfunction ddmmyyyy(iso){const [y,m,d]=iso.split('-');return d+'-'+m+'-'+y}\nfunction trenitaliaUrl(p,date){const from=stationMap[p.from]?.label||p.from,to=stationMap[p.to]?.label||p.to,hour=String(p.departure||'00:00').slice(0,2);const q=new URLSearchParams({noOfAdults:'1',ynFlexibleDates:'off',arrivalStation:to,selectedTrainClassification:'',tripType:'on',selectedTrainType:'tutti',departureStation:from,parameter:'initBaseSearch',departureTime:hour,departureDate:ddmmyyyy(date),noOfChildren:'0'});return 'https://www.lefrecce.it/?lang=it#search?'+q.toString()}\nfunction continueBuy(){if(!buySlot)return;const date=$('buyDate').value;if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))return;const p=getPinned(buySlot),url=trenitaliaUrl(p,date);closeBuy();try{tg?.HapticFeedback?.notificationOccurred('success')}catch(_){}if(tg?.openLink)tg.openLink(url,{try_instant_view:false});else window.location.href=url}\n$('buyModal')?.addEventListener('click',e=>{if(e.target===$('buyModal'))closeBuy()});\n`;
const pos = h.lastIndexOf('</script>');
if (pos < 0) throw new Error('script marker missing');
h = h.slice(0, pos) + js + h.slice(pos);

fs.writeFileSync('app-v12.html', h);
fs.writeFileSync('index.html', h);
console.log('Built RostaTravel v12', h.length, 'bytes');
