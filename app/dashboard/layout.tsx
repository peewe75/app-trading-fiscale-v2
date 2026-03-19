import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'
import { getCurrentUserRecord } from '@/lib/user-record'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await getCurrentUserRecord()

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
