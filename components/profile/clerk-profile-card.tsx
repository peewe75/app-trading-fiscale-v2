'use client'

import { UserProfile } from '@clerk/nextjs'

export function ClerkProfileCard() {
  return (
    <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white p-2">
      <UserProfile />
    </div>
  )
}
