'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
<<<<<<< HEAD
import { createClient } from '@/lib/supabase'
import type { Session, User } from '@supabase/supabase-js'
import type { CurrentSubscriptionResponse } from '@shared/types/api'
=======
>>>>>>> origin/main

interface RateLimitInfo {
  limit: number
  remaining: number
  reset: number
}

<<<<<<< HEAD
type Subscription = NonNullable<CurrentSubscriptionResponse['subscription']>

interface AuthContextType {
  session: Session | null
  user: User | null
  subscription: Subscription | null
  isLoading: boolean
=======
interface AuthContextType {
>>>>>>> origin/main
  apiKey: string | null
  setApiKey: (key: string | null) => void
  rateLimitInfo: RateLimitInfo | null
  updateRateLimitInfo: (headers: Headers) => void
  isAuthenticated: boolean
<<<<<<< HEAD
  signOut: () => Promise<void>
  refreshSubscription: () => Promise<void>
=======
>>>>>>> origin/main
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
<<<<<<< HEAD
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [apiKey, setApiKeyState] = useState<string | null>(null)
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null)
  const supabase = createClient()

  // Fetch subscription data from backend
  const fetchSubscription = async (userSession: Session) => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
      const response = await fetch(`${apiUrl}/api/subscriptions/current`, {
        headers: {
          Authorization: `Bearer ${userSession.access_token}`,
        },
      })

      if (response.ok) {
        const data: CurrentSubscriptionResponse = await response.json()
        setSubscription(data.subscription)
      } else {
        setSubscription(null)
      }
    } catch (error) {
      console.error('Error fetching subscription:', error)
      setSubscription(null)
    }
  }

  // Load API key from localStorage on mount (for backwards compatibility)
=======
  const [apiKey, setApiKeyState] = useState<string | null>(null)
  const [rateLimitInfo, setRateLimitInfo] = useState<RateLimitInfo | null>(null)

  // Load API key from localStorage on mount
>>>>>>> origin/main
  useEffect(() => {
    const stored = localStorage.getItem('kotadb_api_key')
    if (stored) {
      setApiKeyState(stored)
    }
  }, [])

<<<<<<< HEAD
  // Initialize session and subscribe to auth changes
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session) {
        fetchSubscription(session)
      }
      setIsLoading(false)
    })

    const {
      data: { subscription: authSubscription },
    } = supabase.auth.onAuthStateChange((_event: string, currentSession: Session | null) => {
      setSession(currentSession)
      setUser(currentSession?.user ?? null)
      if (currentSession) {
        fetchSubscription(currentSession)
      } else {
        setSubscription(null)
      }
    })

    return () => authSubscription.unsubscribe()
  }, [supabase.auth])

=======
>>>>>>> origin/main
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

<<<<<<< HEAD
  const signOut = async () => {
    await supabase.auth.signOut()
    setApiKey(null)
    setRateLimitInfo(null)
  }

  const refreshSubscription = async () => {
    if (session) {
      await fetchSubscription(session)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        subscription,
        isLoading,
=======
  return (
    <AuthContext.Provider
      value={{
>>>>>>> origin/main
        apiKey,
        setApiKey,
        rateLimitInfo,
        updateRateLimitInfo,
<<<<<<< HEAD
        isAuthenticated: !!session,
        signOut,
        refreshSubscription,
=======
        isAuthenticated: !!apiKey,
>>>>>>> origin/main
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
