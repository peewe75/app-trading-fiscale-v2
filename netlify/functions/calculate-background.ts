import { calculateTax, generateReportPdf, parseHtmlReport } from '../../lib/report-engine'
import { getTextBlob, saveBlob } from '../../lib/blobs'
import { generateTaxFormPdf } from '../../lib/tax-form-engine'

export const config = {
  path: '/api/calculate-background',
}

const handler = async (request: Request) => {
  let reportId = ''
  let stage = 'init'
  const requestOrigin = new URL(request.url).origin

  try {
    stage = 'read-body'
    const body = (await request.json()) as {
      mode?: string
      preview?: unknown
      controlPdfBlobKey?: string
      facsimilePdfBlobKey?: string
      html?: string
      htmlBlobKey?: string
      year?: number
      reportId?: string
      userId?: string
      userName?: string
      userEmail?: string
      taxCode?: string
    }

    if (body.mode === 'tax-form') {
      stage = 'validate-tax-form-payload'
      const preview = body.preview
      const controlPdfBlobKey = body.controlPdfBlobKey ?? ''
      const facsimilePdfBlobKey = body.facsimilePdfBlobKey ?? ''

      if (!preview || !controlPdfBlobKey || !facsimilePdfBlobKey) {
        return Response.json({ error: 'Payload tax-form incompleto' }, { status: 400 })
      }

      stage = 'generate-tax-form-control'
      const controlPdf = await generateTaxFormPdf({ preview: preview as never, kind: 'control' })
      stage = 'save-tax-form-control'
      await saveBlob(controlPdfBlobKey, controlPdf)

      stage = 'generate-tax-form-facsimile'
      const facsimilePdf = await generateTaxFormPdf({ preview: preview as never, kind: 'facsimile' })
      stage = 'save-tax-form-facsimile'
      await saveBlob(facsimilePdfBlobKey, facsimilePdf)

      return Response.json(
        {
          success: true,
          controlPdfBlobKey,
          facsimilePdfBlobKey,
        },
        { status: 200 }
      )
    }

    stage = 'load-source'
    const htmlContent = body.htmlBlobKey
      ? await getTextBlob(body.htmlBlobKey)
      : body.html ?? ''
    const year = Number(body.year ?? new Date().getUTCFullYear() - 1)
    reportId = body.reportId ?? ''
    const userId = body.userId ?? ''
    const userName = body.userName ?? body.userEmail ?? 'Utente registrato'
    const taxCode = body.taxCode

    if (!htmlContent) {
      return Response.json({ error: 'HTML mancante' }, { status: 400 })
    }

    const blobKey = `reports/${userId}/${reportId}.pdf`
    const response = Response.json(
      {
        success: true,
        reportId,
        blobKey,
        status: 'processing',
      },
      { status: 202 }
    )

    await response.clone().text()

    stage = 'parse-report'
    const { trades, balances } = parseHtmlReport(htmlContent)
    stage = 'calculate-tax'
    const results = calculateTax(trades, balances, year)
    stage = 'generate-pdf'
    const pdfBytes = await generateReportPdf({
      results,
      trades,
      balances,
      userName,
      taxCode,
    })
    stage = 'upload-pdf'
    await saveBlob(blobKey, pdfBytes)
    stage = 'notify-ready'
    await notifyCompletion(reportId, {
      blob_key: blobKey,
      net_profit: results.netProfit,
      tax_due: results.taxDue,
      status: 'ready',
    }, requestOrigin)

    return response
  } catch (error) {
    console.error('calculate-background failed', {
      reportId,
      stage,
      message: error instanceof Error ? error.message : 'Errore sconosciuto',
      stack: error instanceof Error ? error.stack : undefined,
    })

    if (reportId) {
      try {
        await notifyCompletion(reportId, { status: 'error' }, requestOrigin)
      } catch {
        // Evita di perdere l errore originario se anche il callback di fallback fallisce.
      }
    }

    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      },
      { status: 500 }
    )
  }
}

export default handler

async function notifyCompletion(
  reportId: string,
  payload: {
    blob_key?: string
    net_profit?: number
    tax_due?: number
    status: 'ready' | 'error' | 'processing'
  },
  requestOrigin?: string
) {
  const appUrl = resolveAppUrl(requestOrigin)
  const secret = process.env.INTERNAL_CALLBACK_SECRET

  if (!appUrl || !secret) {
    throw new Error('URL applicazione o INTERNAL_CALLBACK_SECRET mancanti')
  }

  const response = await fetch(`${appUrl}/api/reports/${encodeURIComponent(reportId)}/complete`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': secret,
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    throw new Error(`Callback interno report non riuscito (${response.status})`)
  }
}

function resolveAppUrl(requestOrigin?: string) {
  const candidates = [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.URL,
    process.env.DEPLOY_PRIME_URL,
    process.env.SITE_URL,
    requestOrigin,
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
