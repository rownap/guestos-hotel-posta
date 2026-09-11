-- ============================================================================
-- 004_ai.sql — Persistenza chat AI (Bubbles) via RPC SECURITY DEFINER
-- ============================================================================
-- Dipendenze (eseguire PRIMA): 001_security.sql (users.session_token, is_admin()),
-- 002_guest_rpc.sql. Idempotente: si può rieseguire.
--
-- Schema verificato sul DB live (2026-09-10, anon REST):
--   ai_conversations(id uuid, user_id uuid, status, language, started_at, last_message_at,
--                    created_at, updated_at, metadata jsonb)
--   ai_messages(id uuid, conversation_id uuid, role, content, metadata jsonb,
--               tokens_used int, response_time_ms, created_at)
--   ai_feedback(id uuid, message_id uuid, conversation_id uuid, user_id uuid, rating int,
--               comment, created_at)
--   ai_actions(id uuid, conversation_id, message_id, action_type, action_data, status, created_at)
--   ai_knowledge_base(id uuid, title, category, content, language, is_active, embedding, ...)
--   users.id è INTEGER: user_id uuid non può referenziarlo → aggiungiamo guest_user_id int.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Colonne di collegamento agli ospiti (users.id integer)
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_conversations
  ADD COLUMN IF NOT EXISTS guest_user_id integer REFERENCES public.users(id) ON DELETE SET NULL;
ALTER TABLE public.ai_feedback
  ADD COLUMN IF NOT EXISTS guest_user_id integer REFERENCES public.users(id) ON DELETE SET NULL;

-- user_id (uuid, pensato per auth.users) resta ma deve poter essere NULL e non avere FK bloccanti.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.conname, c.conrelid::regclass AS tbl
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.contype = 'f'
      AND c.conrelid IN ('public.ai_conversations'::regclass, 'public.ai_feedback'::regclass)
      AND a.attname = 'user_id'
  LOOP
    EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.tbl, r.conname);
  END LOOP;
END $$;

