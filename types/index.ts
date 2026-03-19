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

export type TaxFormFieldSource = 'html' | 'profile' | 'mapping' | 'manual' | 'derived' | 'fallback'

export interface TaxFormManualOverrides {
  ownerName?: string | null
  taxCode?: string | null
  brokerName?: string | null
  brokerCountryCode?: string | null
}

export interface TaxFormWarning {
  code: string
  message: string
  field?: string
  source?: TaxFormFieldSource
}

export interface TaxFormBlockingIssue {
  code: string
  message: string
}

export interface TaxFormAccountExtraction {
  ownerName: string | null
  taxCode: string | null
  accountId: string | null
  accountLabel: string | null
  brokerName: string | null
  companyName: string | null
  brokerCountryCode: string | null
  currency: string | null
  isCentAccount: boolean
  scaleFactor: number
  timelineMethod: 'deal-balance' | 'event-rebuild' | 'unavailable'
  firstActivityAt: string | null
  lastActivityAt: string | null
}

export interface TaxFormRtSummary {
  year: number
  corrispettivo: number
  costo: number
  rt23TotalCorrispettivi: number
  rt24TotalCosti: number
  rt25Plusvalenze: number
  rt26MinusvalenzeCompensate: number
  rt27ImponibileNetto: number
  rtTaxDue: number
}

export interface TaxFormRwSummary {
  rwInitialValueEur: number
  rwFinalValueEur: number
  rwMaxValueEur: number
  rwPossessionDays: number
  rwIvafeDueEur: number
  rwOwnerCode: string
  rwAssetCode: string
  brokerCountryCode: string | null
}

export interface TaxFormPreview {
  report: {
    id: string
    filename: string
    year: number
    status: 'processing' | 'ready' | 'error'
    created_at?: string
  }
  account_extraction: TaxFormAccountExtraction
  rt_summary: TaxFormRtSummary
  rw_summary: TaxFormRwSummary
  field_sources: Record<string, TaxFormFieldSource>
  warnings: TaxFormWarning[]
  blocking_issues: TaxFormBlockingIssue[]
  disclaimers: string[]
  can_generate_internal_pdf: boolean
  can_generate_facsimile_pdf: boolean
  internal_pdf_available: boolean
  facsimile_pdf_available: boolean
  internal_download_url: string
  facsimile_download_url: string
  manual_overrides: TaxFormManualOverrides
}

export interface TaxFormPreviewRecord {
  reportId: string
  preview: TaxFormPreview
  manualOverrides: TaxFormManualOverrides
  savedAt: string
  generatedAt: string | null
  internalPdfBlobKey: string | null
  facsimilePdfBlobKey: string | null
}
