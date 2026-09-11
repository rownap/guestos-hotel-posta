# GuestOS, guida prodotto

App web installabile per gli ospiti di hotel e villaggi, con console di gestione per la direzione.
Prenotazioni dei servizi interni, punti e premi, offerte a tempo, assistente testuale.

Documento a uso commerciale e operativo. Aggiornato all'11 settembre 2026.

Contatto: RC Studio, Roberto Ciccarelli, [umidifire22@gmail.com](mailto:umidifire22@gmail.com).

## 1. Cosa fa GuestOS, in trenta secondi

GuestOS è un'app web (PWA) che l'ospite aggiunge alla schermata Home del telefono senza passare
dagli store. Non richiede installazione di nulla in struttura: è una pagina web con un database
dedicato.

Dall'app l'ospite può:

- prenotare ristorante, centro benessere ed escursioni scegliendo data, orario e numero di persone;
- accumulare punti con i minigiochi e usarli come sconto o per riscattare premi;
- vedere le offerte a tempo pubblicate dalla direzione, con conto alla rovescia reale;
- consultare programma di animazione, menu e informazioni sulla struttura;
- gestire il proprio profilo e lo storico delle prenotazioni;
- scrivere a un assistente testuale che risponde su orari e servizi, se la struttura attiva la
  funzione.

Dalla console di gestione la direzione può:

- vedere i soggiorni attivi, gli arrivi e le partenze del giorno;
- vedere e cambiare stato alle prenotazioni dei tre servizi;
- pubblicare un'offerta a tempo in meno di un minuto, anche da modello precompilato;
- correggere i punti di un ospite e segnare come consegnati i premi riscattati;
- rigenerare il PIN di un ospite che l'ha perso;
- modificare i contenuti: menu, listino benessere, escursioni, programma serate;
- scrivere le risposte di riferimento dell'assistente.

## 2. Il flusso dell'ospite, dall'arrivo al check-out

### 2.1 Arrivo

1. Check-in normale alla reception. Lo staff consegna un QR, stampato sulla key card o su un
   cartoncino in camera.
2. L'ospite inquadra il QR e apre l'app nel browser del telefono.
3. Prima volta: tocca Registrati, inserisce numero di camera, cognome ed email, indica la durata del
   soggiorno e riceve un PIN a sei cifre. Il PIN viene mostrato una volta sola.
4. Il telefono propone di aggiungere l'app alla schermata Home. Da quel momento l'icona resta lì.

Il PIN non è visibile a nessuno dopo la registrazione, nemmeno allo staff: sul database è salvato
solo il suo hash. Se l'ospite lo perde, la reception ne genera uno nuovo dalla console.

### 2.2 Durante il soggiorno

- L'ospite apre l'app e trova le scorciatoie verso i servizi della struttura.
- Prenota un tavolo o un trattamento scegliendo data, orario e persone. Il prezzo finale e l'eventuale
  sconto in punti li calcola il server, non il telefono: l'ospite non può manipolare l'importo.
- Paga con i punti, chiede l'addebito in camera oppure, se la struttura ha attivato i pagamenti,
  paga con carta su pagina Stripe.
- La prenotazione compare subito nella console di gestione.
- Gioca ai minigiochi e accumula punti. I punti li assegna il server con tetti giornalieri, quindi
  non sono gonfiabili dal telefono.
- Vede un'offerta a tempo e la prenota dall'app finché il conto alla rovescia non scade.

### 2.3 Lato struttura

- Lo staff accede alla console da un indirizzo riservato, escluso dai motori di ricerca.
- Vista di sintesi: ospiti presenti, arrivi e partenze del giorno, prenotazioni da confermare,
  incasso dei servizi interni negli ultimi giorni, ospiti con più punti.
- Soggiorni attivi: elenco filtrabile per camera e cognome, con rigenerazione PIN, proroga del
  soggiorno e disattivazione immediata.
