import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { isYearAllowedForPlan, PLAN_DETAILS } from '@/lib/plans'
import { getAppUrlFromRequest } from '@/lib/app-url'
import { buildUploadBlobKey, saveTextBlob } from '@/lib/blobs'
import { getReportYears, parseHtmlReport } from '@/lib/report-engine'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getCurrentUserRecord } from '@/lib/user-record'
import type { Plan } from '@/types'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const user = await getCurrentUserRecord()
  const supabase = createSupabaseServiceClient()

  if (!user?.plan) {
    return NextResponse.json(
      { error: 'Nessun piano attivo. Completa prima il pagamento.' },
      { status: 403 }
    )
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  const year = Number(formData.get('year')) || new Date().getFullYear() - 1

  if (!file) return NextResponse.json({ error: 'File mancante.' }, { status: 400 })
  if (!file.name.match(/\.(htm|html)$/i)) {
    return NextResponse.json(
      { error: 'Formato non supportato. Carica un file .htm o .html.' },
      { status: 400 }
    )
  }

  const plan = user.plan as Plan

  if (!isYearAllowedForPlan(plan, year)) {
    return NextResponse.json(
      { error: 'Il piano attivo consente upload solo per anno corrente e precedente.' },
      { status: 403 }
    )
  }

  const maxReportsPerYear = PLAN_DETAILS[plan].maxReportsPerYear

  if (maxReportsPerYear !== null) {
    const { count } = await supabase
      .from('reports')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('year', year)
      .in('status', ['processing', 'ready'])

    if ((count ?? 0) >= maxReportsPerYear) {
      return NextResponse.json(
        {
          error: `Limite raggiunto per il piano ${plan}: massimo ${maxReportsPerYear} report per l anno fiscale ${year}.`,
        },
        { status: 403 }
      )
    }
  }

  const htmlContent = await file.text()
  const parsedReport = parseHtmlReport(htmlContent)
  const availableYears = getReportYears(parsedReport.trades, parsedReport.balances)

  if (availableYears.length > 0 && !availableYears.includes(year)) {
    return NextResponse.json(
      {
        error: `Il file caricato non contiene movimenti per il ${year}. Anni rilevati nel report: ${availableYears.join(', ')}.`,
      },
      { status: 400 }
    )
  }

  const { data: report, error: reportError } = await supabase
    .from('reports')
    .insert({
      user_id: user.id,
      filename: file.name,
      blob_key: '',
      plan,
      status: 'processing',
      year,
    })
    .select()
    .single()

  if (reportError || !report) {
    return NextResponse.json({ error: 'Errore in creazione report.' }, { status: 500 })
  }
  const htmlBlobKey = buildUploadBlobKey(user.id, report.id)

  try {
    await saveTextBlob(htmlBlobKey, htmlContent, 'text/html; charset=utf-8')

    const calcResponse = await fetch(
      `${getAppUrlFromRequest(req)}/api/calculate-background`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          reportId: report.id,
          userId: user.id,
          htmlBlobKey,
          userName: user.email,
          userEmail: user.email,
        }),
      }
    )

    if (!calcResponse.ok) {
      const responseText = await calcResponse.text()
      throw new Error(responseText || 'Errore nella funzione di calcolo')
    }
  } catch {
    await supabase.from('reports').update({ status: 'error' }).eq('id', report.id)

    return NextResponse.json({ error: 'Errore durante l elaborazione del report.' }, { status: 500 })
  }

  return NextResponse.json({ reportId: report.id })
}
