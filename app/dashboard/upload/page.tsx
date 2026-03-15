import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { UploadClient } from '@/components/upload/upload-client'
import { getAllowedYears } from '@/lib/plans'
import { createSupabaseServiceClient } from '@/lib/supabase'

export default async function UploadPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const supabase = createSupabaseServiceClient()
  const { data: user } = await supabase
    .from('users')
    .select('plan')
    .eq('clerk_id', userId)
    .single()

  if (!user?.plan) redirect('/checkout')

  return <UploadClient allowedYears={getAllowedYears(user.plan)} plan={user.plan} />
}
