import { auth } from '@clerk/nextjs/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export function createSupabaseClient(accessToken?: () => Promise<string | null>) {
  return createClient(supabaseUrl, supabaseAnonKey, {
    accessToken,
  })
}

// Client autenticato con il token di sessione Clerk.
export async function createSupabaseServerClient() {
  const session = await auth()

  return createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => session.getToken(),
  })
}

// Client con service role (bypass RLS, solo per webhook e operazioni admin)
export function createSupabaseServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}