ALTER TABLE public.ai_conversations ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.ai_feedback      ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.ai_conversations ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
ALTER TABLE public.ai_messages      ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS ai_conversations_guest_idx ON public.ai_conversations (guest_user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS ai_messages_conv_created_idx ON public.ai_messages (conversation_id, created_at);
CREATE INDEX IF NOT EXISTS ai_feedback_message_idx ON public.ai_feedback (message_id);
CREATE INDEX IF NOT EXISTS ai_knowledge_base_active_idx ON public.ai_knowledge_base (is_active, category);

-- ---------------------------------------------------------------------------
-- 2. Helper: risolve il token ospite → users.id (NULL se non valido)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_resolve_guest(p_token uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT u.id
  FROM public.users u
  WHERE p_token IS NOT NULL
    AND u.session_token = p_token
    AND u.active IS TRUE
    AND (u.stay_end_date IS NULL OR u.stay_end_date >= current_date)
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.ai_resolve_guest(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. log_ai_message: crea la conversazione se serve e salva un messaggio.
--    Ritorna json {conversation_id, message_id} (message_id serve per il feedback).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_ai_message(
  p_token uuid,
  p_conversation_id uuid,
  p_role text,
  p_content text,
  p_meta jsonb DEFAULT '{}'::jsonb
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_guest_id integer;
  v_conv_id uuid;
  v_msg_id uuid;
  v_content text;
  v_meta jsonb := COALESCE(p_meta, '{}'::jsonb);
  v_lang text;
BEGIN
  v_guest_id := public.ai_resolve_guest(p_token);
  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida o scaduta' USING ERRCODE = '28000';
  END IF;

  IF p_role NOT IN ('user', 'assistant') THEN
    RAISE EXCEPTION 'Ruolo non valido' USING ERRCODE = '22023';
  END IF;

  v_content := left(btrim(COALESCE(p_content, '')), 4000);
  IF v_content = '' THEN
    RAISE EXCEPTION 'Contenuto vuoto' USING ERRCODE = '22023';
  END IF;

  -- Metadata: solo un sottoinsieme controllato, max 2 KB.
  IF jsonb_typeof(v_meta) <> 'object' THEN v_meta := '{}'::jsonb; END IF;
  v_meta := jsonb_strip_nulls(jsonb_build_object(
    'action_type',      left(v_meta->>'action_type', 40),
    'model',            left(v_meta->>'model', 60),
    'fallback',         CASE WHEN (v_meta->>'fallback') IN ('true','false') THEN (v_meta->>'fallback')::boolean END,
    'language',         left(v_meta->>'language', 5),
    'rate_limited',     CASE WHEN (v_meta->>'rate_limited') = 'true' THEN true END
  ));
  v_lang := COALESCE(NULLIF(v_meta->>'language', ''), 'it');

  -- Conversazione esistente: deve appartenere all'ospite, altrimenti se ne crea una nuova.
  IF p_conversation_id IS NOT NULL THEN
    SELECT c.id INTO v_conv_id
    FROM public.ai_conversations c
    WHERE c.id = p_conversation_id AND c.guest_user_id = v_guest_id;
  END IF;

  IF v_conv_id IS NULL THEN
    INSERT INTO public.ai_conversations (guest_user_id, status, language, started_at, last_message_at, metadata)
    VALUES (v_guest_id, 'active', v_lang, now(), now(), jsonb_build_object('source', 'chat.html'))
    RETURNING id INTO v_conv_id;
  END IF;

  INSERT INTO public.ai_messages (conversation_id, role, content, metadata, tokens_used, response_time_ms)
  VALUES (
    v_conv_id,
    p_role,
    v_content,
    v_meta,
    CASE WHEN (p_meta->>'tokens_used') ~ '^\d{1,7}$' THEN (p_meta->>'tokens_used')::int END,
    CASE WHEN (p_meta->>'response_time_ms') ~ '^\d{1,7}$' THEN (p_meta->>'response_time_ms')::int END
  )
  RETURNING id INTO v_msg_id;

  UPDATE public.ai_conversations
  SET last_message_at = now(), updated_at = now()
  WHERE id = v_conv_id;

  RETURN json_build_object('conversation_id', v_conv_id, 'message_id', v_msg_id);
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. get_my_ai_history: ultima conversazione dell'ospite con gli ultimi p_limit messaggi
--    (ordine cronologico). Ritorna json {conversation_id, messages:[...]}.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_ai_history(p_token uuid, p_limit int DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_guest_id integer;
  v_conv_id uuid;
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  v_messages json;
BEGIN
  v_guest_id := public.ai_resolve_guest(p_token);
  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida o scaduta' USING ERRCODE = '28000';
  END IF;

  SELECT c.id INTO v_conv_id
  FROM public.ai_conversations c
  WHERE c.guest_user_id = v_guest_id
  ORDER BY c.last_message_at DESC NULLS LAST, c.created_at DESC
  LIMIT 1;

  IF v_conv_id IS NULL THEN
    RETURN json_build_object('conversation_id', NULL, 'messages', '[]'::json);
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
           'id', m.id,
           'role', m.role,
           'content', m.content,
           'created_at', m.created_at,
           'metadata', m.metadata,
           'rating', m.rating
         ) ORDER BY m.created_at, m.id), '[]'::json)
  INTO v_messages
  FROM (
    SELECT msg.id, msg.role, msg.content, msg.created_at, msg.metadata,
           (SELECT f.rating FROM public.ai_feedback f
             WHERE f.message_id = msg.id AND f.guest_user_id = v_guest_id
             ORDER BY f.created_at DESC LIMIT 1) AS rating
    FROM public.ai_messages msg
    WHERE msg.conversation_id = v_conv_id
    ORDER BY msg.created_at DESC, msg.id DESC
    LIMIT v_limit
  ) m;

  RETURN json_build_object('conversation_id', v_conv_id, 'messages', v_messages);
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. ai_feedback: pollice su/giù (+1 / -1) su un messaggio dell'assistente.
--    Sostituisce il feedback precedente dello stesso ospite sullo stesso messaggio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_feedback(
  p_token uuid,
  p_message_id uuid,
  p_rating int,
  p_comment text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_guest_id integer;
  v_conv_id uuid;
BEGIN
  v_guest_id := public.ai_resolve_guest(p_token);
  IF v_guest_id IS NULL THEN
    RAISE EXCEPTION 'Sessione non valida o scaduta' USING ERRCODE = '28000';
  END IF;
  IF p_rating NOT IN (-1, 1) THEN
    RAISE EXCEPTION 'Rating non valido (usa 1 o -1)' USING ERRCODE = '22023';
  END IF;

  SELECT m.conversation_id INTO v_conv_id
  FROM public.ai_messages m
  JOIN public.ai_conversations c ON c.id = m.conversation_id
  WHERE m.id = p_message_id AND c.guest_user_id = v_guest_id;

  IF v_conv_id IS NULL THEN
    RAISE EXCEPTION 'Messaggio non trovato' USING ERRCODE = 'P0002';
  END IF;

  DELETE FROM public.ai_feedback
  WHERE message_id = p_message_id AND guest_user_id = v_guest_id;

  INSERT INTO public.ai_feedback (message_id, conversation_id, guest_user_id, rating, comment)
  VALUES (p_message_id, v_conv_id, v_guest_id, p_rating, left(NULLIF(btrim(COALESCE(p_comment, '')), ''), 500));

  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Permessi RPC
-- ---------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.log_ai_message(uuid, uuid, text, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_ai_history(uuid, int)                  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_feedback(uuid, uuid, int, text)             TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. RLS sulle tabelle AI: gli ospiti passano SOLO dalle RPC; gli admin (is_admin())
--    leggono/scrivono tutto; la knowledge base attiva è leggibile da anon (la legge api/chat.js).
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_conversations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_actions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_knowledge_base ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_conversations_admin_all ON public.ai_conversations;
CREATE POLICY ai_conversations_admin_all ON public.ai_conversations
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ai_messages_admin_all ON public.ai_messages;
CREATE POLICY ai_messages_admin_all ON public.ai_messages
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ai_feedback_admin_all ON public.ai_feedback;
CREATE POLICY ai_feedback_admin_all ON public.ai_feedback
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ai_actions_admin_all ON public.ai_actions;
CREATE POLICY ai_actions_admin_all ON public.ai_actions
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS ai_kb_public_read_active ON public.ai_knowledge_base;
CREATE POLICY ai_kb_public_read_active ON public.ai_knowledge_base
  FOR SELECT TO anon, authenticated USING (is_active IS TRUE OR public.is_admin());

DROP POLICY IF EXISTS ai_kb_admin_write ON public.ai_knowledge_base;
CREATE POLICY ai_kb_admin_write ON public.ai_knowledge_base
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Ricarica lo schema di PostgREST così le nuove RPC sono subito visibili.
NOTIFY pgrst, 'reload schema';
