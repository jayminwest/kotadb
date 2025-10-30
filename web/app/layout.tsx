import type { Metadata } from 'next'
import './globals.css'
import { AuthProvider } from '@/context/AuthContext'
import Navigation from '@/components/Navigation'
<<<<<<< HEAD
import { Analytics } from '@vercel/analytics/next'
import { SpeedInsights } from '@vercel/speed-insights/next'
=======
>>>>>>> origin/main

export const metadata: Metadata = {
  title: 'KotaDB - Code Intelligence Platform',
  description: 'Search and index code repositories with KotaDB',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>
          <div className="min-h-screen flex flex-col">
            <Navigation />
            <main className="flex-1 container mx-auto px-4 py-8">
              {children}
            </main>
            <footer className="border-t border-gray-200 dark:border-gray-800 py-6">
              <div className="container mx-auto px-4 text-center text-sm text-gray-600 dark:text-gray-400">
                KotaDB v0.1.0 - Code Intelligence Platform
              </div>
            </footer>
          </div>
        </AuthProvider>
<<<<<<< HEAD
        <Analytics />
        <SpeedInsights />
=======
>>>>>>> origin/main
      </body>
    </html>
  )
}
