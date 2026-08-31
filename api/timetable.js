const STATIONS = {
  'torino-porta-nuova': { id: 2672, label: 'Torino Porta Nuova', aliases: ['TORINO PORTA NUOVA', 'TORINO P.N.'] },
  'grugliasco': { id: 26153180, label: 'Grugliasco', aliases: ['GRUGLIASCO'] },
  'collegno': { id: 1062, label: 'Collegno', aliases: ['COLLEGNO'] },
  'alpignano': { id: 396, label: 'Alpignano', aliases: ['ALPIGNANO'] },
  'rosta': { id: 2265, label: 'Rosta', aliases: ['ROSTA'] },
  'avigliana': { id: 466, label: 'Avigliana', aliases: ['AVIGLIANA'] },
  'sant-ambrogio': { id: 2286, label: "Sant'Ambrogio", aliases: ['S.AMBROGIO', "SANT'AMBROGIO"] },
  'condove': { id: 1076, label: 'Condove', aliases: ['CONDOVE'] },
  'sant-antonino-vaie': { id: 2293, label: "Sant'Antonino-Vaie", aliases: ['S.ANTONINO-VAIE', "SANT'ANTONINO-VAIE", 'S.ANTONINO V'] },
  'borgone': { id: 662, label: 'Borgone', aliases: ['BORGONE'] },
  'bruzolo-di-susa': { id: 699, label: 'Bruzolo di Susa', aliases: ['BRUZOLO DI SUSA', 'BRUZOLO SUSA'] },
  'bussoleno': { id: 711, label: 'Bussoleno', aliases: ['BUSSOLENO'] },
  'susa': { id: 2602, label: 'Susa', aliases: ['SUSA'] },
  'meana': { id: 1923, label: 'Meana', aliases: ['MEANA'] },
  'chiomonte': { id: 1018, label: 'Chiomonte', aliases: ['CHIOMONTE'] },
  'salbertrand': { id: 2431, label: 'Salbertrand', aliases: ['SALBERTRAND'] },
  'oulx': { id: 1844, label: 'Oulx-Cesana-Claviere', aliases: ['OULX-CESANA-CLAVIERE', 'OULX'] },
  'beaulard': { id: 567, label: 'Beaulard', aliases: ['BEAULARD'] },
  'bardonecchia': { id: 548, label: 'Bardonecchia', aliases: ['BARDONECCHIA'] }
};

function decodeEntities(value = '') {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&agrave;/gi, 'à')
    .replace(/&egrave;/gi, 'è')
    .replace(/&igrave;/gi, 'ì')
    .replace(/&ograve;/gi, 'ò')
    .replace(/&ugrave;/gi, 'ù')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"');
}

function clean(value = '') {
  return decodeEntities(
    String(value)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/\s+/g, ' ').trim();
}

function norm(value = '') {
  return clean(value)
    .toUpperCase()
    .replace(/[.’]/g, "'")
    .replace(/\s+/g, ' ');
}

function timeValue(value = '') {
  const match = String(value).match(/\b(\d{2})[.:](\d{2})\b/);
  return match ? `${match[1]}:${match[2]}` : null;
}

