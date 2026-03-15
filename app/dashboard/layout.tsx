import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { createSupabaseServiceClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const supabase = createSupabaseServiceClient()
  const { data: user } = await supabase
    .from('users')
    .select('plan')
    .eq('clerk_id', userId)
    .single()

  if (!user?.plan) redirect('/checkout')

  return (
    <div className="page-shell">
      <div className="page-grid items-start">
        <Sidebar area="dashboard" plan={user.plan} />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
