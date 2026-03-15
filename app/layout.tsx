import type { Metadata } from 'next'
import { ClerkProvider } from '@clerk/nextjs'
import { Manrope, Newsreader } from 'next/font/google'
import './globals.css'

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-sans',
})

const newsreader = Newsreader({
  subsets: ['latin'],
  variable: '--font-display',
})

const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_ZXhhbXBsZS5hY2NvdW50cy5kZXYk'

export const metadata: Metadata = {
  title: 'App Trading Fiscale',
  description: 'Elaborazione fiscale conti trading - Rendiconto per la dichiarazione dei redditi',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      afterSignInUrl="/dashboard/upload"
      afterSignUpUrl="/checkout"
    >
      <html lang="it">
        <body className={`${manrope.variable} ${newsreader.variable} font-sans`}>
          {children}
        </body>
      </html>
    </ClerkProvider>
  )
}
