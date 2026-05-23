-- =====================================================
-- GUESTOS — DATABASE SETUP (Supabase)
-- =====================================================
-- Esegui QUESTO SQL una sola volta in Supabase Studio
-- (Database → SQL Editor → New Query → incolla → Run).
--
-- Cosa fa:
--   1. Crea un TRIGGER su `users` che auto-crea il record `user_points`
--      ogni volta che un ospite si registra (evita il bug "punti persi").
--   2. Esegue il BACKFILL per gli utenti esistenti che non hanno ancora
--      un record in user_points (oggi ~50% degli utenti).
-- =====================================================

-- 1) Funzione che crea il record user_points per il nuovo utente
CREATE OR REPLACE FUNCTION create_user_points_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_points (user_email, user_name, points, level, badges, total_bookings, created_at, updated_at)
  VALUES (
    NEW.email,
    NEW.last_name,
    0,
    1,
    '[]'::jsonb,
    0,
    NOW(),
    NOW()
  )
  ON CONFLICT (user_email) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2) Trigger collegato alla tabella users
DROP TRIGGER IF EXISTS user_points_auto_create ON users;
CREATE TRIGGER user_points_auto_create
AFTER INSERT ON users
FOR EACH ROW
EXECUTE FUNCTION create_user_points_on_signup();

-- 3) BACKFILL: crea il record user_points per chi non ce l'ha
-- (lo facciamo come SECURITY DEFINER nel contesto del trigger function:
--  qui è sufficiente eseguire l'INSERT in Studio con i tuoi permessi)
INSERT INTO user_points (user_email, user_name, points, level, badges, total_bookings, created_at, updated_at)
SELECT
  u.email,
  COALESCE(u.last_name, 'Ospite'),
  0,
  1,
  '[]'::jsonb,
  0,
  NOW(),
  NOW()
FROM users u
LEFT JOIN user_points up ON up.user_email = u.email
WHERE up.user_email IS NULL
  AND u.email IS NOT NULL;

-- 4) Sanity check (commenta dopo verifica)
SELECT
  (SELECT COUNT(*) FROM users WHERE email IS NOT NULL) AS users_with_email,
  (SELECT COUNT(*) FROM user_points) AS user_points_rows,
  (SELECT COUNT(*) FROM users u
     LEFT JOIN user_points up ON up.user_email = u.email
     WHERE up.user_email IS NULL AND u.email IS NOT NULL) AS users_without_points_row;
-- Dopo aver eseguito: users_with_email DEVE essere = user_points_rows,
-- e users_without_points_row DEVE essere = 0.
