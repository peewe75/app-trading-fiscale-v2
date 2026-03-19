import { NextRequest, NextResponse } from 'next/server'
import {
  buildTaxFormDraftKey,
  buildTaxFormPdfKey,
  saveBlob,
  saveTextBlob,
} from '@/lib/blobs'
import { getAuthorizedReportForCurrentUser, loadReportTaxContext, ReportAccessError } from '@/lib/report-tax-context'
import {
  computeTaxFormSummary,
  createTaxFormDraftRecord,
  generateTaxFormPdf,
  normalizeTaxFormInput,
  validateTaxFormInput,
} from '@/lib/tax-form-engine'
import type { TaxFormDraftInput } from '@/types'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const report = await getAuthorizedReportForCurrentUser(id)

    if (report.status !== 'ready') {
      return NextResponse.json({ error: 'Il report deve essere pronto prima di generare RW/RT.' }, { status: 400 })
    }

    const body = (await req.json()) as { input?: Partial<TaxFormDraftInput>; userName?: string | null }
    const { results } = await loadReportTaxContext(report)
    const input = normalizeTaxFormInput(body.input, report.year)
    const errors = validateTaxFormInput(input, report.year)

    if (errors.length) {
      return NextResponse.json({ error: errors.join(' ') }, { status: 400 })
    }

    const summary = computeTaxFormSummary(results, input)
    const pdfKey = buildTaxFormPdfKey(report.user_id, report.id)
    const pdf = await generateTaxFormPdf({
      input,
      summary,
      meta: {
        reportId: report.id,
        filename: report.filename,
        userName: body.userName?.trim() || 'Utente registrato',
      },
    })

    await saveBlob(pdfKey, pdf)

    const record = createTaxFormDraftRecord({
      reportId: report.id,
      input,
      summary,
      generatedPdfBlobKey: pdfKey,
    })

    const draftKey = buildTaxFormDraftKey(report.user_id, report.id)
    await saveTextBlob(draftKey, JSON.stringify(record, null, 2), 'application/json; charset=utf-8')

    return NextResponse.json({
      report: {
        id: report.id,
        filename: report.filename,
        year: report.year,
        status: report.status,
      },
      input: record.input,
      summary: record.summary,
      savedAt: record.savedAt,
      generatedPdfAvailable: true,
      downloadUrl: `/api/reports/${report.id}/tax-form/download`,
    })
  } catch (error) {
    if (error instanceof ReportAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    return NextResponse.json({ error: 'Errore interno nella generazione del facsimile.' }, { status: 500 })
  }
}