function minutes(time) {
  const match = String(time || '').match(/^(\d{2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

function durationMinutes(start, end) {
  const a = minutes(start);
  const b = minutes(end);
  if (a == null || b == null) return null;
  let value = b - a;
  if (value < 0) value += 1440;
  return value;
}

function matchesStation(name, station) {
  const candidate = norm(name);
  return station.aliases.some(alias => norm(alias) === candidate);
}

function parseStopLinks(raw = '') {
  const result = [];
  for (const match of String(raw).matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>\s*\((\d{2})[.:](\d{2})\)/gi)) {
    result.push({ name: clean(match[1]), time: `${match[2]}:${match[3]}` });
  }
  return result;
}

function parseTerminal(raw = '') {
  const text = clean(raw);
  const match = text.match(/(.+?)\s*\((\d{2})[.:](\d{2})\)\s*$/);
  return match ? { name: match[1].trim(), time: `${match[2]}:${match[3]}` } : { name: text, time: null };
}

function parseTrips(html, from, to) {
  const trips = [];
  for (const rowMatch of String(html).matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1];
    if (!/Treno\s+SFM\s+Linea\s+3/i.test(row)) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(match => match[1]);
    if (cells.length < 8) continue;
    const departure = timeValue(clean(cells[0]));
    const trainNumber = (clean(cells[1]).match(/\b(\d{4,5})\b/) || [])[1];
    const terminal = parseTerminal(cells[2]);
    const platform = clean(cells[3]) || null;
    if (!departure || !trainNumber || !terminal.time) continue;
    const stops = [{ name: from.label, time: departure }, ...parseStopLinks(cells[7]), terminal];
    const destinationIndex = stops.findIndex((stop, index) => index > 0 && matchesStation(stop.name, to));
    if (destinationIndex < 0) continue;
    const arrival = stops[destinationIndex].time;
    if (!arrival) continue;
    trips.push({ trainNumber: Number(trainNumber), departure, arrival, duration: durationMinutes(departure, arrival), platform, terminal: terminal.name, scheduled: true });
  }
  const unique = new Map();
  for (const trip of trips) {
    const key = `${trip.trainNumber}|${trip.departure}|${trip.arrival}|${norm(trip.terminal)}`;
    if (!unique.has(key)) unique.set(key, trip);
  }
  return [...unique.values()].sort((a, b) => a.departure.localeCompare(b.departure) || a.arrival.localeCompare(b.arrival) || a.trainNumber - b.trainNumber);
}

function groupAlternatives(trips) {
  const groups = new Map();
  for (const trip of trips) {
    const key = `${trip.departure}|${trip.arrival}|${norm(trip.terminal)}|${trip.platform || ''}`;
    if (!groups.has(key)) groups.set(key, { departure: trip.departure, arrival: trip.arrival, duration: trip.duration, platform: trip.platform, terminal: trip.terminal, trainNumbers: [] });
    const group = groups.get(key);
    if (!group.trainNumbers.includes(trip.trainNumber)) group.trainNumbers.push(trip.trainNumber);
  }
  return [...groups.values()].map(group => ({ ...group, trainNumbers: group.trainNumbers.sort((a, b) => a - b), trainNumber: group.trainNumbers.length === 1 ? group.trainNumbers[0] : null, scheduled: true })).sort((a, b) => a.departure.localeCompare(b.departure) || a.arrival.localeCompare(b.arrival));
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();
  const fromKey = String(req.query.from || '');
  const toKey = String(req.query.to || '');
  const from = STATIONS[fromKey];
  const to = STATIONS[toKey];
  if (!from || !to || from === to) return res.status(400).json({ ok: false, error: 'Scegli due stazioni diverse' });
  const url = `https://prm.rfi.it/qo_prm/QO_Partenze_SiPMR.aspx?Id=${from.id}&dalle=00.00&alle=23.59&lin=it&ora=00.00`;
  try {
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 RostaTravel/1.0', 'Accept': 'text/html,*/*' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`RFI HTTP ${response.status}`);
    const html = await response.text();
    const pageText = clean(html);
    const periodMatch = pageText.match(/ORARIO PROGRAMMATO\s+(\d{1,2}\s+\S+\s+\d{4})\s*-\s*(\d{1,2}\s+\S+\s+\d{4})/i);
    const trips = groupAlternatives(parseTrips(html, from, to));
    const crossBranch = (fromKey === 'susa' && ['meana','chiomonte','salbertrand','oulx','beaulard','bardonecchia'].includes(toKey)) || (toKey === 'susa' && ['meana','chiomonte','salbertrand','oulx','beaulard','bardonecchia'].includes(fromKey));
    return res.status(200).json({
      ok: true,
      from: { label: from.label },
      to: { label: to.label },
      period: periodMatch ? `${periodMatch[1]} – ${periodMatch[2]}` : null,
      checkedAt: new Date().toISOString(),
      source: 'RFI - Quadro Orario Programmato',
      note: crossBranch ? 'Tra il ramo Susa e il ramo Bardonecchia non ci sono corse dirette: è necessario cambiare a Bussoleno.' : 'Sono mostrate tutte le corse programmate nel periodo RFI corrente. Più numeri di treno allo stesso orario indicano varianti valide in giorni diversi.',
      requiresChangeAtBussoleno: crossBranch,
      trips
    });
  } catch (error) {
    return res.status(502).json({ ok: false, error: 'Orario programmato RFI temporaneamente non disponibile', detail: String(error?.message || error) });
  }
};
