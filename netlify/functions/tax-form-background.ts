import { saveBlob } from '../../lib/blobs'
import { generateTaxFormPdf } from '../../lib/tax-form-engine'
import type { TaxFormPreview } from '../../types'

export const config = {
  path: '/api/tax-form-background',
}

const handler = async (request: Request) => {
  let stage = 'init'

  try {
    const secret = process.env.INTERNAL_CALLBACK_SECRET
    const receivedSecret = request.headers.get('x-internal-secret')

    if (secret && receivedSecret !== secret) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    stage = 'read-body'
    const body = (await request.json()) as {
      preview?: TaxFormPreview
      controlPdfBlobKey?: string
      facsimilePdfBlobKey?: string
    }

    if (!body.preview || !body.controlPdfBlobKey || !body.facsimilePdfBlobKey) {
      return Response.json({ error: 'Payload incompleto per la generazione RW/RT' }, { status: 400 })
    }

    stage = 'generate-control-pdf'
    const controlPdf = await generateTaxFormPdf({ preview: body.preview, kind: 'control' })
    stage = 'save-control-pdf'
    await saveBlob(body.controlPdfBlobKey, controlPdf)

    stage = 'generate-facsimile-pdf'
    const facsimilePdf = await generateTaxFormPdf({ preview: body.preview, kind: 'facsimile' })
    stage = 'save-facsimile-pdf'
    await saveBlob(body.facsimilePdfBlobKey, facsimilePdf)

    return Response.json({
      success: true,
      controlPdfBlobKey: body.controlPdfBlobKey,
      facsimilePdfBlobKey: body.facsimilePdfBlobKey,
    })
  } catch (error) {
    console.error('tax-form-background failed', {
      stage,
      message: error instanceof Error ? error.message : 'Errore sconosciuto',
      stack: error instanceof Error ? error.stack : undefined,
    })

    return Response.json(
      {
        error: error instanceof Error ? `${error.message} (${stage})` : `Errore sconosciuto (${stage})`,
      },
      { status: 500 }
    )
  }
}

export default handler