- Prenotazioni: tre elenchi separati, ristorante, benessere ed escursioni, con cambio di stato in un
  clic tra confermata, completata e annullata.
- Offerte a tempo: si scelgono servizio, sconto, titolo e durata. Esistono modelli pronti per gli
  scenari ricorrenti: giornata di pioggia verso il centro benessere, ultimi posti su un'escursione,
  tavoli liberi per la sera.
- Punti e premi: correzione manuale dei punti con motivazione registrata, elenco dei premi da
  consegnare.

Ogni operazione sensibile della console viene registrata in un registro interno con data, operatore
e oggetto dell'intervento.

### 2.4 Partenza

- Il soggiorno ha una data di fine. Alla scadenza l'accesso dell'ospite smette di funzionare da solo.
- Lo staff può chiudere il soggiorno prima, in qualsiasi momento, e l'effetto è immediato.
- I premi non ritirati restano nell'elenco della reception.

## 3. Cosa fa l'app oggi

Tre categorie, senza zone grigie.

### 3.1 Attivo subito, serve solo il database della struttura

- Registrazione dell'ospite in autonomia, con PIN generato e mostrato una sola volta.
- Accesso ricorrente con camera, cognome e PIN. Blocco dopo cinque tentativi falliti per dieci minuti.
- Prenotazione ristorante, centro benessere ed escursioni con calendario e fasce orarie.
- Pagamento con punti o addebito in camera.
- Annullamento della prenotazione da parte dell'ospite e storico nel profilo.
- Sistema punti con tetti per partita e per giornata calcolati dal server.
- Diciannove minigiochi, più quiz, indovinello del giorno e sfida settimanale.
- Classifica generale e per singolo gioco, senza email degli altri ospiti.
- Catalogo premi, riscatto con codice, gestione della consegna lato reception.
- Offerte a tempo con conto alla rovescia reale.
- Programma animazione, menu e schede dei servizi, modificabili dalla console.
- Console di gestione completa: soggiorni, prenotazioni, punti, premi, contenuti, offerte, statistiche.
- Installazione sulla schermata Home su iOS e Android.
- Consultazione senza rete delle pagine già visitate, vedi punto 3.4.

### 3.2 Richiede la configurazione di una chiave esterna

Sono funzioni già scritte e collegate. Restano spente fino a quando la chiave non viene inserita
nelle variabili d'ambiente. Se la chiave manca, l'app non si rompe: la funzione si comporta come
descritto qui sotto.

| Funzione | Chiave necessaria | Comportamento senza la chiave |
|---|---|---|
| Assistente testuale | `ANTHROPIC_API_KEY` | Risponde in modalità base, per parole chiave, su orari e informazioni di servizio. Nessun errore visibile all'ospite. |
| Pagamento con carta | `STRIPE_SECRET_KEY` e `STRIPE_WEBHOOK_SECRET` | Il pulsante di pagamento risponde che il pagamento online non è disponibile. Punti e addebito in camera continuano a funzionare. |
| Email di conferma prenotazione | `RESEND_API_KEY` e `MAIL_FROM` | La prenotazione resta valida e visibile in console. L'email non parte. |

Dettagli operativi in [`docs/AI.md`](docs/AI.md) e [`docs/PAYMENTS.md`](docs/PAYMENTS.md).

### 3.3 Non incluso

- Versione multilingua. Oggi l'app è solo in italiano. Si può fare, è un'opzione a listino.
- App nativa sugli store Apple e Google.
- Integrazione con il gestionale o il channel manager della struttura.
- Tariffe dinamiche calcolate automaticamente.
- Gestione delle recensioni su portali esterni.
- CRM e storico ospite pluriennale.
- Check-in con acquisizione del documento e firma.
- Notifiche push inviate dalla struttura. La parte sul telefono è pronta, l'invio dal server no.
- Pagamento al banco con POS fisico.

### 3.4 Cosa significa davvero "funziona senza rete"

L'app non funziona offline in senso pieno e non lo promettiamo.

