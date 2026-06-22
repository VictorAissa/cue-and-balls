import { createContext } from 'react'

export type RegisteredIdentity = {
  email: string
  username: string
}

export type AuthContextValue = {
  accessToken: string | null
  isAuthenticated: boolean
  registeredIdentity: RegisteredIdentity | null
  completeRegistration: (identity: RegisteredIdentity) => void
  completeLogin: (accessToken: string) => void
  logout: () => void
}

export const ACCESS_TOKEN_KEY = 'accessToken'
export const REGISTERED_IDENTITY_KEY = 'registeredIdentity'

export const AuthContext = createContext<AuthContextValue | null>(null)

