import { NextRequest, NextResponse } from 'next/server'
import { buildTaxFormControlPdfKey, getBlob } from '@/lib/blobs'
import { getAuthorizedReportForCurrentUser, ReportAccessError } from '@/lib/report-tax-context'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const report = await getAuthorizedReportForCurrentUser(id)

    if (report.status !== 'ready') {
      return NextResponse.json({ error: 'Il report deve essere pronto prima del download RW/RT.' }, { status: 400 })
    }

    const blobKey = buildTaxFormControlPdfKey(report.user_id, report.id)
    const pdfBuffer = await getBlob(blobKey)

    if (!pdfBuffer) {
      return NextResponse.json({ error: 'PDF di controllo RW/RT non ancora generato.' }, { status: 404 })
    }

    return new NextResponse(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="controllo-rw-rt-${report.year}-${report.id}.pdf"`,
      },
    })
  } catch (error) {
    if (error instanceof ReportAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }

    return NextResponse.json({ error: 'Errore interno nel download del PDF di controllo.' }, { status: 500 })
  }
}
