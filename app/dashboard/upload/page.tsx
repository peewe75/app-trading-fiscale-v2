import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { UploadClient } from '@/components/upload/upload-client'
import { getAllowedYears } from '@/lib/plans'
import { getCurrentUserRecord } from '@/lib/user-record'

export default async function UploadPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const user = await getCurrentUserRecord()

  if (!user?.plan) redirect('/checkout')

  return <UploadClient allowedYears={getAllowedYears(user.plan)} plan={user.plan} />
}
