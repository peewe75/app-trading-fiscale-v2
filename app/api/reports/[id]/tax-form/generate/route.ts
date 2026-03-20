import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import {
  buildTaxFormControlPdfKey,
  buildTaxFormDraftKey,
  buildTaxFormFacsimilePdfKey,
  getTextBlob,
  saveTextBlob,
} from '@/lib/blobs'
import { getAuthorizedReportForCurrentUser, loadReportTaxContext, ReportAccessError } from '@/lib/report-tax-context'
import {
  createTaxFormPreview,
  createTaxFormPreviewRecord,
  parseTaxFormPreviewRecord,
} from '@/lib/tax-form-engine'
import { extractTaxProfileFromClerkUser } from '@/lib/tax-form-profile'
import type { TaxFormManualOverrides } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type TaxFormPayload = {
  report: {
    id: string
    filename: string
    year: number
    status: 'processing' | 'ready' | 'error'
    created_at?: string
  }
  preview: ReturnType<typeof createTaxFormPreview>
  savedAt: string | null
  generatedAt: string | null
  error?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let reportId = ''
  let stage = 'init'

  try {
    stage = 'resolve-params'
    const { id } = await params
    reportId = id
    stage = 'authorize-report'
    const report = await getAuthorizedReportForCurrentUser(id)

    if (report.status !== 'ready') {
      return NextResponse.json({ error: 'Il report deve essere pronto prima di generare RW/RT.' }, { status: 400 })
    }

    stage = 'load-context'
    const draftKey = buildTaxFormDraftKey(report.user_id, report.id)
    const [taxContext, user, rawRecord] = await Promise.all([
      loadReportTaxContext(report),
      currentUser(),
      getTextBlob(draftKey),
    ])

    const parsedRecord = parseTaxFormPreviewRecord(rawRecord)
    const body = (await req.json().catch(() => ({}))) as { manualOverrides?: TaxFormManualOverrides }
    const manualOverrides = body.manualOverrides ?? parsedRecord?.manualOverrides
    const basePreview = createTaxFormPreview({
      report: {
        id: report.id,
        filename: report.filename,
        year: report.year,
        status: report.status,
        created_at: report.created_at,
      },
      sourceHtml: taxContext.sourceHtml,
      results: taxContext.results,
      profile: extractTaxProfileFromClerkUser(user),
      manualOverrides,
      internalPdfAvailable: Boolean(parsedRecord?.internalPdfBlobKey),
      facsimilePdfAvailable: Boolean(parsedRecord?.facsimilePdfBlobKey),
    })

    if (basePreview.blocking_issues.length > 0) {
      const payload: TaxFormPayload = {
        report: basePreview.report,
        preview: basePreview,
        savedAt: parsedRecord?.savedAt ?? null,
        generatedAt: parsedRecord?.generatedAt ?? null,
        error: basePreview.blocking_issues.map(issue => issue.message).join(' '),
      }

      return NextResponse.json(payload, { status: 400 })
    }

    const controlPdfBlobKey = buildTaxFormControlPdfKey(report.user_id, report.id)
    const facsimilePdfBlobKey = buildTaxFormFacsimilePdfKey(report.user_id, report.id)
    stage = 'invoke-tax-form-background'
    await invokeTaxFormBackground(req, {
      preview: basePreview,
      controlPdfBlobKey,
      facsimilePdfBlobKey,
    })

    const generatedAt = new Date().toISOString()
    stage = 'refresh-preview'
    const preview = createTaxFormPreview({
      report: basePreview.report,
      sourceHtml: taxContext.sourceHtml,
      results: taxContext.results,
      profile: extractTaxProfileFromClerkUser(user),
      manualOverrides,
      internalPdfAvailable: true,
      facsimilePdfAvailable: true,
    })

    const record = createTaxFormPreviewRecord({
      reportId: report.id,
      preview,
      manualOverrides,
      generatedAt,
      internalPdfBlobKey: controlPdfBlobKey,
      facsimilePdfBlobKey: facsimilePdfBlobKey,
    })

    stage = 'save-preview-record'
    try {
      await saveTextBlob(draftKey, JSON.stringify(record, null, 2), 'application/json; charset=utf-8')
    } catch (recordError) {
      console.error('tax-form preview record save failed', {
        reportId,
        message: recordError instanceof Error ? recordError.message : 'Errore sconosciuto',
      })
    }

    const payload: TaxFormPayload = {
      report: preview.report,
      preview: record.preview,
      savedAt: record.savedAt,
      generatedAt: record.generatedAt,
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('tax-form generate failed', {
      reportId,
      stage,
      message: error instanceof Error ? error.message : 'Errore sconosciuto',
      stack: error instanceof Error ? error.stack : undefined,
    })

    if (error instanceof ReportAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    return NextResponse.json(
      { error: `Errore interno nella generazione del facsimile (${stage}).` },
      { status: 500 }
    )
  }
}

async function invokeTaxFormBackground(
  req: NextRequest,
  payload: {
    preview: ReturnType<typeof createTaxFormPreview>
    controlPdfBlobKey: string
    facsimilePdfBlobKey: string
  }
) {
  const appUrl = resolveAppUrl(req)
  if (!appUrl) {
    throw new Error('URL applicazione non disponibile')
  }

  const response = await fetch(`${appUrl}/api/calculate-background`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      mode: 'tax-form',
      ...payload,
    }),
    cache: 'no-store',
  })

  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null
    throw new Error(data?.error ?? `Tax-form background non riuscito (${response.status})`)
  }
}

function resolveAppUrl(req: NextRequest) {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.SITE_URL,
    req.nextUrl.origin,
  ]

  for (const candidate of candidates) {
    if (!candidate) continue

    try {
      return new URL(candidate).origin
    } catch {
      // Ignora valori non validi e continua con il prossimo fallback.
    }
  }

  return null
}
