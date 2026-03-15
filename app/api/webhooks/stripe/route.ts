import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createSupabaseServiceClient } from '@/lib/supabase'

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY non configurata')
  }

  return new Stripe(secretKey)
}

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: Stripe.Event
  try {
    const stripe = getStripe()
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Firma webhook non valida' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const clerkUserId = session.metadata?.clerk_user_id
    const plan = session.metadata?.plan

    if (!clerkUserId || !plan) {
      return NextResponse.json({ error: 'Metadata mancanti' }, { status: 400 })
    }

    const supabase = createSupabaseServiceClient()
    const { data: user } = await supabase
      .from('users')
      .upsert(
        {
          clerk_id: clerkUserId,
          email: session.customer_email ?? '',
          plan,
        },
        { onConflict: 'clerk_id' }
      )
      .select('id')
      .single()

    await supabase.from('payments').insert({
      user_id: user?.id ?? null,
      stripe_session_id: session.id,
      stripe_payment_intent_id: session.payment_intent as string,
      plan,
      amount_cents: session.amount_total ?? 0,
      status: 'succeeded',
    })
  }

  return NextResponse.json({ received: true })
}
