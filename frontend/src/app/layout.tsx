import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RTI v2 — Redteam Intelligence',
  description: 'Pentest & Redteam Management Platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body>{children}</body>
    </html>
  )
}
