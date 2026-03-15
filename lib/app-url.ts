import { headers } from 'next/headers'
import type { NextRequest } from 'next/server'

export async function getAppUrlFromHeaders() {
  const requestHeaders = await headers()
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')

  if (!host) {
    throw new Error('Host header non disponibile')
  }

  const protocol = requestHeaders.get('x-forwarded-proto') ?? (host.includes('localhost') ? 'http' : 'https')

  return `${protocol}://${host}`
}

export function getAppUrlFromRequest(req: NextRequest) {
  return req.nextUrl.origin
}