Quello che succede davvero: le pagine già aperte una volta restano consultabili anche senza
connessione, perché il telefono le ha conservate. L'ospite può quindi rileggere menu, programma e
informazioni in una zona della struttura dove il segnale non arriva.

Quello che invece richiede connessione: prenotare, annullare, guadagnare punti, riscattare premi,
vedere le classifiche, parlare con l'assistente. Se la rete manca, l'app dice che l'operazione non è
riuscita e invita a riprovare. Non esiste una coda che invia le prenotazioni quando la rete torna.

### 3.5 Cosa completiamo prima della prima consegna a un cliente

Dichiarato in chiaro, perché un direttore se ne accorge comunque.

- Tre pagine di prenotazione (ristorante, benessere, escursioni) vanno allineate al modello di
  sicurezza nuovo, già attivo sulle altre pagine.
- Cancellazione automatica dei dati degli ospiti dopo la scadenza del periodo di conservazione.
- Backup a ripristino puntuale attivi sul database.
- Registro dei trattamenti e nomina dei fornitori come responsabili del trattamento.

L'elenco aggiornato e completo sta in [`stato_progetto_guestos.md`](stato_progetto_guestos.md) e, per
la parte di sicurezza, in [`SECURITY.md`](SECURITY.md).

## 4. A chi serve

### 4.1 Cliente adatto

- Hotel tre e quattro stelle o villaggi, da venticinque a centocinquanta camere.
- Struttura che vende servizi interni: ristorante à la carte, centro benessere, escursioni, noleggi.
  È lì che l'app può produrre un effetto misurabile.
- Stagionalità marcata, quindi pochi mesi per fare ricavo accessorio.
- Ospite italiano o famiglia italiana, abituata a prenotare dal telefono.
- Nessun informatico interno. L'app deve funzionare senza manutenzione quotidiana.
- Reception che riceve molte richieste ripetitive su orari e servizi.

### 4.2 Cliente non adatto

- Strutture sotto le quindici camere: il costo fisso non si giustifica.
- Hotel che non vende nulla oltre il pernottamento e la colazione. Senza servizi interni non c'è
  ricavo accessorio da intercettare e l'app resta un gadget.
- Cinque stelle con concierge dedicato, dove il valore percepito è il rapporto umano.
- Clientela prevalentemente straniera, fino a quando la versione multilingua non è realizzata.
- Catene che richiedono gestione multi struttura da un'unica console.
- Chi cerca un PMS o un channel manager. GuestOS non gestisce camere, tariffe e disponibilità.

## 5. Il valore economico, senza numeri inventati

### 5.1 Premessa onesta

Nessuna struttura ha ancora completato una stagione con GuestOS. Non esistono quindi dati storici
d'uso, né percentuali di aumento delle prenotazioni da mostrare. Qualunque numero di questo tipo
scrivessimo oggi sarebbe inventato, e un direttore che conosce il settore lo smonterebbe in trenta
secondi.

Quello che segue è uno scenario aritmetico, non una previsione. Serve a capire quante vendite in più
servono per coprire il costo, non a promettere che arriveranno.

### 5.2 La formula

Ricavo accessorio aggiuntivo in una stagione:

```
Ricavo aggiuntivo = Presenze x Tasso di acquisto tramite app x Margine medio per vendita

Presenze            = camere x occupazione media x ospiti per camera x notti di stagione
Tasso di acquisto   = quota di presenze che compra un servizio interno passando dall'app
                      CHE NON ABBIAMO MISURATO: va stimato dalla direzione o misurato in stagione
Margine medio       = prezzo del servizio meno costo diretto, dato che la struttura già conosce
```

Le due grandezze a sinistra le conosce la direzione. Quella al centro è l'incognita. Per questo non
proponiamo un ritorno sull'investimento: proponiamo un punto di pareggio.

### 5.3 Punto di pareggio, l'unico conto difendibile

