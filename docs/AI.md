# Bubbles — il receptionist AI

Bubbles è l'assistente che risponde agli ospiti in `chat.html`. Gira su una
Vercel Function (`api/chat.js`), non nel browser: la chiave Anthropic non esce
mai dal server.

## Come è fatto

| | |
|---|---|
| Modello | `claude-haiku-4-5-20251001` |
| Risposta massima | 400 token |
| Storico inviato | ultimi 20 messaggi, 2 000 caratteri l'uno |
| Rate limit | 30 messaggi ogni 10 minuti per IP |
| Timeout Anthropic | 25 s |

Il rate limit vive nella memoria della funzione. Vercel tiene più istanze in
parallelo, quindi il limite reale è un po' più largo di 30: serve a fermare un
loop o uno script, non a contare al singolo messaggio.

## Il system prompt

Non è scritto nel codice: viene costruito a ogni richiesta da due sorgenti nel
database.

1. **`hotel_settings` (riga id=1)** — nome, città, orari di ristorante e spa,
   telefono della reception, orario di check-out, nota WiFi, messaggio di
   benvenuto e `ai_extra_instructions` (istruzioni libere per lo staff).
   Se la tabella non risponde si usano i default scritti in `api/chat.js`.
2. **`ai_knowledge_base`** — tutte le righe con `is_active = true`, ordinate per
   categoria e titolo, fino a un budget di **12 000 caratteri**. Oltre quella
   soglia i documenti vengono troncati e la risposta segnala `truncated`.

Il risultato è tenuto in cache **120 secondi**: un documento salvato dal pannello
è operativo entro un paio di minuti, senza alcun deploy.

> Non esistono embedding e non serve nessuna Edge Function. La knowledge base
> viene letta come testo e messa nel prompt. Il blocco di sistema viaggia con
> `cache_control: ephemeral`, quindi Anthropic lo rifattura a tariffa ridotta
> per le richieste ravvicinate.

## Scrivere la knowledge base

Pannello admin → **Knowledge Base** (`admin-knowledge-base.html`). Ogni documento
ha titolo, categoria, contenuto, lingua e un flag attivo/inattivo.

Cosa funziona, in pratica:

- un documento per argomento, non un unico papiro;
- il titolo è quello che l'AI legge per orientarsi: `Orari colazione`, non `Info 3`;
- fatti e numeri, non tono di voce (il tono lo dà già il system prompt);
- quello che non deve dire va scritto in `ai_extra_instructions`, non qui;
- per togliere un'informazione basta disattivarla: resta lo storico.

## Quando l'AI non risponde

La funzione non va mai in errore davanti all'ospite. Ha tre gradi di fallback:

| Situazione | Cosa succede |
|---|---|
| `ANTHROPIC_API_KEY` assente | risposta a parole chiave, `fallback: true` |
| Anthropic in errore o in timeout | stessa risposta a parole chiave |
| Rate limit superato | HTTP 429 con il messaggio che invita a contattare la reception |

La risposta di riserva rimanda sempre alla reception: è il comportamento giusto
per una struttura, meglio di un'AI che inventa.

## Variabili d'ambiente

```
ANTHROPIC_API_KEY           obbligatoria per le risposte vere
SUPABASE_URL                progetto Supabase
SUPABASE_SERVICE_ROLE_KEY   per leggere hotel_settings e ai_knowledge_base
```

`SUPABASE_SERVICE_ROLE_KEY` è comoda ma non indispensabile: entrambe le tabelle
sono leggibili in SELECT anche con la anon key, e la funzione ripiega su quella.

## Costi

Haiku 4.5 con 400 token di risposta e un prompt di sistema in cache costa
frazioni di centesimo a messaggio. La voce che pesa è il prompt di sistema, ed è
esattamente quella che il prompt caching sconta: tenere la knowledge base sotto
i 12 000 caratteri non è solo un limite tecnico, è la leva sul costo.

## Provare in locale

```bash
curl -s localhost:3000/api/chat -H 'content-type: application/json' \
  -d '{"messages":[{"role":"user","content":"A che ora è la colazione?"}]}'
```

Nella risposta, `fallback: true` significa che l'AI non è stata interpellata:
o manca la chiave, o Anthropic non ha risposto.

## File

- `api/chat.js` — la funzione
- `chat.html` — l'interfaccia ospite
- `ai-agent-api.js` — storico conversazioni e feedback (`log_ai_message`,
  `get_my_ai_history`, `submit_ai_feedback`; il rating vale solo 1 o -1)
- `admin-knowledge-base.html` — il pannello dei documenti
