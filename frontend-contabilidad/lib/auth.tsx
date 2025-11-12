'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import Cookies from 'js-cookie'
import { USER_ROLES, type UserRoleCode } from './roles'

type AuthUser = { id: number | null; email: string; roles: UserRoleCode[] } | null

type AuthContextType = {
  user: AuthUser
  setUser: (u: AuthUser) => void
  logout: () => void
  ready: boolean
  hasRole: (...roles: UserRoleCode[]) => boolean
  hasAnyRole: (roles: UserRoleCode[]) => boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser>(null)
  const [ready, setReady] = useState(false)

  const parseRoles = (raw?: string | null): UserRoleCode[] => {
    if (!raw) return []
    const valid = Object.values(USER_ROLES)
    return raw
      .split(',')
      .map((r) => r.trim())
      .filter((r): r is UserRoleCode => valid.includes(r as UserRoleCode))
  }

  // Leer cookies 1 sola vez al montar (evita parpadeos/loops)
  useEffect(() => {
    try {
      const token = Cookies.get('token')
      const email = Cookies.get('email')
      const idRaw = Cookies.get('userId')
      const rolesRaw = Cookies.get('roles')
      const id = idRaw ? Number(idRaw) : undefined
      const roles = parseRoles(rolesRaw)
      if (token && email && typeof id === 'number' && Number.isFinite(id)) {
        setUser({ id, email, roles })
      }
    } finally {
      setReady(true)
    }
  }, [])

  function logout() {
    Cookies.remove('token', { path: '/' })
    Cookies.remove('email', { path: '/' })
    Cookies.remove('userId', { path: '/' })
    Cookies.remove('roles', { path: '/' })
    setUser(null)
    // mejor replace para no dejar historial
    window.location.replace('/login')
  }

  const hasRole = (...roles: UserRoleCode[]) => {
    if (!user?.roles) return false
    if (roles.length === 0) return true
    const current = new Set(user.roles)
    return roles.every((r) => current.has(r))
  }

  const hasAnyRole = (roles: UserRoleCode[]) => {
    if (!user?.roles) return false
    if (!roles || roles.length === 0) return true
    const current = new Set(user.roles)
    return roles.some((r) => current.has(r))
  }

  const value: AuthContextType = { user, setUser, logout, ready, hasRole, hasAnyRole }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
