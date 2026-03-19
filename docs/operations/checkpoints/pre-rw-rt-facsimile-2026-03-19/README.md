# Checkpoint `pre-rw-rt-facsimile-2026-03-19`

Checkpoint operativo creato prima di iniziare il lavoro sui facsimili ufficiali `RW` e `RT`.

## Identificativi

- Repo remoto: `https://github.com/peewe75/app-trading-fiscale-v2.git`
- Commit applicativo di rollback esatto: `195108ab7d0e66039954c34110014207d65e5dbe`
- Commit short: `195108a`
- Tag di rollback esatto: `pre-rw-rt-facsimile-2026-03-19`
- Branch operativo di checkpoint: `codex/pre-rw-rt-facsimile`
- Snapshot captured at UTC: `2026-03-19T14:04:26.9296947Z`

## Deploy Netlify di riferimento

- Site URL: `https://app-trading-fiscale-v2.netlify.app`
- Deploy URL esatto del commit di rollback: `https://69bbf27e4c1cd40008167894--app-trading-fiscale-v2.netlify.app`
- Deploy dashboard URL: `https://app.netlify.com/projects/app-trading-fiscale-v2/deploys/69bbf27e4c1cd40008167894`
- Deploy ID: `69bbf27e4c1cd40008167894`
- Branch pubblicato: `main`
- Commit pubblicato su Netlify: `195108a`

## Supabase di riferimento

- Project ref: `xxaeefqcvjnuugtasciq`
- Project URL: `https://xxaeefqcvjnuugtasciq.supabase.co`
- Dashboard URL: `https://supabase.com/dashboard/project/xxaeefqcvjnuugtasciq`
- Schema snapshot: [`supabase-schema.snapshot.sql`](/Users/avvsa/OneDrive%20-%20AVVOCATO%20SAPONE/Desktop/Siti/APP/Varie/app-trading-v2/docs/operations/checkpoints/pre-rw-rt-facsimile-2026-03-19/supabase-schema.snapshot.sql)
- Data snapshot: [`supabase-data.snapshot.json`](/Users/avvsa/OneDrive%20-%20AVVOCATO%20SAPONE/Desktop/Siti/APP/Varie/app-trading-v2/docs/operations/checkpoints/pre-rw-rt-facsimile-2026-03-19/supabase-data.snapshot.json)

## Variabili ambiente attese

Valori non versionati. Questo checkpoint inventaria solo i nomi richiesti.

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_BASE`
- `STRIPE_PRICE_STANDARD`
- `STRIPE_PRICE_PRO`
- `ENABLE_TEST_PLAN_BYPASS`
- `NETLIFY_SITE_ID`
- `NETLIFY_AUTH_TOKEN`
- `INTERNAL_CALLBACK_SECRET`

## Verifiche eseguite sul commit di rollback

- `npm run build` passato
- `npm run lint` passato
- Deploy URL Netlify del commit `195108a` raggiungibile
- Prova di ripristino eseguita in worktree separato sul tag `pre-rw-rt-facsimile-2026-03-19`
  - `npm ci` passato
  - `npm run lint` passato
  - `npm run build` passato

## Procedura di ripristino

### Codice

```bash
git fetch origin --tags
git checkout pre-rw-rt-facsimile-2026-03-19
npm install
npm run lint
npm run build
```

### Deploy

- Opzione rapida: riaprire il deploy `69bbf27e4c1cd40008167894` in Netlify e promuoverlo o ridistribuirlo come riferimento.
- Opzione Git: ripubblicare il commit `195108ab7d0e66039954c34110014207d65e5dbe`.

### Database

- Reapplicare lo schema da [`supabase-schema.snapshot.sql`](/Users/avvsa/OneDrive%20-%20AVVOCATO%20SAPONE/Desktop/Siti/APP/Varie/app-trading-v2/docs/operations/checkpoints/pre-rw-rt-facsimile-2026-03-19/supabase-schema.snapshot.sql) se serve riallineare la struttura.
- Usare [`supabase-data.snapshot.json`](/Users/avvsa/OneDrive%20-%20AVVOCATO%20SAPONE/Desktop/Siti/APP/Varie/app-trading-v2/docs/operations/checkpoints/pre-rw-rt-facsimile-2026-03-19/supabase-data.snapshot.json) come snapshot dei contenuti minimi applicativi presenti al momento del checkpoint.

## Note operative

- `main` non viene alterato da questo checkpoint.
- Il rollback esatto dell'applicazione è il tag `pre-rw-rt-facsimile-2026-03-19`.
- Questo branch contiene solo documentazione e snapshot di supporto al rollback.
- Sono presenti file temporanei locali `tmp-*` non tracciati, esclusi dal checkpoint Git e irrilevanti per il ripristino.
