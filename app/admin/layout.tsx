import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { userId, sessionClaims } = await auth()
  if (!userId) redirect('/sign-in')

  const role = (sessionClaims?.metadata as Record<string, string>)?.role
  if (role !== 'admin') redirect('/dashboard/upload')

  return (
    <div className="page-shell">
      <div className="page-grid items-start">
        <Sidebar area="admin" />
        <main className="flex-1">{children}</main>
      </div>
    </div>
  )
}
