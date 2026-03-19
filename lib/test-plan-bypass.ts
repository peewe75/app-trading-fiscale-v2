type PaymentReference = {
  stripe_session_id?: string | null
  stripe_payment_intent_id?: string | null
}

export const TEST_PLAN_BYPASS_PREFIX = 'test_bypass_'

export function isTestPlanBypassEnabled() {
  return process.env.ENABLE_TEST_PLAN_BYPASS === 'true'
}

export function getTestBypassReference(userId: string) {
  return `${TEST_PLAN_BYPASS_PREFIX}${userId}`
}

export function isTestBypassPayment(payment: PaymentReference | null | undefined) {
  if (!payment) {
    return false
  }

  return [payment.stripe_session_id, payment.stripe_payment_intent_id].some(reference =>
    reference?.startsWith(TEST_PLAN_BYPASS_PREFIX)
  )
}
