import { auth, currentUser } from '@clerk/nextjs/server'
import { createSupabaseServiceClient } from '@/lib/supabase'
import type { UserRecord } from '@/types'

function getFallbackEmail(userId: string) {
  return `${userId}@users.app-trading-fiscale.local`
}

export async function getCurrentUserRecord() {
  const [{ userId }, clerkUser] = await Promise.all([auth(), currentUser()])

  if (!userId) {
    return null
  }

  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    getFallbackEmail(userId)

  const supabase = createSupabaseServiceClient()
  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        clerk_id: userId,
        email,
      },
      { onConflict: 'clerk_id' }
    )
    .select('*')
    .single()

  if (error) {
    throw new Error(`Errore sincronizzazione utente Supabase: ${error.message}`)
  }

  return data as UserRecord
}
