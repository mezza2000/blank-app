const crypto = require('crypto');

const BASE = 'https://abacus.jasoncameron.dev';
const NS = 'rosta-travel-mezza2000-2026';

function numberFrom(data) {
  const n = Number(data?.value ?? data?.count ?? data?.hits ?? data?.total ?? 0);
  return Number.isFinite(n) ? n : 0;
}

async function counter(action, key) {
  const url = `${BASE}/${action}/${encodeURIComponent(NS)}/${encodeURIComponent(key)}`;
  const r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'RostaTravel/1.0' }, cache: 'no-store' });
  if (r.status === 404 && action === 'get') return 0;
  if (!r.ok) throw new Error(`Counter HTTP ${r.status}`);
  const data = await r.json().catch(() => ({}));
  return numberFrom(data);
}

async function markOnce(marker, aggregate) {
  let existing = 0;
  try { existing = await counter('get', marker); } catch (_) {}
  if (existing > 0) return false;
  await counter('hit', marker);
  await counter('hit', aggregate);
  return true;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const [views, visitors, home] = await Promise.all([
        counter('get', 'views'),
        counter('get', 'visitors'),
        counter('get', 'home')
      ]);
      return res.status(200).json({ ok: true, views, visitors, home });
    }

    if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metodo non supportato' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const visitorId = String(body.visitorId || '').trim();
    const standalone = body.standalone === true;
    if (!visitorId || visitorId.length > 160) return res.status(400).json({ ok: false, error: 'ID visitatore non valido' });

    const hash = crypto.createHash('sha256').update(visitorId).digest('hex').slice(0, 24);
    const views = await counter('hit', 'views');
    await markOnce(`visitor-${hash}`, 'visitors');
    if (standalone) await markOnce(`home-${hash}`, 'home');

    const [visitors, home] = await Promise.all([
      counter('get', 'visitors'),
      counter('get', 'home')
    ]);

    return res.status(200).json({ ok: true, views, visitors, home, standalone });
  } catch (error) {
    return res.status(502).json({ ok: false, error: 'Statistiche momentaneamente non disponibili', detail: String(error?.message || error) });
  }
};
