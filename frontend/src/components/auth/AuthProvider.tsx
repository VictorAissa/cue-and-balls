import { useState, type ReactNode } from 'react'
import {
  ACCESS_TOKEN_KEY,
  AuthContext,
  REGISTERED_IDENTITY_KEY,
  type RegisteredIdentity,
} from './authContext'

type AuthProviderProps = {
  children: ReactNode
}

function getStoredToken() {
  if (typeof window === 'undefined') {
    return null
  }

  return localStorage.getItem(ACCESS_TOKEN_KEY)
}

function getStoredIdentity() {
  if (typeof window === 'undefined') {
    return null
  }

  const storedIdentity = localStorage.getItem(REGISTERED_IDENTITY_KEY)
  if (!storedIdentity) {
    return null
  }

  try {
    return JSON.parse(storedIdentity) as RegisteredIdentity
  } catch {
    localStorage.removeItem(REGISTERED_IDENTITY_KEY)
    return null
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [accessToken, setAccessToken] = useState<string | null>(() => getStoredToken())
  const [registeredIdentity, setRegisteredIdentity] =
    useState<RegisteredIdentity | null>(() => getStoredIdentity())

  function completeRegistration(identity: RegisteredIdentity) {
    setRegisteredIdentity(identity)
    localStorage.setItem(REGISTERED_IDENTITY_KEY, JSON.stringify(identity))
  }

  function completeLogin(nextAccessToken: string) {
    setAccessToken(nextAccessToken)
    localStorage.setItem(ACCESS_TOKEN_KEY, nextAccessToken)
  }

  function logout() {
    setAccessToken(null)
    localStorage.removeItem(ACCESS_TOKEN_KEY)
  }

  return (
    <AuthContext.Provider
      value={{
        accessToken,
        isAuthenticated: accessToken !== null,
        registeredIdentity,
        completeRegistration,
        completeLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
