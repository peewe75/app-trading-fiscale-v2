import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client con chiave anonima (per operazioni lato client)
export function createSupabaseClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}

// Client con service role (per operazioni lato server, API routes)
export function createSupabaseServerClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}

// Client con service role (bypass RLS, solo per webhook e operazioni admin)
export function createSupabaseServiceClient() {
  return createClient(supabaseUrl, supabaseServiceKey)
}
