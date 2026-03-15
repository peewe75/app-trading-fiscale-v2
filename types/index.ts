export type Plan = 'base' | 'standard' | 'pro'

export interface UserRecord {
  id: string
  clerk_id: string
  email: string
  plan: Plan | null
  reports_used: number
  created_at: string
}

export interface Report {
  id: string
  user_id: string
  filename: string
  blob_key: string
  plan: Plan
  status: 'processing' | 'ready' | 'error'
  year: number
  net_profit: number | null
  tax_due: number | null
  created_at: string
}

export interface Payment {
  id: string
  user_id: string
  stripe_payment_intent_id: string
  stripe_session_id: string
  plan: Plan
  amount_cents: number
  status: 'pending' | 'succeeded' | 'failed'
  created_at: string
}

export interface NewsItem {
  id: string
  title: string
  content: string
  visible: boolean
  published_at: string
  created_at: string
}
