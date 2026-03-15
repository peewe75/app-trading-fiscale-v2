import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== process.env.INTERNAL_CALLBACK_SECRET) {
    return NextResponse.json({ error: 'Secret non valido' }, { status: 401 })
  }

  const body = (await req.json()) as {
    blob_key?: string
    net_profit?: number
    tax_due?: number
    status?: 'processing' | 'ready' | 'error'
  }

  const { id } = await params
  const supabase = createSupabaseServiceClient()
  const { data: currentReport } = await supabase
    .from('reports')
    .select('id, user_id, status')
    .eq('id', id)
    .single()

  if (!currentReport) {
    return NextResponse.json({ error: 'Report non trovato' }, { status: 404 })
  }

  const nextStatus = body.status ?? 'ready'
  const { error: reportError } = await supabase
    .from('reports')
    .update({
      blob_key: body.blob_key ?? '',
      net_profit: body.net_profit ?? null,
      tax_due: body.tax_due ?? null,
      status: nextStatus,
    })
    .eq('id', id)

  if (reportError) {
    return NextResponse.json({ error: reportError.message }, { status: 500 })
  }

  if (currentReport.status !== 'ready' && nextStatus === 'ready') {
    const { data: reportOwner } = await supabase
      .from('users')
      .select('reports_used')
      .eq('id', currentReport.user_id)
      .single()

    await supabase
      .from('users')
      .update({ reports_used: (reportOwner?.reports_used ?? 0) + 1 })
      .eq('id', currentReport.user_id)
  }

  return NextResponse.json({ success: true })
}
