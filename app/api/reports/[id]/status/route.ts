import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId, sessionClaims } = await auth()
  if (!userId) return NextResponse.json({ error: 'Non autenticato' }, { status: 401 })

  const { id } = await params
  const supabase = createSupabaseServiceClient()
  const { data: report } = await supabase
    .from('reports')
    .select('status, net_profit, tax_due, users(clerk_id)')
    .eq('id', id)
    .single()
  const typedReport = report as
    | {
        status: 'processing' | 'ready' | 'error'
        net_profit: number | null
        tax_due: number | null
        users?: { clerk_id?: string }[] | { clerk_id?: string } | null
      }
    | null

  if (!typedReport) {
    return NextResponse.json({ error: 'Report non trovato' }, { status: 404 })
  }

  const isAdmin = (sessionClaims?.metadata as Record<string, string>)?.role === 'admin'
  const ownerClerkId = Array.isArray(typedReport.users) ? typedReport.users[0]?.clerk_id : typedReport.users?.clerk_id
  const isOwner = ownerClerkId === userId

  if (!isAdmin && !isOwner) {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  }

  return NextResponse.json({
    status: typedReport.status,
    net_profit: typedReport.net_profit,
    tax_due: typedReport.tax_due,
  })
}
