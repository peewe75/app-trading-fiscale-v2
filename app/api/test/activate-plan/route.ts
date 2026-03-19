import { auth } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { PLAN_DETAILS } from '@/lib/plans'
import { createSupabaseServiceClient } from '@/lib/supabase'
import { getCurrentUserRecord } from '@/lib/user-record'
import { getTestBypassReference, isTestPlanBypassEnabled } from '@/lib/test-plan-bypass'

export async function POST() {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Utente non autenticato' }, { status: 401 })
  }

  if (!isTestPlanBypassEnabled()) {
    return NextResponse.json({ error: 'Bypass test non disponibile' }, { status: 403 })
  }

  const user = await getCurrentUserRecord()

  if (!user) {
    return NextResponse.json({ error: 'Impossibile creare il profilo utente' }, { status: 500 })
  }

  const supabase = createSupabaseServiceClient()
  const paymentReference = getTestBypassReference(userId)

  const { error: updateUserError } = await supabase
    .from('users')
    .update({
      plan: 'pro',
      reports_used: 0,
    })
    .eq('id', user.id)

  if (updateUserError) {
    return NextResponse.json({ error: 'Aggiornamento piano non riuscito' }, { status: 500 })
  }

  const { error: deletePaymentError } = await supabase
    .from('payments')
    .delete()
    .eq('stripe_session_id', paymentReference)

  if (deletePaymentError) {
    return NextResponse.json({ error: 'Pulizia pagamento test non riuscita' }, { status: 500 })
  }

  const { error: insertPaymentError } = await supabase.from('payments').insert({
    user_id: user.id,
    stripe_session_id: paymentReference,
    stripe_payment_intent_id: paymentReference,
    plan: 'pro',
    amount_cents: PLAN_DETAILS.pro.priceCents,
    status: 'succeeded',
  })

  if (insertPaymentError) {
    return NextResponse.json({ error: 'Registrazione pagamento test non riuscita' }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    plan: 'pro',
    redirectTo: '/dashboard/upload',
  })
}
