const VT_BASE = 'https://www.viaggiatreno.it/infomobilita/resteasy/viaggiatreno/';

function norm(v) {
  return String(v || '').trim().toUpperCase().replace(/\s+/g, ' ');
}

async function vtFetch(path, asText = false) {
  const r = await fetch(VT_BASE + path, {
    headers: {
      'Accept': asText ? 'text/plain,*/*' : 'application/json,*/*',
      'User-Agent': 'RostaTravel/1.0'
    },
    cache: 'no-store'
  });
  if (!r.ok) throw new Error(`ViaggiaTreno HTTP ${r.status}`);
  return asText ? r.text() : r.json();
}

async function stationCode(name) {
  if (norm(name) === 'TORINO PORTA NUOVA') return 'S00219';
  const text = await vtFetch(`autocompletaStazione/${encodeURIComponent(name)}`, true);
  const rows = text.split(/\r?\n/).map(x => x.trim()).filter(Boolean);
  const exact = rows.find(row => norm(row.split('|')[0]) === norm(name)) || rows[0];
  if (!exact || !exact.includes('|')) throw new Error(`Codice stazione non trovato: ${name}`);
  return exact.split('|')[1].trim();
}

function romeDateParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Rome',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  }).formatToParts(new Date());
  const out = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = p.value;
  return out;
}

function queryDateString(time) {
  const d = romeDateParts();
  return `${d.weekday} ${d.month} ${d.day} ${d.year} ${time}:00`;
}

async function departures(stationName, time) {
  const code = await stationCode(stationName);
  const when = encodeURIComponent(queryDateString(time));
  const list = await vtFetch(`partenze/${code}/${when}`);
  return { code, list: Array.isArray(list) ? list : [] };
}

async function andamento(item) {
  const origin = item.codOrigine;
  const number = item.numeroTreno;
  const date = item.dataPartenzaTreno || Number(item.millisDataPartenza);
  if (!origin || !number || !date) return null;
  try {
    return await vtFetch(`andamentoTreno/${origin}/${number}/${date}`);
  } catch (_) {
    return null;
  }
}

function departureTime(item) {
  return item.compOrarioPartenza || item.compOrarioPartenzaZero || item.compOrarioPartenzaZeroEffettivo || '';
}

function includesRosta(detail) {
  return Array.isArray(detail?.fermate) && detail.fermate.some(f => norm(f.stazione) === 'ROSTA');
}

function cancelState(item, detail) {
  const prov = Number(detail?.provvedimento ?? item?.provvedimento ?? 0);
  const tipo = norm(detail?.tipoTreno || detail?.tipo || '');
  const cancelled = prov === 1 || tipo === 'ST';
  const changed = !cancelled && (prov === 2 || prov === 3 || ['SF','SI','SM','VD','VO','DV'].includes(tipo) || detail?.riprogrammazione === 'Y' || item?.riprogrammazione === 'Y');
  return { cancelled, changed };
}

function delayValue(item, detail) {
  const raw = detail?.ritardo ?? item?.ritardo ?? 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function platformValue(item, detail) {
  return detail?.binarioEffettivoPartenzaDescrizione ||
    item?.binarioEffettivoPartenzaDescrizione ||
    detail?.binarioProgrammatoPartenzaDescrizione ||
    item?.binarioProgrammatoPartenzaDescrizione || null;
}

async function findTrain(direction, time) {
  const station = direction === 'andata' ? 'Rosta' : 'Torino Porta Nuova';
  const { list } = await departures(station, time);
  const exact = list.filter(x => departureTime(x) === time);

  if (direction === 'andata') {
    const direct = exact.find(x => norm(x.destinazione) === 'TORINO PORTA NUOVA');
    if (!direct) return null;
    return { item: direct, detail: await andamento(direct) };
  }

  const regional = exact.filter(x => Number(x.codiceCliente) === 2 || norm(x.categoria) === 'REG' || norm(x.compNumeroTreno).startsWith('REG'));
  for (const item of regional) {
    const detail = await andamento(item);
    if (includesRosta(detail)) return { item, detail };
  }
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const direction = String(req.query.direction || '');
  const time = String(req.query.time || '');
  if (!['andata', 'ritorno'].includes(direction) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    return res.status(400).json({ ok: false, error: 'Parametri non validi' });
  }

  try {
    const found = await findTrain(direction, time);
    const checkedAt = new Date().toISOString();
    if (!found) {
      return res.status(200).json({
        ok: true,
        found: false,
        direction,
        time,
        checkedAt,
        message: 'Corsa non presente nel quadro live in questo momento'
      });
    }

    const { item, detail } = found;
    const { cancelled, changed } = cancelState(item, detail);
    const delay = delayValue(item, detail);
    const trainNumber = detail?.numeroTreno || item.numeroTreno || null;
    const destination = detail?.destinazione || item.destinazione || null;
    const platform = platformValue(item, detail);

    return res.status(200).json({
      ok: true,
      found: true,
      direction,
      time,
      checkedAt,
      trainNumber,
      category: item.compNumeroTreno || item.categoriaDescrizione || item.categoria || 'REG',
      destination,
      delay,
      cancelled,
      changed,
      platform,
      circulating: detail?.circolante ?? item.circolante ?? null,
      notDeparted: detail?.nonPartito ?? item.nonPartito ?? null,
      source: 'ViaggiaTreno/RFI'
    });
  } catch (error) {
    return res.status(502).json({
      ok: false,
      error: 'Servizio live temporaneamente non disponibile',
      detail: String(error?.message || error)
    });
  }
};
