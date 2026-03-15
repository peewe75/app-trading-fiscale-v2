import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { getBlob } from '@/lib/blobs'
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
    .select('*, users(clerk_id)')
    .eq('id', id)
    .single()
  const typedReport = report as
    | {
        year: number
        status: 'processing' | 'ready' | 'error'
        blob_key: string
        users?: { clerk_id?: string }[] | { clerk_id?: string } | null
      }
    | null

  if (!typedReport) return NextResponse.json({ error: 'Report non trovato' }, { status: 404 })

  const isAdmin = (sessionClaims?.metadata as Record<string, string>)?.role === 'admin'
  const ownerClerkId = Array.isArray(typedReport.users) ? typedReport.users[0]?.clerk_id : typedReport.users?.clerk_id
  const isOwner = ownerClerkId === userId

  if (!isOwner && !isAdmin) {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  }

  if (typedReport.status !== 'ready') {
    return NextResponse.json({ error: 'Report non ancora disponibile' }, { status: 400 })
  }

  const pdfBuffer = await getBlob(typedReport.blob_key)
  if (!pdfBuffer) return NextResponse.json({ error: 'File non trovato' }, { status: 404 })

  return new NextResponse(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="report-fiscale-${typedReport.year}-${id}.pdf"`,
    },
  })
}
