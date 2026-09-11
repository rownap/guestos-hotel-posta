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

commit;