Il punto di pareggio non dipende da stime nostre. Dipende solo dal costo di GuestOS e dal margine
della struttura.

```
Vendite aggiuntive necessarie = Costo GuestOS nel periodo / Margine medio per vendita
```

Esempio con i prezzi di listino del punto 6 e un margine ipotetico di quaranta euro per trattamento
o escursione. Il margine va sostituito con quello vero della struttura.

| Fascia | Costo prima stagione (sei mesi) | Vendite aggiuntive per andare in pari | Al mese |
|---|---|---|---|
| Base | 1.500 + 990 = 2.490 euro | 63 | circa 11 |
| Pro | 3.000 + (249 x 6) = 4.494 euro | 113 | circa 19 |
| Villaggio | da 4.500 + (349 x 6) = 6.594 euro | 165 | circa 28 |

Lettura della tabella, da fare davanti al direttore: non serve credere a nessuna percentuale. Serve
rispondere a una domanda sola, e il direttore è l'unico che può rispondere: "diciannove trattamenti
in più al mese, su questo volume di ospiti, sono pochi o molti?".

### 5.4 Costo per soggiorno

Altro conto utile, anch'esso solo aritmetica. Struttura da quaranta camere, occupazione media del
settanta per cento, due ospiti per camera, centottanta notti di stagione, soggiorno medio di cinque
notti.

```
Presenze notte   = 40 x 0,70 x 2 x 180 = 10.080
Soggiorni        = 10.080 / 5 = 2.016
Costo per soggiorno, fascia Base = 2.490 / 2.016 = 1,24 euro
```

Un euro e ventiquattro per soggiorno. Le assunzioni sono quelle scritte sopra: si cambiano con i
numeri veri della struttura e il conto si rifà in un minuto.

### 5.5 I dati reali arriveranno dal primo caso studio

I numeri d'uso veri (quanti ospiti installano l'app, quanti prenotano da lì, quante richieste in
meno arrivano alla reception) li potremo pubblicare solo dopo la prima stagione completa con una
struttura reale. Fino a quel momento, in questo documento non ci sarà nessuna percentuale.

### 5.6 Proposta al primo cliente, caso studio

A chi entra primo offriamo un canone ridotto in cambio del diritto di pubblicare i numeri.

Cosa dà la struttura:

- il diritto di misurare e pubblicare i dati d'uso e di vendita generati dall'app, in forma
  aggregata, senza alcun dato personale degli ospiti;
- il nome della struttura come riferimento, se acconsente, e una citazione della direzione;
- un'ora di confronto al mese per raccontarci cosa funziona e cosa no.

Cosa ottiene la struttura:

- canone della prima stagione scontato, definito nella proposta economica;
- priorità assoluta sugli interventi e sulle funzioni richieste;
- prezzo bloccato per la stagione successiva;
- posizione di struttura pilota, raccontabile nella propria comunicazione.

Il vantaggio è simmetrico e va detto così: noi abbiamo bisogno dei loro numeri, loro pagano meno
perché ce li danno.

## 6. Listino

Tre fasce. I prezzi sono IVA esclusa.

### 6.1 Base

Per hotel stagionali da venticinque a sessanta camere.

- Attivazione: 1.500 euro una tantum.
- Canone: 149 euro al mese, oppure 990 euro per una stagione di sei mesi.

Comprende: app ospite completa, prenotazioni dei tre servizi con punti e addebito in camera, giochi
e premi, offerte a tempo, console di gestione, personalizzazione grafica, formazione dello staff a
distanza, assistenza via email.

Non comprende: assistente testuale, pagamenti con carta in app.

### 6.2 Pro

Per hotel e villaggi da sessanta a centocinquanta camere.

- Attivazione: 3.000 euro una tantum.
- Canone: 249 euro al mese.

Comprende tutto il Base, più:

- assistente testuale con base di conoscenza scritta sui dati della struttura;
- pagamenti con carta in app, su pagina di pagamento esterna;
- email di conferma delle prenotazioni all'ospite, con copia allo staff.

