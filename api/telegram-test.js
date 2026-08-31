module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Metodo non consentito' });

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return res.status(503).json({
      ok: false,
      configured: false,
      error: 'TELEGRAM_BOT_TOKEN non configurato su Vercel'
    });
  }

  const chatId = String(req.body?.chatId || '').trim();
  if (!/^\d+$/.test(chatId)) {
    return res.status(400).json({ ok: false, error: 'Chat ID non valido' });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🔔 RostaTravel: notifiche collegate correttamente. Ti avviserò per ritardi importanti, cancellazioni e scioperi rilevanti.',
        disable_web_page_preview: true
      })
    });
    const data = await response.json();
    if (!response.ok || !data.ok) {
      return res.status(502).json({ ok: false, configured: true, error: data.description || 'Telegram non ha accettato il messaggio' });
    }
    return res.status(200).json({ ok: true, configured: true });
  } catch (error) {
    return res.status(502).json({ ok: false, configured: true, error: String(error?.message || error) });
  }
};