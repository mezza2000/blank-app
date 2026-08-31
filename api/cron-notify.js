const BASE = 'https://rosta-travel.vercel.app';

function romeParts() {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false
  }).formatToParts(new Date());
  const o = {};
  for (const p of parts) if (p.type !== 'literal') o[p.type] = p.value;
  return o;
}

function hmToMinutes(v) {
  const m = String(v || '').match(/^(\d{2}):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

async function resolveChatId(token) {
  if (process.env.TELEGRAM_CHAT_ID) return String(process.env.TELEGRAM_CHAT_ID);
  const r = await fetch(`https://api.telegram.org/bot${token}/getUpdates?limit=100`);
  const d = await r.json();
  if (!d.ok) return null;
  const chats = d.result.map(u => u.message?.chat || u.edited_message?.chat || u.callback_query?.message?.chat).filter(c => c?.type === 'private');
  return chats.length ? String(chats[chats.length - 1].id) : null;
}

async function send(token, chatId, text) {
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  return r.json();
}

async function getJson(url) {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function dateDiffDays(iso) {
  const now = new Date();
  const todayRome = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year:'numeric',month:'2-digit',day:'2-digit' }).format(now);
  const a = new Date(todayRome + 'T00:00:00Z');
  const b = new Date(iso + 'T00:00:00Z');
  return Math.round((b - a) / 86400000);
}

async function checkTrain(token, chatId, direction, time, nowMinutes) {
  const dep = hmToMinutes(time);
  if (dep == null) return [];
  const alerts = [];
  const offsets = [30, 10];
  if (!offsets.some(x => ((dep - x + 1440) % 1440) === nowMinutes)) return alerts;

  const data = await getJson(`${BASE}/api/status?direction=${direction}&time=${encodeURIComponent(time)}`);
  if (!data?.ok || !data.found) return alerts;
  const threshold = Number(process.env.DELAY_THRESHOLD_MIN || 3);
  if (!(data.cancelled || data.changed || Number(data.delay || 0) >= threshold)) return alerts;

  const route = direction === 'andata' ? 'Rosta → Porta Nuova' : 'Porta Nuova → Rosta';
  let state = data.cancelled ? '❌ CANCELLATO' : data.changed ? '⚠️ CORSA MODIFICATA' : `⏱ Ritardo +${data.delay} min`;
  const details = [data.trainNumber ? `Treno ${data.trainNumber}` : null, data.platform ? `Binario ${data.platform}` : null].filter(Boolean).join(' • ');
  const text = `🚆 RostaTravel\n${route} · ${time}\n${state}${details ? `\n${details}` : ''}`;
  await send(token, chatId, text);
  alerts.push({ type: 'train', direction, time });
  return alerts;
}

async function checkStrikes(token, chatId, hour, minute) {
  if (!(hour === 18 && minute === 30)) return [];
  const data = await getJson(`${BASE}/api/strikes`);
  if (!data?.ok || !Array.isArray(data.strikes)) return [];
  const relevant = data.strikes.filter(s => [7,3,1,0].includes(dateDiffDays(s.startISO)));
  if (!relevant.length) return [];
  const lines = relevant.slice(0,4).map(s => `• ${s.start}${s.end && s.end !== s.start ? `–${s.end}` : ''}: ${s.mode || s.sector}`);
  const text = `⚠️ RostaTravel — Scioperi rilevanti\n${lines.join('\n')}\n\n🛡️ Fasce Regionali: feriali 06:00–09:00 e 18:00–21:00; festivi 07:00–10:00 e 18:00–21:00.`;
  await send(token, chatId, text);
  return [{ type: 'strikes', count: relevant.length }];
}

module.exports = async function handler(req, res) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.status(200).json({ ok: true, configured: false, message: 'Token Telegram non configurato' });
  try {
    const chatId = await resolveChatId(token);
    if (!chatId) return res.status(200).json({ ok: true, configured: false, message: 'Invia /start al bot per registrare la chat' });
    const p = romeParts();
    const hour = Number(p.hour), minute = Number(p.minute), nowMinutes = hour * 60 + minute;
    const andata = process.env.TRAIN_ANDATA || '07:50';
    const ritorno = process.env.TRAIN_RITORNO || '17:45';
    const alerts = [];
    alerts.push(...await checkTrain(token, chatId, 'andata', andata, nowMinutes));
    alerts.push(...await checkTrain(token, chatId, 'ritorno', ritorno, nowMinutes));
    alerts.push(...await checkStrikes(token, chatId, hour, minute));
    return res.status(200).json({ ok: true, configured: true, checkedAt: new Date().toISOString(), alerts });
  } catch (error) {
    return res.status(500).json({ ok: false, error: String(error?.message || error) });
  }
};