### 6.3 Villaggio

Oltre le centocinquanta camere, o con più punti ristoro.

- Attivazione: da 4.500 a 6.000 euro, in base al numero di punti ristoro e di servizi da configurare.
- Canone: da 349 a 399 euro al mese.

Comprende tutto il Pro, più:

- modulo ristoranti a turni, costruito su misura sull'organizzazione della struttura;
- formazione del personale in loco.

### 6.4 Opzioni

| Opzione | Prezzo |
|---|---|
| Versione multilingua (inglese, francese, tedesco) | 1.500 euro una tantum |
| Integrazione con il gestionale esistente | a preventivo, previa analisi di fattibilità |
| Personalizzazione grafica spinta (mascotte dedicata, animazioni) | a preventivo |
| Formazione aggiuntiva in loco, oltre a quella inclusa | a preventivo |

Nota sul prezzo della versione multilingua. Sono oltre cinquanta file, tra pagine e script, con i
testi scritti dentro il codice e senza alcun sistema di traduzione. Tradurre non significa passare
un file a un traduttore: significa prima estrarre tutte le stringhe, introdurre un meccanismo di
lingua, poi tradurre e poi riverificare pagina per pagina. Millecinquecento euro è il costo di quel
lavoro, fatto una volta sola per tutte le lingue.

### 6.5 Cosa resta a carico della struttura

- Le commissioni di transazione del circuito di pagamento, sull'incassato. Non passano da noi: la
  struttura incassa direttamente sul proprio conto Stripe e paga le commissioni secondo il contratto
  che firma con Stripe.
- L'eventuale dominio personalizzato, se ne vuole uno proprio.
- I contenuti: testi, foto, listini, orari. Noi li carichiamo, la struttura li fornisce.

Hosting, database, chiave dell'assistente e servizio email sono compresi nel canone della fascia
corrispondente.

## 7. Come si dimostra alla direzione, script di cinque minuti

1. Apro l'app sul mio telefono e la passo al direttore. Prima frase: "lei in questo momento è un
   ospite, non vede nessun pannello di amministrazione".
2. Gli faccio aggiungere l'app alla schermata Home. Dura cinque secondi e chiude la domanda "ma
   devono scaricare qualcosa?".
3. Prenoto una cena. Scelgo data, orario, due persone, confermo. Faccio notare che il prezzo lo
   calcola il server.
4. Apro i giochi, faccio una partita, vinco dei punti, mostro la classifica.
5. Apro le offerte a tempo e mostro il conto alla rovescia che scende davvero.
6. Se la struttura prende la fascia Pro: scrivo all'assistente "a che ora apre il centro benessere" e
   mostro la risposta.
7. Passo al mio portatile, apro la console e gli mostro la cena che abbiamo appena prenotato, già lì.
   La confermo davanti a lui.
8. Pubblico un'offerta a tempo da modello, trenta minuti di durata, e torno sul telefono: c'è.
9. Chiudo con il conto del punto 5.3, non con una percentuale: "questa fascia le costa questo. Con il
   suo margine, vanno in pari con tanti servizi in più al mese. Secondo lei sono pochi o molti?".

Cosa non fare in demo: non citare aumenti percentuali, non dire che l'app funziona offline, non
promettere integrazioni con il gestionale senza aver visto il gestionale.

## 8. Domande che fa la direzione

**Gli ospiti la usano davvero, o resta un'icona sul telefono?**
Non lo sappiamo ancora e non le racconteremo numeri che non abbiamo. Sappiamo che non serve scaricare
nulla dallo store, che il QR la apre in un tocco e che l'aggiunta alla schermata Home dura cinque
secondi: abbiamo rimosso gli ostacoli che conosciamo. L'unico modo di rispondere con certezza è
misurarlo nella sua struttura. Per questo offriamo la condizione da caso studio del punto 5.6.

