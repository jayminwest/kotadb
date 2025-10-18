'use client'

import { useAuth } from '@/context/AuthContext'
import { useState, useEffect } from 'react'

export default function RateLimitStatus() {
  const { rateLimitInfo, isAuthenticated } = useAuth()
  const [timeRemaining, setTimeRemaining] = useState<string>('')

  useEffect(() => {
    if (!rateLimitInfo) return

    const updateTimeRemaining = () => {
      const now = Math.floor(Date.now() / 1000)
      const seconds = Math.max(0, rateLimitInfo.reset - now)

      if (seconds <= 0) {
        setTimeRemaining('Quota reset')
        return
      }

      const minutes = Math.floor(seconds / 60)
      const remainingSeconds = seconds % 60

      if (minutes > 0) {
        setTimeRemaining(`${minutes}m ${remainingSeconds}s`)
      } else {
        setTimeRemaining(`${remainingSeconds}s`)
      }
    }

    updateTimeRemaining()
    const interval = setInterval(updateTimeRemaining, 1000)

    return () => clearInterval(interval)
  }, [rateLimitInfo])

  if (!isAuthenticated || !rateLimitInfo) {
    return null
  }

  const percentage = (rateLimitInfo.remaining / rateLimitInfo.limit) * 100
  const isLow = percentage < 20
  const isCritical = percentage < 10

  return (
    <div className="hidden md:flex items-center space-x-3">
      <div className="flex flex-col text-right">
        <div className="text-xs text-gray-600 dark:text-gray-400">
          Rate Limit
        </div>
        <div className={`text-sm font-medium ${
          isCritical
            ? 'text-red-600 dark:text-red-400'
            : isLow
            ? 'text-yellow-600 dark:text-yellow-400'
            : 'text-gray-900 dark:text-gray-100'
        }`}>
          {rateLimitInfo.remaining} / {rateLimitInfo.limit}
        </div>
      </div>

      <div className="w-24">
        <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all ${
              isCritical
                ? 'bg-red-600'
                : isLow
                ? 'bg-yellow-600'
                : 'bg-green-600'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {timeRemaining && (
          <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 text-center">
            {timeRemaining}
          </div>
        )}
      </div>
    </div>
  )
}
