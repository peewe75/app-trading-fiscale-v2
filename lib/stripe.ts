import Stripe from 'stripe'

function getStripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY non configurata')
  }

  return new Stripe(secretKey)
}

export async function createCheckoutSession(
  clerkUserId: string,
  priceId: string,
  plan: string,
  appUrl: string
): Promise<string> {
  const stripe = getStripe()
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/checkout/success`,
    cancel_url: `${appUrl}/checkout`,
    metadata: {
      clerk_user_id: clerkUserId,
      plan,
    },
    // Abilita fatturazione automatica (utile per utenti italiani)
    invoice_creation: { enabled: true },
    // Raccoglie email per la fattura
    customer_creation: 'always',
  })

  return session.url!
}
