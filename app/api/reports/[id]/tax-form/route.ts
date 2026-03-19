import { NextRequest, NextResponse } from 'next/server'
import {
  buildTaxFormDraftKey,
  buildTaxFormPdfKey,
  getTextBlob,
  saveTextBlob,
} from '@/lib/blobs'
import { getAuthorizedReportForCurrentUser, loadReportTaxContext, ReportAccessError } from '@/lib/report-tax-context'
import {
  computeTaxFormSummary,
  createDefaultTaxFormInput,
  createTaxFormDraftRecord,
  normalizeTaxFormInput,
  parseTaxFormDraftRecord,
} from '@/lib/tax-form-engine'
import type { TaxFormDraftInput } from '@/types'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const report = await getAuthorizedReportForCurrentUser(id)

    if (report.status !== 'ready') {
      return NextResponse.json({ error: 'Il report deve essere pronto prima di generare RW/RT.' }, { status: 400 })
    }

    const { results } = await loadReportTaxContext(report)
    const draftKey = buildTaxFormDraftKey(report.user_id, report.id)
    const rawDraft = await getTextBlob(draftKey)
    const parsedDraft = parseTaxFormDraftRecord(rawDraft, report.year)
    const input = parsedDraft?.input ?? createDefaultTaxFormInput(report.year)
    const summary = computeTaxFormSummary(results, input)

    return NextResponse.json({
      report: {
        id: report.id,
        filename: report.filename,
        year: report.year,
        status: report.status,
        created_at: report.created_at,
      },
      input,
      summary,
      savedAt: parsedDraft?.savedAt ?? null,
      generatedPdfAvailable: Boolean(parsedDraft?.generatedPdfBlobKey),
    })
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
      return NextResponse.json({ error: 'Il report deve essere pronto prima di salvare il facsimile.' }, { status: 400 })
    }

    const body = (await req.json()) as { input?: Partial<TaxFormDraftInput> }
    const { results } = await loadReportTaxContext(report)
    const draftKey = buildTaxFormDraftKey(report.user_id, report.id)
    const rawDraft = await getTextBlob(draftKey)
    const parsedDraft = parseTaxFormDraftRecord(rawDraft, report.year)
    const input = normalizeTaxFormInput(body.input ?? parsedDraft?.input, report.year)
    const summary = computeTaxFormSummary(results, input)
    const pdfKey = parsedDraft?.generatedPdfBlobKey ?? buildTaxFormPdfKey(report.user_id, report.id)
    const record = createTaxFormDraftRecord({
      reportId: report.id,
      input,
      summary,
      generatedPdfBlobKey: parsedDraft?.generatedPdfBlobKey ? pdfKey : null,
    })

    await saveTextBlob(draftKey, JSON.stringify(record, null, 2), 'application/json; charset=utf-8')

    return NextResponse.json({
      report: {
        id: report.id,
        filename: report.filename,
        year: report.year,
        status: report.status,
        created_at: report.created_at,
      },
      input: record.input,
      summary: record.summary,
      savedAt: record.savedAt,
      generatedPdfAvailable: Boolean(record.generatedPdfBlobKey),
    })
  } catch (error) {
    if (error instanceof ReportAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    return NextResponse.json({ error: 'Errore interno nel salvataggio del facsimile.' }, { status: 500 })
  }
}
