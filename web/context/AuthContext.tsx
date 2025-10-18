'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number
}

interface AuthContextType {
  apiKey: string | null
  setApiKey: (key: string | null) => void
  rateLimitInfo: RateLimitInfo | null
  updateRateLimitInfo: (headers: Headers) => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null)
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null)

  // Load API key from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('kotadb_api_key')
    if (stored) {
      setApiKeyState(stored)
    }
  }, [])

  const setApiKey = (key: string | null) => {
    if (key) {
      localStorage.setItem('kotadb_api_key', key)
    } else {
      localStorage.removeItem('kotadb_api_key')
    }
    setApiKeyState(key)
  }

  const updateRateLimitInfo = (headers: Headers) => {
    const limit = headers.get('X-RateLimit-Limit')
    const remaining = headers.get('X-RateLimit-Remaining')
    const reset = headers.get('X-RateLimit-Reset')

    if (limit && remaining && reset) {
      setRateLimitInfo({
        limit: parseInt(limit, 10),
        remaining: parseInt(remaining, 10),
        reset: parseInt(reset, 10),
      })
    }
  }

  return (
    <AuthContext.Provider
      value={{
        apiKey,
        setApiKey,
        rateLimitInfo,
        updateRateLimitInfo,
        isAuthenticated: !!apiKey,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
