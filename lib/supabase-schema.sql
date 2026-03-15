-- Schema Supabase per App Trading Fiscale
-- Esegui questo SQL nella Supabase SQL Editor

-- ── Utenti ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id    TEXT UNIQUE NOT NULL,
  email       TEXT NOT NULL,
  plan        TEXT CHECK (plan IN ('base', 'standard', 'pro')),
  reports_used INT DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Report ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  blob_key    TEXT NOT NULL DEFAULT '',
  plan        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'processing'
              CHECK (status IN ('processing', 'ready', 'error')),
  year        INT NOT NULL,
  net_profit  NUMERIC(12, 2),
  tax_due     NUMERIC(12, 2),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── Pagamenti ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                   UUID REFERENCES users(id) ON DELETE SET NULL,
  stripe_session_id         TEXT UNIQUE NOT NULL,
  stripe_payment_intent_id  TEXT,
  plan                      TEXT NOT NULL,
  amount_cents              INT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'succeeded', 'failed')),
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

-- ── News ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS news (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title         TEXT NOT NULL,
  content       TEXT NOT NULL,
  visible       BOOLEAN DEFAULT TRUE,
  published_at  TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── RLS (Row Level Security) ──────────────────────────────────────────────────
-- Ogni utente vede solo i propri dati; service_role bypassa tutto

ALTER TABLE users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE news    ENABLE ROW LEVEL SECURITY;

-- News: visibile a tutti gli autenticati
CREATE POLICY "news_select" ON news FOR SELECT USING (visible = TRUE);

-- Reports: solo il proprietario può vedere i propri report
-- (la colonna clerk_id viene passata via JWT claim in produzione)
