import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import { buildTaxFormDraftKey, getTextBlob, saveTextBlob } from '@/lib/blobs'
import { getAuthorizedReportForCurrentUser, loadReportTaxContext, ReportAccessError } from '@/lib/report-tax-context'
import { createTaxFormPreview, createTaxFormPreviewRecord, parseTaxFormPreviewRecord } from '@/lib/tax-form-engine'
import { extractTaxProfileFromClerkUser } from '@/lib/tax-form-profile'
import type { TaxFormManualOverrides } from '@/types'

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
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const report = await getAuthorizedReportForCurrentUser(id)

    if (report.status !== 'ready') {
      return NextResponse.json({ error: 'Il report deve essere pronto prima di preparare RW/RT.' }, { status: 400 })
    }

    const [taxContext, user, rawRecord] = await Promise.all([
      loadReportTaxContext(report),
      currentUser(),
      getTextBlob(buildTaxFormDraftKey(report.user_id, report.id)),
    ])

    const parsedRecord = parseTaxFormPreviewRecord(rawRecord)
    const preview = createTaxFormPreview({
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
      manualOverrides: parsedRecord?.manualOverrides,
      internalPdfAvailable: Boolean(parsedRecord?.internalPdfBlobKey),
      facsimilePdfAvailable: Boolean(parsedRecord?.facsimilePdfBlobKey),
    })

    const payload: TaxFormPayload = {
      report: preview.report,
      preview,
      savedAt: parsedRecord?.savedAt ?? null,
      generatedAt: parsedRecord?.generatedAt ?? null,
    }

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof ReportAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    return NextResponse.json({ error: 'Errore interno nel caricamento del facsimile.' }, { status: 500 })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const report = await getAuthorizedReportForCurrentUser(id)

    if (report.status !== 'ready') {
      return NextResponse.json({ error: 'Il report deve essere pronto prima di rigenerare RW/RT.' }, { status: 400 })
    }

    const draftKey = buildTaxFormDraftKey(report.user_id, report.id)
    const [taxContext, user, rawRecord] = await Promise.all([
      loadReportTaxContext(report),
      currentUser(),
      getTextBlob(draftKey),
    ])

    const parsedRecord = parseTaxFormPreviewRecord(rawRecord)
    const body = (await req.json().catch(() => ({}))) as { manualOverrides?: TaxFormManualOverrides }
    const manualOverrides = body.manualOverrides ?? parsedRecord?.manualOverrides
    const preview = createTaxFormPreview({
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

    const record = createTaxFormPreviewRecord({
      reportId: report.id,
      preview,
      manualOverrides,
      generatedAt: parsedRecord?.generatedAt ?? null,
      internalPdfBlobKey: parsedRecord?.internalPdfBlobKey ?? null,
      facsimilePdfBlobKey: parsedRecord?.facsimilePdfBlobKey ?? null,
    })

    await saveTextBlob(draftKey, JSON.stringify(record, null, 2), 'application/json; charset=utf-8')

    const payload: TaxFormPayload = {
      report: preview.report,
      preview: record.preview,
      savedAt: record.savedAt,
      generatedAt: record.generatedAt,
    }

    return NextResponse.json(payload)
  } catch (error) {
    if (error instanceof ReportAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    return NextResponse.json({ error: 'Errore interno nel refresh del facsimile.' }, { status: 500 })
  }
}
