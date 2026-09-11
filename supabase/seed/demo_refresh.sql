-- =====================================================================
-- GuestOS — rinfresca i dati dimostrativi
-- =====================================================================
-- I dati demo erano fermi a gennaio: offerte last minute scadute da mesi e
-- flash deals tutte `expired`, quindi le sezioni risultavano vuote e non
-- erano collaudabili. Questo file è rieseguibile: sposta le scadenze avanti
-- e collega le offerte spa e tour al catalogo, che è la condizione perché
-- `create_booking` le accetti.
--
-- NON è una migration: non tocca lo schema e non va eseguito sul progetto
-- di un cliente vero.
-- =====================================================================

begin;

-- Offerte last minute: valide da ora a fine giornata di domani, con i posti
-- ripristinati e il servizio del catalogo collegato.
update public.last_minute_offers
   set valid_from = now() - interval '1 hour',
       valid_until = (current_date + interval '2 days')::timestamptz,
       slots_available = coalesce(slots_total, 5),
       active = true;

-- Le due prenotabili puntano al catalogo vero.
update public.last_minute_offers o
   set item_id = t.id
  from (select id from public.tours where coalesce(active, true) order by id limit 1) t
 where o.type = 'tour' and o.item_id is null;

update public.last_minute_offers o
   set item_id = t.id
  from (select id from public.spa_treatments order by id limit 1) t
 where o.type = 'spa' and o.item_id is null;

-- `camera` e `combo` non hanno una tabella di prenotazione: restano in vetrina
-- e si confermano in reception. Il testo lo dice, così l'ospite non ci prova.
update public.last_minute_offers
   set description = case
           when description like '%reception%' then description
           else description || ' — si conferma in reception.'
       end
 where type in ('camera', 'combo');

-- Flash deals: due attive per le prossime ore, il resto resta scaduto.
update public.flash_deals set status = 'expired' where status <> 'expired';

update public.flash_deals
   set status = 'active', expires_at = now() + interval '6 hours'
 where id in (
     select id from public.flash_deals
      where service_type in ('spa', 'restaurant') and headline is not null
      order by created_at desc limit 2);

-- Soggiorni: l'app disattiva l'ospite scaduto solo quando qualcuno chiede lo
-- stato di quella camera, una camera per chiamata. Restavano 25 ospiti con
-- `active = true` e il soggiorno finito a gennaio, quindi le loro camere
-- rispondevano `ended` invece di `free` e non erano riassegnabili.
update public.users
   set active = false
 where active = true and stay_end_date < current_date;

-- I due ospiti dimostrativi restano in casa fino a fine anno.
update public.users
   set active = true,
       stay_start_date = least(coalesce(stay_start_date, current_date), current_date),
       stay_end_date = greatest(coalesce(stay_end_date, current_date), (current_date + interval '90 days')::date)
 where email in ('demo101@hotelposta.it', 'demo205@hotelposta.it');

-- Premi doppi. Il catalogo contiene due generazioni di seed sovrapposte: una
-- con categoria e valore in euro ma prezzi in punti altissimi (Upgrade Camera
-- 8000), una senza categoria e molto più economica (lo stesso upgrade a 500).
-- Con lo stesso nome a due prezzi l'ospite vede il doppione e non capisce
-- quale valga. Si tiene il più conveniente, gli si copia la categoria (che
-- serve a raggruppare le card) e l'altro si disattiva invece di cancellarlo:
-- `user_rewards` ha già dei riscatti che puntano a queste righe e la storia
-- non va riscritta.
--
-- NON è una scelta di prezzo: se il listino giusto è l'altro, si riattiva la
-- riga e si disattiva questa. Va deciso prima di andare da un cliente vero.
with normalizzati as (
    select id, lower(regexp_replace(name, '\s+', '', 'g')) as chiave,
           points_required, category, value_euros
      from public.rewards
     where active = true
), tenuti as (
    select distinct on (chiave) chiave, id, points_required
      from normalizzati
     order by chiave, points_required asc, (category is not null) desc, id asc
)
update public.rewards r
   set active = false
  from normalizzati n
  join tenuti t on t.chiave = n.chiave
 where r.id = n.id and n.id <> t.id;

-- La categoria del doppione disattivato serve al raggruppamento: si travasa
-- sulla riga tenuta se le manca. Il valore in euro no: apparterrebbe a un
-- listino diverso e mostrerebbe uno sconto che non esiste.
update public.rewards tenuto
   set category = scartato.category
  from public.rewards scartato
 where tenuto.active = true
   and scartato.active = false
   and tenuto.category is null
   and scartato.category is not null
   and lower(regexp_replace(tenuto.name, '\s+', '', 'g'))
     = lower(regexp_replace(scartato.name, '\s+', '', 'g'));

-- Prenotazioni di prova rimaste da collaudi vecchi ("Test", "E2E Test").
delete from public.spa_bookings
 where treatment_name ilike '%test%' and created_at < '2026-06-01';
delete from public.tour_bookings
 where tour_name ilike '%test%' and created_at < '2026-06-01';

commit;
