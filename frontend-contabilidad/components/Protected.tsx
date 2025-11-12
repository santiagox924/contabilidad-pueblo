'use client'
import { useAuth } from '@/lib/auth'
import { useEffect } from 'react'
import type { UserRoleCode } from '@/lib/roles'

type ProtectedProps = {
  children: React.ReactNode
  roles?: UserRoleCode[]
}

export default function Protected({ children, roles }: ProtectedProps) {
  const { user, ready, hasAnyRole } = useAuth()
  // Ejecuta el efecto siempre (no condicional) y deja que el efecto decida si redirigir
  useEffect(() => {
    const missingAuth = ready && !user
    const missingRole = roles && roles.length > 0 && !hasAnyRole(roles)
    if (missingAuth || missingRole) {
      // redirige solo cuando estamos seguros
      const next = encodeURIComponent(window.location.pathname || '/dashboard')
      window.location.replace(`/login?next=${next}`)
    }
  }, [ready, user, roles, hasAnyRole])

  // Mientras no hayamos leído cookies, no decidas
  if (!ready) return null

  if (!user) return null
  if (roles && roles.length > 0 && !hasAnyRole(roles)) return null
  return <>{children}</>
}
