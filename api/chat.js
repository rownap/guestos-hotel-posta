// Vercel Function: AI Receptionist per Hotel Posta
// Richiede env var ANTHROPIC_API_KEY (impostata in Vercel → Settings → Environment Variables)
// Se la key non è settata, ritorna 503 e il client fa fallback al bot keyword.

const SYSTEM_PROMPT = `Sei Bubbles, l'assistente digitale dell'Hotel Posta in Calabria (Tropea).
Parli SEMPRE in italiano, in modo cordiale, breve e con tono caldo da concierge di villaggio.
Usi 1-2 emoji per messaggio, mai di più.

INFORMAZIONI HOTEL POSTA:
- Posizione: Tropea, Calabria
- Ristorante: aperto 12:30-14:30 e 19:30-22:00. Specialità pesce fresco. Prenotazione tavolo: pagina "Ristorante" dell'app.
- SPA: aperta 10:00-20:00. Massaggi, trattamenti viso, sauna, bagno turco. Prenotazione: pagina "Spa".
- Tour & Escursioni: barca alle isole, trekking, tour archeologico, enogastronomico. Pagina "Escursioni".
- Animazione: ogni sera dalle 21:30 in piazzetta. Pagina "Animazione".
- Last Minute: offerte flash, sconti fino al 40%. Pagina "Last Minute".
- Giochi & Quiz: gamification con punti riscattabili come sconti sulle prenotazioni.
- Reception: 24h, chiamare lo 0 dalla camera.
- Check-out: entro le 11:00.
- WiFi gratuito in tutta la struttura.

REGOLE:
- Risposte MAX 3 frasi, vai dritto al punto.
- Se l'ospite chiede di prenotare qualcosa, suggerisci la pagina dell'app e proponi di guidarlo.
- Se non sai una cosa specifica (allergie, orari particolari), invita a chiamare la reception.
- Non inventare prezzi che non conosci. I prezzi delle offerte li conosce solo l'app.
- Mai dare consigli medici, legali o finanziari.`;

module.exports = async (req, res) => {
  // CORS (se serve)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(503).json({ error: 'AI non configurata', fallback: true });
    return;
  }

  try {
    const { messages } = req.body || {};
    if (!Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({ error: 'messages array richiesto' });
      return;
    }

    const trimmed = messages.slice(-20).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content || '').slice(0, 2000)
    }));

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages: trimmed
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic error:', response.status, errText);
      res.status(502).json({ error: 'Errore servizio AI', fallback: true });
      return;
    }

    const data = await response.json();
    const reply = data.content?.[0]?.text || 'Mi spiace, non ho capito. Puoi ripetere?';
    res.status(200).json({ reply });
  } catch (err) {
    console.error('Chat error:', err);
    res.status(500).json({ error: 'Errore interno', fallback: true });
  }
};
