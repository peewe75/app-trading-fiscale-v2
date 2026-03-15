# App Trading Fiscale v2

Stack: **Next.js 15** · **Clerk** · **Supabase** · **Stripe** · **Netlify Blobs**

## Setup in 5 passi

### 1. Clona e installa
```bash
git clone <repo>
cd app-trading-v2
npm install
cp .env.example .env.local
```

### 2. Configura i servizi
| Servizio | Cosa fare |
|----------|-----------|
| **Clerk** | Crea app su clerk.com → copia Publishable Key e Secret Key |
| **Supabase** | Crea progetto → esegui `lib/supabase-schema.sql` → copia URL e chiavi |
| **Stripe** | Crea 3 Price (Base/Standard/Pro) one-time → copia i Price ID → configura webhook verso `/api/webhooks/stripe` |
| **Netlify** | Collega repo GitHub → deploy automatico → Blobs attivi automaticamente |

### 3. Imposta ruolo admin su Clerk
Nel dashboard Clerk → Users → seleziona il tuo utente → Public Metadata:
```json
{ "role": "admin" }
```

### 4. Configura variabili d'ambiente su Netlify
Copia tutte le variabili da `.env.example` nella sezione Environment Variables di Netlify.

### 5. Deploy
```bash
git push origin main  # Netlify deploya automaticamente
```

## Struttura
```
app/
  (auth)/          → Sign-in / Sign-up (Clerk)
  (dashboard)/     → Area utente protetta (richiede pagamento)
    upload/        → Carica file broker
    reports/       → Storico report
    news/          → News normative
  (admin)/         → Area admin (ruolo Clerk)
  checkout/        → Pagamento Stripe one-time
  api/
    webhooks/stripe/ → Webhook pagamento
    upload/          → Elaborazione file
    reports/[id]/    → Download PDF
    news/            → CRUD news (admin)
netlify/functions/
  calculate/       → Motore Python: parsing + calcolo + PDF
lib/
  supabase.ts      → Client DB
  stripe.ts        → Checkout session
  blobs.ts         → Storage PDF
  supabase-schema.sql → Schema DB
```
