-- Schema Supabase per App Trading Fiscale
-- Esegui questo SQL nella SQL Editor del progetto Supabase scelto.
-- Pensato per integrazione diretta Clerk -> Supabase tramite token di sessione.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id TEXT UNIQUE NOT NULL,
  email TEXT NOT NULL,
  plan TEXT CHECK (plan IN ('base', 'standard', 'pro')),
  reports_used INT NOT NULL DEFAULT 0 CHECK (reports_used >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  blob_key TEXT NOT NULL DEFAULT '',
  plan TEXT NOT NULL CHECK (plan IN ('base', 'standard', 'pro')),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'ready', 'error')),
  year INT NOT NULL,
  net_profit NUMERIC(12, 2),
  tax_due NUMERIC(12, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_session_id TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id TEXT,
  plan TEXT NOT NULL CHECK (plan IN ('base', 'standard', 'pro')),
  amount_cents INT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  visible BOOLEAN NOT NULL DEFAULT TRUE,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_clerk_id_idx ON users (clerk_id);
CREATE INDEX IF NOT EXISTS reports_user_year_idx ON reports (user_id, year);
CREATE INDEX IF NOT EXISTS reports_created_at_idx ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS payments_user_created_at_idx ON payments (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS news_visible_published_at_idx ON news (visible, published_at DESC);

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own ON users;
CREATE POLICY users_select_own
ON users
FOR SELECT
TO authenticated
USING (clerk_id = auth.jwt()->>'sub');

DROP POLICY IF EXISTS reports_select_own ON reports;
CREATE POLICY reports_select_own
ON reports
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = reports.user_id
      AND users.clerk_id = auth.jwt()->>'sub'
  )
);

DROP POLICY IF EXISTS payments_select_own ON payments;
CREATE POLICY payments_select_own
ON payments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM users
    WHERE users.id = payments.user_id
      AND users.clerk_id = auth.jwt()->>'sub'
  )
);

DROP POLICY IF EXISTS news_select_visible ON news;
CREATE POLICY news_select_visible
ON news
FOR SELECT
TO authenticated
USING (visible = TRUE);
