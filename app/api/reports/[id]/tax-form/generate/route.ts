import { NextRequest, NextResponse } from 'next/server'
import { currentUser } from '@clerk/nextjs/server'
import {
  buildTaxFormControlPdfKey,
  buildTaxFormDraftKey,
  buildTaxFormFacsimilePdfKey,
  getTextBlob,
  saveBlob,
  saveTextBlob,
} from '@/lib/blobs'
import { getAuthorizedReportForCurrentUser, loadReportTaxContext, ReportAccessError } from '@/lib/report-tax-context'
import {
  createTaxFormPreview,
  createTaxFormPreviewRecord,
  generateTaxFormPdf,
  parseTaxFormPreviewRecord,
} from '@/lib/tax-form-engine'
import { extractTaxProfileFromClerkUser } from '@/lib/tax-form-profile'

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
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const report = await getAuthorizedReportForCurrentUser(id)

    if (report.status !== 'ready') {
      return NextResponse.json({ error: 'Il report deve essere pronto prima di generare RW/RT.' }, { status: 400 })
    }

    const draftKey = buildTaxFormDraftKey(report.user_id, report.id)
    const [taxContext, user, rawRecord] = await Promise.all([
      loadReportTaxContext(report),
      currentUser(),
      getTextBlob(draftKey),
    ])

    const parsedRecord = parseTaxFormPreviewRecord(rawRecord)
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

    const [controlPdf, facsimilePdf] = await Promise.all([
      generateTaxFormPdf({ preview: basePreview, kind: 'control' }),
      generateTaxFormPdf({ preview: basePreview, kind: 'facsimile' }),
    ])

    const controlPdfBlobKey = buildTaxFormControlPdfKey(report.user_id, report.id)
    const facsimilePdfBlobKey = buildTaxFormFacsimilePdfKey(report.user_id, report.id)
    await Promise.all([
      saveBlob(controlPdfBlobKey, controlPdf),
      saveBlob(facsimilePdfBlobKey, facsimilePdf),
    ])

    const generatedAt = new Date().toISOString()
    const preview = createTaxFormPreview({
      report: basePreview.report,
      sourceHtml: taxContext.sourceHtml,
      results: taxContext.results,
      profile: extractTaxProfileFromClerkUser(user),
      internalPdfAvailable: true,
      facsimilePdfAvailable: true,
    })

    const record = createTaxFormPreviewRecord({
      reportId: report.id,
      preview,
      generatedAt,
      internalPdfBlobKey: controlPdfBlobKey,
      facsimilePdfBlobKey: facsimilePdfBlobKey,
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

    return NextResponse.json({ error: 'Errore interno nella generazione del facsimile.' }, { status: 500 })
  }
}
