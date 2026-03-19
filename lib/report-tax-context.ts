import { auth, currentUser } from '@clerk/nextjs/server'
import { buildUploadBlobKey, getTextBlob } from '@/lib/blobs'
import { calculateTax, parseHtmlReport, type ParsedBalance, type ParsedTrade, type TaxResults } from '@/lib/report-engine'
import { createSupabaseServiceClient } from '@/lib/supabase'

export class ReportAccessError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export type AccessibleReport = {
  id: string
  user_id: string
  filename: string
  blob_key: string
  status: 'processing' | 'ready' | 'error'
  year: number
  net_profit: number | null
  tax_due: number | null
  created_at: string
}

type ReportRow = AccessibleReport & {
  users?: { clerk_id?: string }[] | { clerk_id?: string } | null
}

export async function getAuthorizedReportForCurrentUser(reportId: string): Promise<AccessibleReport> {
  const [{ userId }, user] = await Promise.all([auth(), currentUser()])
  if (!userId) {
    throw new ReportAccessError('Non autenticato', 401)
  }

  const role = typeof user?.publicMetadata?.role === 'string' ? user.publicMetadata.role : null
  const isAdmin = role === 'admin'
  const supabase = createSupabaseServiceClient()
  const { data: report } = await supabase
    .from('reports')
    .select('id, user_id, filename, blob_key, status, year, net_profit, tax_due, created_at, users(clerk_id)')
    .eq('id', reportId)
    .single()

  const typedReport = report as ReportRow | null
  if (!typedReport) {
    throw new ReportAccessError('Report non trovato', 404)
  }

  const ownerClerkId = Array.isArray(typedReport.users) ? typedReport.users[0]?.clerk_id : typedReport.users?.clerk_id
  if (!isAdmin && ownerClerkId !== userId) {
    throw new ReportAccessError('Accesso negato', 403)
  }

  return {
    id: typedReport.id,
    user_id: typedReport.user_id,
    filename: typedReport.filename,
    blob_key: typedReport.blob_key,
    status: typedReport.status,
    year: typedReport.year,
    net_profit: typedReport.net_profit,
    tax_due: typedReport.tax_due,
    created_at: typedReport.created_at,
  }
}

export async function loadReportTaxContext(report: AccessibleReport): Promise<{
  sourceHtml: string
  trades: ParsedTrade[]
  balances: ParsedBalance[]
  results: TaxResults
}> {
  const sourceBlobKey = buildUploadBlobKey(report.user_id, report.id)
  const sourceHtml = await getTextBlob(sourceBlobKey)

  if (!sourceHtml) {
    throw new ReportAccessError('Sorgente report non trovata su Netlify Blobs', 404)
  }

  const { trades, balances } = parseHtmlReport(sourceHtml)

  return {
    sourceHtml,
    trades,
    balances,
    results: calculateTax(trades, balances, report.year),
  }
}
