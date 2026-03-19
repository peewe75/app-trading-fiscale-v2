import { auth, currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Sidebar } from '@/components/sidebar'

export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [{ userId }, user] = await Promise.all([auth(), currentUser()])
  if (!userId) redirect('/sign-in')

  const role = typeof user?.publicMetadata?.role === 'string' ? user.publicMetadata.role : null
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