**Funziona senza rete?**
In parte. Le pagine già aperte restano leggibili senza connessione, quindi menu, programma e
informazioni si consultano anche dove il segnale non arriva. Prenotare, guadagnare punti e parlare
con l'assistente richiedono la rete. Non c'è una coda che invia le prenotazioni quando la rete torna:
se manca la connessione, l'app lo dice.

**Cosa succede se l'assistente smette di rispondere?**
L'app continua a funzionare. L'assistente passa in modalità base e risponde per parole chiave alle
domande più frequenti. L'ospite non incontra nessun errore. Le prenotazioni non dipendono in alcun
modo dall'assistente.

**Dove finiscono i dati dei miei ospiti?**
Su un database dedicato alla sua struttura, in Unione Europea, con accesso riservato: nessun'altra
struttura lo vede. Il PIN dell'ospite è salvato solo come hash, quindi nemmeno noi possiamo leggerlo.
I numeri di carta non entrano mai nel database: li gestisce Stripe. Dettaglio completo in
[`SECURITY.md`](SECURITY.md) e nell'informativa in `privacy.html`. Prima di trattare dati di ospiti
reali restano da completare i punti elencati al 3.5.

**Posso cambiare prezzi, menu e orari da solo?**
Sì, dalla console, nella sezione contenuti. Per interventi più profondi, come palette, logo o nuove
sezioni, ci pensiamo noi.

**La stagione finisce e voglio sospendere.**
La fascia Base ha la formula stagionale da sei mesi. Fuori stagione il database resta fermo e i dati
non si perdono: la riattivazione richiede poche ore di lavoro. Il canone mensile si disdice con
preavviso secondo contratto.

**Il PIN di sei cifre è sicuro?**
È casuale, vale solo per la durata del soggiorno e scade con essa. Cinque tentativi sbagliati sulla
stessa camera bloccano gli accessi per dieci minuti, e il blocco è sul server, non sul telefono. Il
PIN non è leggibile da nessuno dopo la generazione, staff incluso: si può solo rigenerare. Se la
struttura vuole un livello più alto, si può passare a un codice inviato per email, a preventivo.

**Un ospite può barare sui punti e svuotare il catalogo premi?**
No. I punti li calcola il server, con un tetto per partita e un tetto giornaliero. Il riscatto di un
premio verifica punti e disponibilità nella stessa operazione. Il telefono non può scrivere un
punteggio arbitrario.

**Chi mi garantisce che non sparite dopo il primo mese?**
Il codice è nostro, ma il database e l'account Stripe sono suoi, intestati alla struttura.
L'esportazione dei dati in formato leggibile è sempre possibile e gratuita. È una garanzia verificabile
prima della firma, non una promessa.

**Quanto tempo serve per partire?**
Da quando abbiamo contenuti e accessi: pochi giorni per la configurazione e la personalizzazione, più
una sessione di formazione con lo staff. I tempi certi li mettiamo nella proposta, per iscritto.

## 9. Come si chiude una trattativa

1. Demo di cinque minuti sul telefono del direttore, script al punto 7.
2. Versione personalizzata con logo, colori e due o tre contenuti veri della struttura, da toccare
   con mano. Serve a far scattare il "questo è il mio hotel", non a mostrare funzioni nuove.
3. Prova su un sottoinsieme di camere, per esempio un'ala, con conteggio delle prenotazioni arrivate
   dall'app. È anche il primo dato d'uso reale che raccogliamo.
4. Proposta economica con la fascia, il punto di pareggio calcolato sui margini veri della struttura
   e i tempi di attivazione per iscritto.
5. Per il primo cliente, condizione da caso studio del punto 5.6.

Documenti correlati: [`README.md`](README.md) per la parte tecnica,
[`stato_progetto_guestos.md`](stato_progetto_guestos.md) per lo stato dei lavori,
[`docs/DEPLOY.md`](docs/DEPLOY.md) per la messa in opera di una nuova struttura.
