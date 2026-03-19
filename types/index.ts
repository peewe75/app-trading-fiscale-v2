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

export interface TaxFormDraftInput {
  taxCode: string
  brokerName: string
  brokerCountryCode: string
  rwOwnerCode: string
  rwAssetCode: string
  rwPossessionDays: number | null
  rwInitialValueEur: number | null
  rwFinalValueEur: number | null
  rwMaxValueEur: number | null
  rwIvafeOverrideEur: number | null
  rtPriorLossesEur: number | null
  notes: string
}

export interface TaxFormComputedSummary {
  year: number
  corrispettivo: number
  costo: number
  rt23TotalCorrispettivi: number
  rt24TotalCosti: number
  rt25Plusvalenze: number
  rt26MinusvalenzeCompensate: number
  rt27ImponibileNetto: number
  rtTaxDue: number
  rwInitialValueEur: number
  rwFinalValueEur: number
  rwMaxValueEur: number
  rwPossessionDays: number
  rwIvafeDueEur: number
}

export interface TaxFormDraftRecord {
  reportId: string
  input: TaxFormDraftInput
  summary: TaxFormComputedSummary
  savedAt: string
  generatedPdfBlobKey: string | null
}
