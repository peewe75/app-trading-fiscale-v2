import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Necessario per Netlify
  output: 'standalone',
  experimental: {
    serverActions: {
      allowedOrigins: ['localhost:3000', process.env.NEXT_PUBLIC_APP_URL ?? ''],
    },
  },
}

export default nextConfig
