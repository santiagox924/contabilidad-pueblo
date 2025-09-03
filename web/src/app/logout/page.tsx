// src/app/logout/page.tsx  (o la ruta que uses)
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { clearToken } from '@/lib/auth-client'

export default function LogoutPage() {
  const router = useRouter()

  useEffect(() => {
    clearToken()
    router.replace('/login')
  }, [router])

  return <p className="p-6">Cerrando sesión…</p>
}
