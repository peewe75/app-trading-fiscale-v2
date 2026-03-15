import { calculateTax, generateReportPdf, parseHtmlReport } from '../../lib/report-engine'

interface NetlifyEvent {
  body: string | null
}

export const config = {
  path: '/api/calculate-background',
}

export const handler = async (event: NetlifyEvent) => {
  let reportId = ''

  try {
    const body = JSON.parse(event.body ?? '{}') as {
      html?: string
      year?: number
      reportId?: string
      userId?: string
      userName?: string
      userEmail?: string
      taxCode?: string
    }

    const htmlContent = body.html ?? ''
    const year = Number(body.year ?? new Date().getUTCFullYear() - 1)
    reportId = body.reportId ?? ''
    const userId = body.userId ?? ''
    const userName = body.userName ?? body.userEmail ?? 'Utente registrato'
    const taxCode = body.taxCode

    if (!htmlContent) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'HTML mancante' }),
      }
    }

    const { trades, balances } = parseHtmlReport(htmlContent)
    const results = calculateTax(trades, balances, year)
    const pdfBytes = await generateReportPdf({
      results,
      trades,
      balances,
      userName,
      taxCode,
    })
    const blobKey = `reports/${userId}/${reportId}.pdf`

    await uploadPdfToBlobs(blobKey, pdfBytes)
    await notifyCompletion(reportId, {
      blob_key: blobKey,
      net_profit: results.netProfit,
      tax_due: results.taxDue,
      status: 'ready',
    })

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        reportId,
        blobKey,
        results,
      }),
    }
  } catch (error) {
    if (reportId) {
      try {
        await notifyCompletion(reportId, { status: 'error' })
      } catch {
        // Evita di perdere l errore originario se anche il callback di fallback fallisce.
      }
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Errore sconosciuto',
      }),
    }
  }
}

async function uploadPdfToBlobs(blobKey: string, pdfBytes: Buffer) {
  const siteId = process.env.NETLIFY_SITE_ID
  const authToken = process.env.NETLIFY_AUTH_TOKEN
  const storeName = 'reports'

  if (!siteId || !authToken) {
    throw new Error('NETLIFY_SITE_ID o NETLIFY_AUTH_TOKEN mancanti')
  }

  const encodedKey = encodeURIComponent(blobKey)
  const response = await fetch(
    `https://api.netlify.com/api/v1/blobs/${siteId}/${storeName}/${encodedKey}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${authToken}`,
        'Content-Type': 'application/pdf',
      },
      body: new Uint8Array(pdfBytes),
    }
  )

  if (!response.ok) {
    throw new Error(`Upload PDF su Netlify Blobs fallito (${response.status})`)
  }
}

async function notifyCompletion(
  reportId: string,
  payload: {
    blob_key?: string
    net_profit?: number
    tax_due?: number
    status: 'ready' | 'error' | 'processing'
  }
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const secret = process.env.INTERNAL_CALLBACK_SECRET

  if (!appUrl || !secret) {
    throw new Error('NEXT_PUBLIC_APP_URL o INTERNAL_CALLBACK_SECRET mancanti')
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
