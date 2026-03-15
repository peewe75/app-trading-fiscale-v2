import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { createSupabaseServiceClient } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { sessionClaims } = await auth()
  const role = (sessionClaims?.metadata as Record<string, string>)?.role

  if (role !== 'admin') {
    return NextResponse.json({ error: 'Accesso negato' }, { status: 403 })
  }

  const { title, content } = await req.json()
  if (!title || !content) {
    return NextResponse.json({ error: 'Titolo e contenuto obbligatori' }, { status: 400 })
  }

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('news')
    .insert({ title, content, visible: true, published_at: new Date().toISOString() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
